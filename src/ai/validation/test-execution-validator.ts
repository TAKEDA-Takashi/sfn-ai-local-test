import { StateMachineExecutor } from '../../core/interpreter/executor'
import { MockEngine } from '../../core/mock/engine'
import type { MockConfig } from '../../schemas/mock-schema'
import type { TestCase, TestSuite } from '../../schemas/test-schema'
import type { JsonValue, State, StateMachine } from '../../types/asl'
import { InvalidInputError, TestExecutionError } from './errors'

export interface ValidationCorrection {
  testCase: string
  state: string
  reason: string
  original: JsonValue
  corrected: JsonValue
}

export interface ImprovedTestSuite extends TestSuite {
  corrections?: ValidationCorrection[]
}

/**
 * Validates and improves test cases by actually executing them
 * and learning from the execution results
 */
export class TestExecutionValidator {
  /**
   * Validate and improve test suite by executing and comparing results
   */
  async validateAndImprove(
    stateMachine: StateMachine,
    testSuite: TestSuite,
    mockConfig: MockConfig,
    options: { basePath?: string } = {},
  ): Promise<ImprovedTestSuite> {
    // Input validation
    if (!stateMachine?.States) {
      throw new InvalidInputError('Invalid state machine: missing States')
    }

    if (!testSuite?.testCases?.length) {
      throw new InvalidInputError('Invalid test suite: no test cases provided')
    }

    if (!mockConfig?.version) {
      throw new InvalidInputError('Invalid mock config: missing version')
    }
    const corrections: ValidationCorrection[] = []
    const improvedTestCases: TestCase[] = []

    // Create mock engine from config with proper basePath
    const mockEngine = new MockEngine(mockConfig, { basePath: options.basePath })

    for (const testCase of testSuite.testCases) {
      const improvedTestCase = await this.improveTestCase(
        stateMachine,
        testCase,
        mockEngine,
        corrections,
      )
      improvedTestCases.push(improvedTestCase)
    }

    return {
      ...testSuite,
      testCases: improvedTestCases,
      corrections: corrections.length > 0 ? corrections : undefined,
    }
  }

  /**
   * Improve a single test case by executing and correcting expectations
   */
  private async improveTestCase(
    stateMachine: StateMachine,
    testCase: TestCase,
    mockEngine: MockEngine,
    corrections: ValidationCorrection[],
  ): Promise<TestCase> {
    // Create executor with state machine and mock engine
    const executor = new StateMachineExecutor(stateMachine, mockEngine)

    try {
      // Execute the state machine with the test input
      const result = await executor.execute(testCase.input, { verbose: false })

      if (!testCase.stateExpectations) {
        return testCase
      }

      // Improve each state expectation
      const improvedExpectations = testCase.stateExpectations.map((expectation) => {
        // Find the actual execution for this state
        const stateExecution = result.stateExecutions?.find(
          (exec) => exec.state === expectation.state,
        )

        if (!stateExecution) {
          // State was not executed - keep original expectation
          return expectation
        }

        // Compare expected vs actual output
        const actualOutput = stateExecution.output
        const expectedOutput = expectation.output

        // If outputs don't match, correct the expectation
        if (expectedOutput !== undefined && !this.isEqual(expectedOutput, actualOutput)) {
          // Determine the reason for the difference
          const reason = this.analyzeOutputDifference(
            expectation.state,
            expectedOutput,
            actualOutput,
            stateMachine,
          )

          corrections.push({
            testCase: testCase.name,
            state: expectation.state,
            reason,
            original: expectedOutput,
            corrected: actualOutput,
          })

          // Return corrected expectation
          return {
            ...expectation,
            output: actualOutput,
          }
        }

        return expectation
      })

      return {
        ...testCase,
        stateExpectations: improvedExpectations,
      }
    } catch (error) {
      throw new TestExecutionError(testCase.name, error)
    }
  }

  /**
   * Analyze why the output differs from expectation
   */
  private analyzeOutputDifference(
    stateName: string,
    expected: JsonValue,
    actual: JsonValue,
    stateMachine: StateMachine,
  ): string {
    // Find the state definition
    const state = this.findState(stateName, stateMachine.States)

    if (!state) {
      return 'State not found in state machine'
    }

    const reasons: string[] = []

    // Check for JSONata Output transformation
    if (state.QueryLanguage === 'JSONata' && 'Output' in state) {
      reasons.push(`JSONata Output transformation applied: ${state.Output}`)
    }

    // Check for ResultSelector (JSONPath)
    if ('ResultSelector' in state) {
      reasons.push('ResultSelector transformation applied')
    }

    // Check for OutputPath filtering
    if ('OutputPath' in state) {
      reasons.push(`OutputPath filtering applied: ${state.OutputPath}`)
    }

    // Check for ResultPath
    if ('ResultPath' in state) {
      reasons.push(`ResultPath transformation applied: ${state.ResultPath}`)
    }

    // Check if it's a Lambda with Payload extraction
    if (state.isTask() && state.Resource === 'arn:aws:states:::lambda:invoke') {
      if (this.hasPayloadInExpected(expected) && !this.hasPayloadInActual(actual)) {
        reasons.push('Lambda Payload extraction detected - removed wrapper fields')
      }
    }

    if (reasons.length === 0) {
      reasons.push('Output transformation detected')
    }

    return reasons.join('; ')
  }

  /**
   * Find a state in the state machine (including nested states)
   */
  private findState(stateName: string, states: Record<string, State>): State | null {
    // Direct match
    if (states[stateName]) {
      return states[stateName]
    }

    // Search in nested structures
    for (const state of Object.values(states)) {
      // Check Map ItemProcessor
      if (state.isMap() && state.ItemProcessor?.States) {
        const found = this.findState(stateName, state.ItemProcessor.States)
        if (found) return found
      }

      // Check Parallel branches
      if (state.isParallel() && state.Branches) {
        for (const branch of state.Branches) {
          if (branch.States) {
            const found = this.findState(stateName, branch.States)
            if (found) return found
          }
        }
      }
    }

    return null
  }

  /**
   * Check if expected output has Lambda Payload structure
   */
  private hasPayloadInExpected(output: JsonValue): boolean {
    return (
      output !== null && typeof output === 'object' && !Array.isArray(output) && 'Payload' in output
    )
  }

  /**
   * Check if actual output looks like extracted Payload content
   */
  private hasPayloadInActual(output: JsonValue): boolean {
    if (!output || typeof output !== 'object' || Array.isArray(output)) return false
    // Now TypeScript knows output is an object (not null, not array)
    return 'Payload' in output || 'ExecutedVersion' in output || 'StatusCode' in output
  }

  /**
   * Deep equality check with early exit optimization
   */
  private isEqual(a: JsonValue | undefined, b: JsonValue): boolean {
    if (a === undefined) return false
    if (a === b) return true

    // Type check early exit
    if (typeof a !== typeof b) return false

    // For primitives
    if (typeof a !== 'object' || a === null || b === null) {
      return a === b
    }

    // For objects/arrays, use JSON comparison for deep equality
    // This is acceptable for test comparison use case
    return JSON.stringify(a) === JSON.stringify(b)
  }
}
