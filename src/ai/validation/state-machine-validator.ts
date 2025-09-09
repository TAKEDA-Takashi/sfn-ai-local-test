import * as yaml from 'js-yaml'
import { HTTP_STATUS_OK, LAMBDA_VERSION_LATEST } from '../../constants/defaults'
import type { JsonObject, JsonValue, State, StateMachine } from '../../types/asl'
import { isJsonArray, isJsonObject } from '../../types/type-guards'

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
   * Find a state by name (searches all contexts including nested)
   * Based on sfn-ai-local-test specification: nested states are referenced by name only
   */
  private findStateByPath(stateName: string, states: Record<string, State>): State | null {
    // Try direct match first
    if (states[stateName]) {
      return states[stateName]
    }

    // Search in nested contexts (Map/Parallel)
    for (const [_parentName, state] of Object.entries(states)) {
      // Check ItemProcessor states
      if (state.isMap() && state.ItemProcessor && state.ItemProcessor.States) {
        // ItemProcessor.States should already contain State instances
        // if the StateMachine was properly created with StateFactory.createStateMachine
        const nestedStates = state.ItemProcessor.States

        const found = this.findStateByPath(stateName, nestedStates)
        if (found) return found
      }

      // Check Parallel branches
      if (state.isParallel() && state.Branches) {
        const branches = state.Branches
        for (const branch of branches) {
          if (branch?.States) {
            // Branch.States should already contain State instances
            // if the StateMachine was properly created with StateFactory.createStateMachine
            const branchStates = branch.States

            const found = this.findStateByPath(stateName, branchStates)
            if (found) return found
          }
        }
      }
    }

    return null
  }

  /**
   * Get all state names including those in nested contexts (Map/Parallel)
   * Based on sfn-ai-local-test specification: nested states are referenced by name only
   */
  private getAllStateNames(states: Record<string, State>): string[] {
    const stateNames: string[] = []

    for (const [stateName, state] of Object.entries(states)) {
      stateNames.push(stateName)

      // Check for ItemProcessor in Map/DistributedMap states
      if (state.isMap() && state.ItemProcessor?.States) {
        // ItemProcessor.States should already contain State instances
        // if the StateMachine was properly created with StateFactory.createStateMachine
        const nestedStates = state.ItemProcessor.States

        // Add ItemProcessor states directly (nested states are referenced by name only)
        const itemProcessorStates = this.getAllStateNames(nestedStates)
        stateNames.push(...itemProcessorStates)
      }

      // Check for Parallel state branches
      if (state.isParallel() && state.Branches) {
        state.Branches.forEach((branch) => {
          if (branch.States) {
            // Branch.States should already contain State instances
            // if the StateMachine was properly created with StateFactory.createStateMachine
            const branchStates = branch.States

            const nestedBranchStates = this.getAllStateNames(branchStates)
            stateNames.push(...nestedBranchStates)
          }
        })
      }
    }

    return stateNames
  }

  /**
   * Validate generated mock content
   */
  validateMockContent(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)

      // Type check the parsed YAML
      if (!isJsonObject(parsed)) {
        issues.push({
          level: 'error',
          message: 'Mock file must be a valid YAML object',
          suggestion: 'Ensure the YAML file contains a valid object structure',
        })
        return issues
      }

      // State machine is already parsed JsonObject

      // Check if mocks field exists and is an array
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

      // Check for duplicate state names in mocks
      const mockStateNames = new Map<string, number>()
      if (!isJsonArray(parsed.mocks)) {
        return issues
      }
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

      // Check Lambda mock format
      if (parsed.mocks) {
        for (const mock of parsed.mocks) {
          if (!isJsonObject(mock) || typeof mock.state !== 'string') continue
          const state = this.findStateByPath(mock.state, stateMachine.States)
          const resource = state?.isTask() ? state.Resource : null

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

        // Check conditional mock format
        if (parsed.mocks && isJsonArray(parsed.mocks)) {
          for (const mock of parsed.mocks) {
            if (!isJsonObject(mock) || mock.type !== 'conditional') continue
            const state = this.findStateByPath(
              typeof mock.state === 'string' ? mock.state : '',
              stateMachine.States,
            )
            const resource = state?.isTask() ? state.Resource : null

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
                  // Check if input.Payload is used for Lambda
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
        }
      }
    } catch (error) {
      issues.push({
        level: 'error',
        message: `Failed to parse YAML: ${error}`,
        suggestion: 'Check YAML syntax',
      })
    }

    // Add state-aware validations
    issues.push(...this.validateStateExistence(content, stateMachine))
    issues.push(...this.validateMapStates(content, stateMachine))
    issues.push(...this.validateLambdaStructure(content, stateMachine))

    return issues
  }

  /**
   * Validate generated test content
   * Note: For runtime validation and automatic correction of test expectations,
   * use TestExecutionValidator instead. This method performs static validation only.
   */
  validateTestContent(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)

      // Type check the parsed YAML
      if (!isJsonObject(parsed)) {
        issues.push({
          level: 'error',
          message: 'Test file must be a valid YAML object',
          suggestion: 'Ensure the YAML file contains a valid object structure',
        })
        return issues
      }

      // Check for outputMatching: "exact"
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

      // Check for variables in expectedOutput (common mistake)
      if (parsed.testCases && isJsonArray(parsed.testCases)) {
        for (const testCase of parsed.testCases) {
          if (
            isJsonObject(testCase) &&
            testCase.expectedOutput &&
            isJsonObject(testCase.expectedOutput)
          ) {
            // Check if any expected output keys look like variable names
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

      // Check for timestamp expectations
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
    } catch (error) {
      issues.push({
        level: 'error',
        message: `Failed to parse YAML: ${error}`,
        suggestion: 'Check YAML syntax',
      })
    }

    // Add state-aware validations for test content
    issues.push(...this.validateTestStateReferences(content, stateMachine))
    issues.push(...this.validateLambdaJSONataOutputExpectations(content, stateMachine))

    return issues
  }

  /**
   * Validate that all mocked states exist in the state machine
   */
  validateStateExistence(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return issues

      if (!(parsed.mocks && isJsonArray(parsed.mocks))) {
        return issues
      }

      const availableStates = this.getAllStateNames(stateMachine.States)

      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock) || typeof mock.state !== 'string') continue
        // Check if state exists (including nested states)
        if (!availableStates.includes(mock.state)) {
          // Try to find similar state name
          const suggestion = this.findSimilarStateName(mock.state, availableStates)

          issues.push({
            level: 'error',
            message: `State "${mock.state}" does not exist in the state machine`,
            suggestion: suggestion
              ? `Did you mean "${suggestion}"?`
              : `Available states: ${availableStates.join(', ')}`,
          })
        }
      }
    } catch (_error) {
      // Ignore parsing errors - handled elsewhere
    }

    return issues
  }

  /**
   * Validate Map and DistributedMap states return arrays
   */
  validateMapStates(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return issues

      if (!(parsed.mocks && isJsonArray(parsed.mocks))) {
        return issues
      }

      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock)) continue
        const mockObj = mock

        // Find the state, supporting nested states
        const state = this.findStateByPath(
          typeof mockObj.state === 'string' ? mockObj.state : '',
          stateMachine.States,
        )

        if (state?.isMap()) {
          // Special case: DistributedMap with ResultWriter returns metadata object
          if (state.isDistributedMap() && state.ResultWriter) {
            // DistributedMap with ResultWriter returns metadata, not array
            // Skip array validation for this case
          } else {
            // Check if response is an array
            if (mockObj.response && !Array.isArray(mockObj.response)) {
              const stateType = state.isDistributedMap() ? 'DistributedMap' : 'Map'
              issues.push({
                level: 'error',
                message: `${stateType} state "${mockObj.state}" must return an array`,
                suggestion: `Change response to an array of results. Example:\nresponse:\n  - item1Result\n  - item2Result`,
              })
            }
          }

          // For conditional mocks, check each response (unless ResultWriter is present)
          if (
            mockObj.type === 'conditional' &&
            mockObj.conditions &&
            isJsonArray(mockObj.conditions) &&
            !(state.isDistributedMap() && state.ResultWriter)
          ) {
            for (const condition of mockObj.conditions) {
              if (!isJsonObject(condition)) continue
              const response =
                'response' in condition
                  ? condition.response
                  : 'default' in condition
                    ? condition.default
                    : undefined
              if (response && !isJsonArray(response)) {
                const stateType = state.isDistributedMap() ? 'DistributedMap' : 'Map'
                issues.push({
                  level: 'error',
                  message: `${stateType} state "${mockObj.state}" conditional response must return an array`,
                  suggestion:
                    'Each condition response should be an array for Map/DistributedMap states',
                })
              }
            }
          }

          // For stateful mocks, check each response (unless ResultWriter is present)
          if (
            mockObj.type === 'stateful' &&
            mockObj.responses &&
            Array.isArray(mockObj.responses) &&
            !(state.isDistributedMap() && state.ResultWriter)
          ) {
            for (let i = 0; i < mockObj.responses.length; i++) {
              if (!Array.isArray(mockObj.responses[i])) {
                const stateType = state.isDistributedMap() ? 'DistributedMap' : 'Map'
                issues.push({
                  level: 'error',
                  message: `${stateType} state "${mockObj.state}" stateful response #${i + 1} must return an array`,
                  suggestion: 'All responses should be arrays for Map/DistributedMap states',
                })
              }
            }
          }
        }
      }
    } catch (_error) {
      // Ignore parsing errors
    }

    return issues
  }

  /**
   * Lambda structure validation with detailed error messages
   */
  validateLambdaStructure(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return issues

      if (!(parsed.mocks && isJsonArray(parsed.mocks))) {
        return issues
      }

      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock)) continue
        const mockObj = mock
        const state = this.findStateByPath(
          typeof mockObj.state === 'string' ? mockObj.state : '',
          stateMachine.States,
        )

        const stateResource = state?.isTask() ? state.Resource : null
        if (
          stateResource &&
          typeof stateResource === 'string' &&
          stateResource.includes('lambda:invoke')
        ) {
          // Check conditional mocks
          if (
            mockObj.type === 'conditional' &&
            'conditions' in mockObj &&
            isJsonArray(mockObj.conditions)
          ) {
            for (const condition of mockObj.conditions) {
              if (!isJsonObject(condition)) continue
              if (
                condition.when &&
                isJsonObject(condition.when) &&
                condition.when.input &&
                isJsonObject(condition.when.input) &&
                !condition.when.input.Payload
              ) {
                const detailedMessage = this.formatLambdaError(
                  typeof mockObj.state === 'string' ? mockObj.state : '',
                  condition.when || null,
                  condition.response || null,
                )

                issues.push({
                  level: 'error',
                  message: detailedMessage,
                  suggestion:
                    'Fix the structure as shown in the "Required structure" example above',
                })
              }
            }
          }
        }
      }
    } catch (_error) {
      // Ignore parsing errors
    }

    return issues
  }

  /**
   * Validate state references in test content
   */
  validateTestStateReferences(content: string, stateMachine: StateMachine): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return issues

      const availableStates = this.getAllStateNames(stateMachine.States)

      // Check expectedPath
      if (parsed.testCases && isJsonArray(parsed.testCases)) {
        for (let i = 0; i < parsed.testCases.length; i++) {
          const testCase = parsed.testCases[i]
          if (!isJsonObject(testCase)) continue

          if (testCase.expectedPath && Array.isArray(testCase.expectedPath)) {
            for (const stateName of testCase.expectedPath) {
              if (typeof stateName === 'string' && !availableStates.includes(stateName)) {
                const suggestion = this.findSimilarStateName(stateName, availableStates)
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

          // Check stateExpectations
          if (testCase.stateExpectations && isJsonArray(testCase.stateExpectations)) {
            for (const expectation of testCase.stateExpectations) {
              if (!isJsonObject(expectation)) continue
              const exp = expectation
              if (
                exp.state &&
                typeof exp.state === 'string' &&
                !availableStates.includes(exp.state)
              ) {
                const suggestion = this.findSimilarStateName(exp.state, availableStates)
                issues.push({
                  level: 'error',
                  message: `Test case #${i + 1}: State "${exp.state}" in stateExpectations does not exist`,
                  suggestion: suggestion
                    ? `Did you mean "${suggestion}"?`
                    : `Available states: ${availableStates.slice(0, 5).join(', ')}...`,
                })
              }
            }
          }
        }
      }
    } catch (_error) {
      // Ignore parsing errors
    }

    return issues
  }

  /**
   * Find similar state name using Levenshtein distance
   */
  private findSimilarStateName(input: string, availableStates: string[]): string | null {
    let minDistance = Number.POSITIVE_INFINITY
    let closestMatch: string | null = null

    for (const state of availableStates) {
      const distance = this.levenshteinDistance(input.toLowerCase(), state.toLowerCase())

      // If distance is small relative to string length, consider it similar
      if (distance < minDistance && distance <= Math.max(input.length, state.length) * 0.3) {
        minDistance = distance
        closestMatch = state
      }
    }

    return closestMatch
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
      if (matrix[0]) {
        matrix[0][j] = j
      }
    }

    for (let i = 1; i <= b.length; i++) {
      const currentRow = matrix[i]
      const prevRow = matrix[i - 1]
      if (!(currentRow && prevRow)) continue

      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          currentRow[j] = prevRow[j - 1] ?? 0
        } else {
          currentRow[j] = Math.min(
            (prevRow[j - 1] ?? 0) + 1, // substitution
            (currentRow[j - 1] ?? 0) + 1, // insertion
            (prevRow[j] ?? 0) + 1, // deletion
          )
        }
      }
    }

    const lastRow = matrix[b.length]
    return lastRow?.[a.length] ?? 0
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

  /**
   * Auto-fix common issues
   */
  autoFix(content: string, type: 'test' | 'mock', stateMachine: StateMachine): string {
    let fixed = content

    if (type === 'test') {
      // Auto-fix outputMatching: "exact" to "partial"
      fixed = fixed.replace(/outputMatching:\s*["']exact["']/g, 'outputMatching: "partial"')

      // Don't add outputMatching automatically - it breaks indentation
      // The AI should generate it correctly
    } else if (type === 'mock') {
      try {
        const parsed = yaml.load(content)
        if (!isJsonObject(parsed)) return fixed

        // stateMachine is already parsed JsonObject
        if (!isJsonObject(stateMachine)) return fixed

        let modified = false

        if (parsed.mocks && isJsonArray(parsed.mocks)) {
          for (const mock of parsed.mocks) {
            if (!isJsonObject(mock) || typeof mock.state !== 'string') continue
            const state = this.findStateByPath(mock.state, stateMachine.States)

            // Check if this is a Lambda invoke task
            const resource = state?.isTask() ? state.Resource : null
            if (resource && typeof resource === 'string' && resource.includes('lambda:invoke')) {
              // Fix conditional mocks for Lambda
              if (mock.type === 'conditional' && mock.conditions && isJsonArray(mock.conditions)) {
                for (const condition of mock.conditions) {
                  if (!isJsonObject(condition)) continue

                  if (
                    condition.when &&
                    isJsonObject(condition.when) &&
                    condition.when.input &&
                    isJsonObject(condition.when.input) &&
                    !condition.when.input.Payload
                  ) {
                    // Wrap input in Payload
                    condition.when.input = {
                      Payload: condition.when.input,
                    }
                    modified = true
                  }

                  // Fix response format for Lambda
                  if (
                    condition.response &&
                    isJsonObject(condition.response) &&
                    !condition.response.Payload
                  ) {
                    condition.response = {
                      Payload: condition.response,
                      StatusCode: 200,
                    }
                    modified = true
                  }
                }
              }

              // Fix fixed mock response for Lambda
              if (
                mock.type === 'fixed' &&
                mock.response &&
                isJsonObject(mock.response) &&
                !mock.response.Payload
              ) {
                mock.response = {
                  Payload: mock.response,
                  StatusCode: 200,
                }
                modified = true
              }
            }
          }
        }

        if (modified) {
          fixed = yaml.dump(parsed, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
          })
        }
      } catch {
        // If parsing fails, return original content
      }
    }

    return fixed
  }

  /**
   * Format validation report
   */
  formatReport(issues: ValidationIssue[]): string {
    if (issues.length === 0) {
      return '✅ No issues found!'
    }

    const errors = issues.filter((i) => i.level === 'error')
    const warnings = issues.filter((i) => i.level === 'warning')
    const info = issues.filter((i) => i.level === 'info')

    let report = ''

    if (errors.length > 0) {
      report += `❌ Errors (${errors.length}):\n`
      for (const error of errors) {
        report += `  - ${error.message}\n`
        if (error.suggestion) {
          report += `    💡 ${error.suggestion}\n`
        }
      }
      report += '\n'
    }

    if (warnings.length > 0) {
      report += `⚠️ Warnings (${warnings.length}):\n`
      for (const warning of warnings) {
        report += `  - ${warning.message}\n`
        if (warning.suggestion) {
          report += `    💡 ${warning.suggestion}\n`
        }
      }
      report += '\n'
    }

    if (info.length > 0) {
      report += `ℹ️ Info (${info.length}):\n`
      for (const item of info) {
        report += `  - ${item.message}\n`
      }
    }

    return report
  }

  /**
   * Validate Lambda invoke states with JSONata Output expectations
   * Note: This performs static validation only. For actual transformation result validation,
   * use TestExecutionValidator which executes tests and corrects expectations.
   */
  private validateLambdaJSONataOutputExpectations(
    content: string,
    stateMachine: StateMachine,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    try {
      const parsed = yaml.load(content)
      if (!isJsonObject(parsed)) return issues

      if (!(parsed.testCases && isJsonArray(parsed.testCases))) {
        return issues
      }

      for (const testCase of parsed.testCases) {
        if (!isJsonObject(testCase)) continue
        if (!(testCase.stateExpectations && isJsonArray(testCase.stateExpectations))) continue

        for (const stateExpectation of testCase.stateExpectations) {
          if (!isJsonObject(stateExpectation)) continue
          if (typeof stateExpectation.state !== 'string') continue
          if (!stateExpectation.output) continue

          const stateName = stateExpectation.state
          const state = this.findStateByPath(stateName, stateMachine.States)

          // Check if this is a Lambda invoke state with JSONata Output
          if (
            state?.isTask() &&
            state.Resource === 'arn:aws:states:::lambda:invoke' &&
            state.isJSONataState() &&
            state.Output &&
            typeof state.Output === 'string' &&
            state.Output.includes('$states.result.Payload')
          ) {
            const expectedOutput = stateExpectation.output

            // If the expected output has Payload wrapper, it's wrong
            if (
              isJsonObject(expectedOutput) &&
              (expectedOutput.Payload ||
                expectedOutput.StatusCode ||
                expectedOutput.ExecutedVersion)
            ) {
              issues.push({
                level: 'error',
                message: `State "${stateName}" has JSONata Output that extracts Payload, but test expects full Lambda response`,
                suggestion:
                  'Remove Payload wrapper from expected output. JSONata Output "{% $states.result.Payload %}" returns only the Payload content.',
              })
            }
          }
        }
      }
    } catch (_error) {
      // Ignore parsing errors - handled elsewhere
    }

    return issues
  }
}
