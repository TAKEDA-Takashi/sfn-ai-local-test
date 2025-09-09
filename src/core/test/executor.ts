import { DEFAULT_TEST_TIMEOUT_MS } from '../../constants/defaults'
import type { JsonObject, JsonValue, StateMachine } from '../../types/asl'
import type { MockDefinition } from '../../types/mock'
import type {
  MockOverride,
  TestCase,
  TestResult,
  TestSuite,
  TestSuiteResult,
} from '../../types/test'
import { NestedCoverageTracker } from '../coverage/nested-coverage-tracker'
import { type ExecutionResult, StateMachineExecutor } from '../interpreter/executor'
import type { MockEngine } from '../mock/engine'
import { TestAssertions } from './assertions'

export class TestSuiteExecutor {
  private suite: TestSuite
  private stateMachine: StateMachine
  private mockEngine?: MockEngine
  private coverageTracker?: NestedCoverageTracker
  private options?: { verbose?: boolean; quiet?: boolean }

  constructor(suite: TestSuite, stateMachine: StateMachine, mockEngine?: MockEngine) {
    this.suite = suite
    this.stateMachine = stateMachine
    this.mockEngine = mockEngine
  }

  async runSuite(
    enableCoverage = false,
    options?: { verbose?: boolean; quiet?: boolean },
  ): Promise<TestSuiteResult> {
    this.options = options
    const startTime = Date.now()
    const testCases = this.getTestCasesToRun()
    const results: TestResult[] = []

    // Initialize coverage tracker if requested - shared across all tests
    if (enableCoverage) {
      this.coverageTracker = new NestedCoverageTracker(this.stateMachine)
    }

    if (this.suite.settings?.parallel) {
      const promises = testCases.map((testCase) => this.runTestCase(testCase))
      const parallelResults = await Promise.all(promises)
      results.push(...parallelResults)
    } else {
      for (const testCase of testCases) {
        const result = await this.runTestCase(testCase)
        results.push(result)

        if (this.suite.settings?.stopOnFailure && result.status === 'failed') {
          break
        }
      }
    }

    const duration = Date.now() - startTime
    return this.buildSuiteResult(results, duration)
  }

  private getTestCasesToRun(): TestCase[] {
    const onlyTests = this.suite.testCases.filter((tc) => tc.only)
    if (onlyTests.length > 0) {
      return onlyTests
    }

    return this.suite.testCases.filter((tc) => !tc.skip)
  }

  private async runTestCase(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now()

    try {
      if (testCase.mockOverrides && this.mockEngine) {
        const mockDefinitions = this.convertMockOverrides(testCase.mockOverrides)
        this.mockEngine.setMockOverrides(mockDefinitions)
      }

      const executor = new StateMachineExecutor(this.stateMachine, this.mockEngine)

      const timeout = testCase.timeout || this.suite.settings?.timeout || DEFAULT_TEST_TIMEOUT_MS

      let timeoutId: NodeJS.Timeout | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Test timeout')), timeout)
      })

      // Let StateMachineExecutor handle context creation for proper tracking
      const executionPromise = executor.execute(testCase.input, this.options)

      let result: ExecutionResult
      try {
        result = await Promise.race([executionPromise, timeoutPromise])
      } finally {
        // Always clear the timeout, even if an error occurred
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }

      if (this.coverageTracker && result.executionPath) {
        this.coverageTracker.trackExecution(result.executionPath)

        if (result.mapExecutions) {
          this.coverageTracker.trackMapExecutions(
            result.mapExecutions.map((exec) => {
              const execObj = exec as JsonObject
              return {
                state: execObj.state as string,
                iterationPaths: execObj.iterationPaths as string[][],
              }
            }),
          )
        }

        if (result.parallelExecutions) {
          this.coverageTracker.trackParallelExecutions(
            result.parallelExecutions.map((exec) => {
              const execObj = exec as JsonObject
              return {
                type: execObj.type as string,
                state: execObj.state as string,
                branchCount: execObj.branchCount as number,
                branchPaths: execObj.branchPaths as string[][],
              }
            }),
          )
        }
      }

      const assertions = TestAssertions.performAssertions(testCase, result, this.suite.assertions)
      const failedAssertions = assertions.filter((a) => !a.passed)

      const duration = Date.now() - startTime

      if (testCase.mockOverrides && this.mockEngine) {
        this.mockEngine.clearMockOverrides()
      }

      return {
        name: testCase.name,
        testCase: testCase,
        status: failedAssertions.length > 0 ? 'failed' : 'passed',
        duration,
        assertions,
        executionResult: {
          output: result.output,
          executionPath: result.executionPath,
          success: result.success,
          error: result.error,
        } as JsonValue,
      }
    } catch (error) {
      const duration = Date.now() - startTime

      if (error instanceof Error && error.message === 'Test timeout') {
        return {
          name: testCase.name,
          testCase: testCase,
          status: 'failed',
          duration,
          assertions: [],
          error: `Test timed out after ${
            testCase.timeout || this.suite.settings?.timeout || DEFAULT_TEST_TIMEOUT_MS
          }ms`,
        }
      }

      return {
        name: testCase.name,
        testCase: testCase,
        status: 'failed',
        duration,
        assertions: [],
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      if (testCase.mockOverrides && this.mockEngine) {
        this.mockEngine.clearMockOverrides()
      }
    }
  }

  convertMockOverrides(overrides: MockOverride[]): MockDefinition[] {
    return overrides.map(
      (override) =>
        ({
          state: override.state,
          type: override.type,
          response: override.response,
          error: override.error,
          delay: override.delay,
          conditions: override.conditions,
          responses: override.responses,
          data: override.data,
          dataFile: override.dataFile,
          dataFormat: override.dataFormat,
          description: override.description,
        }) as MockDefinition,
    )
  }

  private buildSuiteResult(results: TestResult[], duration: number): TestSuiteResult {
    const totalTests = results.length
    const passedTests = results.filter((r) => r.status === 'passed').length
    const failedTests = results.filter((r) => r.status === 'failed').length
    const skippedTests = this.suite.testCases.filter((tc) => tc.skip).length

    const suiteResult: TestSuiteResult = {
      suite: this.suite,
      suiteName: this.suite.name || 'Test Suite',
      duration,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      results: results,
      summary: {
        successRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
        averageDuration:
          totalTests > 0 ? results.reduce((sum, r) => sum + r.duration, 0) / totalTests : 0,
        slowestTest:
          results.length > 0
            ? results.reduce((slow, r) => (r.duration > slow.duration ? r : slow))
            : undefined,
        fastestTest:
          results.length > 0
            ? results.reduce((fast, r) => (r.duration < fast.duration ? r : fast))
            : undefined,
      },
    }

    if (this.coverageTracker) {
      suiteResult.coverage = this.coverageTracker.getCoverage()
    }

    return suiteResult
  }
}
