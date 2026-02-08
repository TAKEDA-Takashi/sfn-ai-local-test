import * as yaml from 'js-yaml'
import { HTTP_STATUS_OK, LAMBDA_VERSION_LATEST } from '../../constants/defaults'
import {
  isDistributedMap,
  isMap,
  isTask,
  type JsonObject,
  type JsonValue,
  type StateMachine,
} from '../../types/asl'
import { isJsonArray, isJsonObject } from '../../types/type-guards'
import { findStateByName, getAllStateNames } from '../utils/state-traversal'
import { autoFixMock, autoFixTest } from './auto-fixer'
import { findSimilarStateName } from './string-similarity'
import { formatReport as formatReportFn } from './validation-report'

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info'
  message: string
  line?: number
  suggestion?: string
}

/**
 * State machine validator with comprehensive validation for mocks and tests
 */
export class StateMachineValidator {
  /**
   * Validate generated mock content
   */
  validateMockContent(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)

      if (!isJsonObject(parsed)) {
        issues.push({
          level: 'error',
          message: 'Mock file must be a valid YAML object',
          suggestion: 'Ensure the YAML file contains a valid object structure',
        })
        return issues
      }

      if (!parsed.mocks) {
        issues.push({
          level: 'error',
          message: 'Mock file must contain "mocks" field',
          suggestion: 'Add "mocks:" field with an array of mock definitions',
        })
        return issues
      }

      if (!Array.isArray(parsed.mocks)) {
        issues.push({
          level: 'error',
          message: '"mocks" field must be an array',
          suggestion: 'Format as "mocks: []" with mock definitions inside',
        })
        return issues
      }

      if (!isJsonArray(parsed.mocks)) {
        return issues
      }

      // Duplicate check
      const mockStateNames = new Map<string, number>()
      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock)) continue
        const stateName = mock.state
        if (typeof stateName === 'string') {
          const count = mockStateNames.get(stateName) || 0
          mockStateNames.set(stateName, count + 1)
        }
      }
      for (const [stateName, count] of mockStateNames) {
        if (count > 1) {
          issues.push({
            level: 'error',
            message: `Duplicate mock definitions for state "${stateName}" (found ${count} times)`,
            suggestion:
              'Each state should have only one mock definition. For DistributedMap states, use type: "itemReader" only.',
          })
        }
      }

      // Inline Lambda validation
      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock) || typeof mock.state !== 'string') continue
        const state = findStateByName(stateMachine, mock.state)
        const resource = state && isTask(state) ? state.Resource : null

        if (resource && typeof resource === 'string' && resource.includes('lambda:invoke')) {
          if (
            'response' in mock &&
            mock.response &&
            isJsonObject(mock.response) &&
            !mock.response.Payload
          ) {
            issues.push({
              level: 'error',
              message: `Lambda mock for "${mock.state}" missing Payload wrapper`,
              suggestion: 'Wrap response in { Payload: {...}, StatusCode: 200 }',
            })
          }
          if (
            'response' in mock &&
            mock.response &&
            isJsonObject(mock.response) &&
            !mock.response.StatusCode
          ) {
            issues.push({
              level: 'warning',
              message: `Lambda mock for "${mock.state}" missing StatusCode`,
              suggestion: 'Add StatusCode: 200',
            })
          }
        }
      }

      // Conditional Lambda validation
      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock) || mock.type !== 'conditional') continue
        const state = findStateByName(
          stateMachine,
          typeof mock.state === 'string' ? mock.state : '',
        )
        const resource = state && isTask(state) ? state.Resource : null

        if (mock.conditions && isJsonArray(mock.conditions)) {
          for (const condition of mock.conditions) {
            if (!isJsonObject(condition)) continue
            if (
              condition.when &&
              isJsonObject(condition.when) &&
              condition.when.input &&
              resource &&
              typeof resource === 'string' &&
              resource.includes('lambda:invoke')
            ) {
              if (isJsonObject(condition.when.input) && !condition.when.input.Payload) {
                issues.push({
                  level: 'error',
                  message: `Conditional mock for Lambda "${mock.state}" MUST use input.Payload structure`,
                  suggestion: 'Wrap condition in { input: { Payload: {...} } }',
                })
              }
            }
          }
        }
      }

      // State-aware validations using already-parsed data
      issues.push(...this.checkStateExistence(parsed, stateMachine))
      issues.push(...this.checkMapStates(parsed, stateMachine))
      issues.push(...this.checkLambdaStructure(parsed, stateMachine))
    } catch (error) {
      issues.push({
        level: 'error',
        message: `Failed to parse YAML: ${error}`,
        suggestion: 'Check YAML syntax',
      })
    }

    return issues
  }

  /**
   * Validate generated test content
   */
  validateTestContent(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)

      if (!isJsonObject(parsed)) {
        issues.push({
          level: 'error',
          message: 'Test file must be a valid YAML object',
          suggestion: 'Ensure the YAML file contains a valid object structure',
        })
        return issues
      }

      const checkOutputMatching = (obj: JsonObject, path: string = '') => {
        if (typeof obj !== 'object' || obj === null) return

        for (const [key, value] of Object.entries(obj)) {
          if (key === 'outputMatching' && value === 'exact') {
            issues.push({
              level: 'warning',
              message: `Found outputMatching: "exact" at ${path}.${key}`,
              suggestion:
                'Change to outputMatching: "partial" to avoid test failures with dynamic values',
            })
          }

          if (isJsonObject(value)) {
            checkOutputMatching(value, path ? `${path}.${key}` : key)
          }
        }
      }

      checkOutputMatching(parsed)

      if (parsed.testCases && isJsonArray(parsed.testCases)) {
        for (const testCase of parsed.testCases) {
          if (
            isJsonObject(testCase) &&
            testCase.expectedOutput &&
            isJsonObject(testCase.expectedOutput)
          ) {
            const suspiciousKeys = Object.keys(testCase.expectedOutput).filter((key) =>
              key.match(
                /^(counter|total|sum|index|status|type|userType|.*Type|.*Status|.*Count)$/i,
              ),
            )

            if (suspiciousKeys.length > 0) {
              issues.push({
                level: 'warning',
                message: `Test "${testCase.name}" has suspicious keys in expectedOutput: ${suspiciousKeys.join(', ')}`,
                suggestion:
                  'If these are Variables, move them to stateExpectations.variables instead',
              })
            }
          }
        }
      }

      const checkForTimestamps = (obj: JsonObject, path: string = '') => {
        if (typeof obj !== 'object' || obj === null) return

        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
            issues.push({
              level: 'error',
              message: `Found hardcoded timestamp at ${path}.${key}: "${value}"`,
              suggestion: 'Remove timestamp expectations or use partial matching',
            })
          }

          if (isJsonObject(value)) {
            checkForTimestamps(value, path ? `${path}.${key}` : key)
          }
        }
      }

      if (parsed.testCases && isJsonArray(parsed.testCases)) {
        for (const testCase of parsed.testCases) {
          if (isJsonObject(testCase)) {
            if (testCase.expectedOutput && isJsonObject(testCase.expectedOutput)) {
              checkForTimestamps(
                testCase.expectedOutput,
                `testCase[${testCase.name}].expectedOutput`,
              )
            }
            if (testCase.stateExpectations && isJsonObject(testCase.stateExpectations)) {
              checkForTimestamps(
                testCase.stateExpectations,
                `testCase[${testCase.name}].stateExpectations`,
              )
            }
          }
        }
      }

      // State-aware validations using already-parsed data
      issues.push(...this.checkTestStateReferences(parsed, stateMachine))
    } catch (error) {
      issues.push({
        level: 'error',
        message: `Failed to parse YAML: ${error}`,
        suggestion: 'Check YAML syntax',
      })
    }

    return issues
  }

  // --- Public API wrappers (for direct test access) ---

  validateStateExistence(content: string, stateMachine: StateMachine): ValidationIssue[] {
    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return []
      return this.checkStateExistence(parsed, stateMachine)
    } catch (_error) {
      return []
    }
  }

  validateMapStates(content: string, stateMachine: StateMachine): ValidationIssue[] {
    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return []
      return this.checkMapStates(parsed, stateMachine)
    } catch (_error) {
      return []
    }
  }

  validateLambdaStructure(content: string, stateMachine: StateMachine): ValidationIssue[] {
    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return []
      return this.checkLambdaStructure(parsed, stateMachine)
    } catch (_error) {
      return []
    }
  }

  validateTestStateReferences(content: string, stateMachine: StateMachine): ValidationIssue[] {
    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return []
      return this.checkTestStateReferences(parsed, stateMachine)
    } catch (_error) {
      return []
    }
  }

  // --- Delegate methods for backward compatibility ---

  formatReport(issues: ValidationIssue[]): string {
    return formatReportFn(issues)
  }

  autoFix(content: string, type: 'test' | 'mock', stateMachine: StateMachine): string {
    return type === 'mock' ? autoFixMock(content, stateMachine) : autoFixTest(content)
  }

  // --- Internal validation methods (operate on parsed objects) ---

  private checkStateExistence(parsed: JsonObject, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!(parsed.mocks && isJsonArray(parsed.mocks))) {
      return issues
    }

    const availableStates = getAllStateNames(stateMachine)

    for (const mock of parsed.mocks) {
      if (!isJsonObject(mock) || typeof mock.state !== 'string') continue
      if (!availableStates.includes(mock.state)) {
        const suggestion = findSimilarStateName(mock.state, availableStates)

        issues.push({
          level: 'error',
          message: `State "${mock.state}" does not exist in the state machine`,
          suggestion: suggestion
            ? `Did you mean "${suggestion}"?`
            : `Available states: ${availableStates.join(', ')}`,
        })
      }
    }

    return issues
  }

  private checkMapStates(parsed: JsonObject, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!(parsed.mocks && isJsonArray(parsed.mocks))) {
      return issues
    }

    for (const mock of parsed.mocks) {
      if (!isJsonObject(mock)) continue

      const state = findStateByName(stateMachine, typeof mock.state === 'string' ? mock.state : '')

      if (state && isMap(state)) {
        // Special case: DistributedMap with ResultWriter returns metadata object
        if (isDistributedMap(state) && state.ResultWriter) {
          // Skip array validation for this case
        } else {
          if (mock.response && !Array.isArray(mock.response)) {
            const stateType = isDistributedMap(state) ? 'DistributedMap' : 'Map'
            issues.push({
              level: 'error',
              message: `${stateType} state "${mock.state}" must return an array`,
              suggestion: `Change response to an array of results. Example:\nresponse:\n  - item1Result\n  - item2Result`,
            })
          }
        }

        // For conditional mocks
        if (
          mock.type === 'conditional' &&
          mock.conditions &&
          isJsonArray(mock.conditions) &&
          !(isDistributedMap(state) && state.ResultWriter)
        ) {
          for (const condition of mock.conditions) {
            if (!isJsonObject(condition)) continue
            const response =
              'response' in condition
                ? condition.response
                : 'default' in condition
                  ? condition.default
                  : undefined
            if (response && !isJsonArray(response)) {
              const stateType = isDistributedMap(state) ? 'DistributedMap' : 'Map'
              issues.push({
                level: 'error',
                message: `${stateType} state "${mock.state}" conditional response must return an array`,
                suggestion:
                  'Each condition response should be an array for Map/DistributedMap states',
              })
            }
          }
        }

        // For stateful mocks
        if (
          mock.type === 'stateful' &&
          mock.responses &&
          Array.isArray(mock.responses) &&
          !(isDistributedMap(state) && state.ResultWriter)
        ) {
          for (let i = 0; i < mock.responses.length; i++) {
            if (!Array.isArray(mock.responses[i])) {
              const stateType = isDistributedMap(state) ? 'DistributedMap' : 'Map'
              issues.push({
                level: 'error',
                message: `${stateType} state "${mock.state}" stateful response #${i + 1} must return an array`,
                suggestion: 'All responses should be arrays for Map/DistributedMap states',
              })
            }
          }
        }
      }
    }

    return issues
  }

  private checkLambdaStructure(parsed: JsonObject, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!(parsed.mocks && isJsonArray(parsed.mocks))) {
      return issues
    }

    for (const mock of parsed.mocks) {
      if (!isJsonObject(mock)) continue
      const state = findStateByName(stateMachine, typeof mock.state === 'string' ? mock.state : '')

      const stateResource = state && isTask(state) ? state.Resource : null
      if (
        stateResource &&
        typeof stateResource === 'string' &&
        stateResource.includes('lambda:invoke')
      ) {
        if (mock.type === 'conditional' && 'conditions' in mock && isJsonArray(mock.conditions)) {
          for (const condition of mock.conditions) {
            if (!isJsonObject(condition)) continue
            if (
              condition.when &&
              isJsonObject(condition.when) &&
              condition.when.input &&
              isJsonObject(condition.when.input) &&
              !condition.when.input.Payload
            ) {
              const detailedMessage = this.formatLambdaError(
                typeof mock.state === 'string' ? mock.state : '',
                condition.when || null,
                condition.response || null,
              )

              issues.push({
                level: 'error',
                message: detailedMessage,
                suggestion: 'Fix the structure as shown in the "Required structure" example above',
              })
            }
          }
        }
      }
    }

    return issues
  }

  private checkTestStateReferences(
    parsed: JsonObject,
    stateMachine: StateMachine,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    const availableStates = getAllStateNames(stateMachine)

    if (parsed.testCases && isJsonArray(parsed.testCases)) {
      for (let i = 0; i < parsed.testCases.length; i++) {
        const testCase = parsed.testCases[i]
        if (!isJsonObject(testCase)) continue

        if (testCase.expectedPath && Array.isArray(testCase.expectedPath)) {
          for (const stateName of testCase.expectedPath) {
            if (typeof stateName === 'string' && !availableStates.includes(stateName)) {
              const suggestion = findSimilarStateName(stateName, availableStates)
              issues.push({
                level: 'error',
                message: `Test case #${i + 1}: State "${stateName}" in expectedPath does not exist`,
                suggestion: suggestion
                  ? `Did you mean "${suggestion}"?`
                  : `Available states: ${availableStates.slice(0, 5).join(', ')}...`,
              })
            }
          }
        }

        if (testCase.stateExpectations && isJsonArray(testCase.stateExpectations)) {
          for (const expectation of testCase.stateExpectations) {
            if (!isJsonObject(expectation)) continue
            if (
              expectation.state &&
              typeof expectation.state === 'string' &&
              !availableStates.includes(expectation.state)
            ) {
              const suggestion = findSimilarStateName(expectation.state, availableStates)
              issues.push({
                level: 'error',
                message: `Test case #${i + 1}: State "${expectation.state}" in stateExpectations does not exist`,
                suggestion: suggestion
                  ? `Did you mean "${suggestion}"?`
                  : `Available states: ${availableStates.slice(0, 5).join(', ')}...`,
              })
            }
          }
        }
      }
    }

    return issues
  }

  /**
   * Format detailed Lambda error message with structure comparison
   */
  private formatLambdaError(
    stateName: string,
    currentWhen: JsonValue | null,
    currentResponse: JsonValue | null,
  ): string {
    const currentStructure = {
      when: currentWhen,
      response: currentResponse,
    }

    return `
Lambda mock structure error in "${stateName}"

Your current structure:
${yaml.dump(currentStructure, { indent: 2 })}
Required structure:
when:
  input:
    Payload:  # <-- MISSING in your structure!
      userId: "value"
response:
  Payload:     # <-- Required for Lambda!
    result: "..."
  StatusCode: ${HTTP_STATUS_OK}
  ExecutedVersion: "${LAMBDA_VERSION_LATEST}"

The 'Payload' wrapper is REQUIRED for Lambda invoke tasks.`
  }
}
