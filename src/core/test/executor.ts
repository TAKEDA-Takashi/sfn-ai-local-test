import { DEFAULT_TEST_TIMEOUT_MS } from '../../constants/defaults'
import type { ExecutionContextConfig } from '../../schemas/config-schema'
import type { MockDefinition } from '../../schemas/mock-schema'
import type { MockOverride, TestCase, TestSuite } from '../../schemas/test-schema'
import type { JsonValue, StateMachine } from '../../types/asl'
import type { AssertionResult, TestResult, TestSuiteResult } from '../../types/test'
import { NestedCoverageTracker } from '../coverage/nested-coverage-tracker'
import { type ExecutionResult, StateMachineExecutor } from '../interpreter/executor'
import type { MockEngine } from '../mock/engine'
import { TestAssertions } from './assertions'

/**
 * テストスイート実行エンジン
 */
export class TestSuiteExecutor {
  private suite: TestSuite
  private stateMachine: StateMachine
  private mockEngine?: MockEngine
  private coverageTracker?: NestedCoverageTracker
  private options?: {
    verbose?: boolean
    quiet?: boolean
    executionContext?: ExecutionContextConfig
  }

  constructor(suite: TestSuite, stateMachine: StateMachine, mockEngine?: MockEngine) {
    this.suite = suite
    this.stateMachine = stateMachine
    this.mockEngine = mockEngine
  }

  /**
   * テストスイートを実行
   * @param enableCoverage カバレッジ測定を有効化するか
   * @param options 実行オプション
   * @returns テストスイート実行結果
   */
  async runSuite(
    enableCoverage = false,
    options?: { verbose?: boolean; quiet?: boolean; executionContext?: ExecutionContextConfig },
  ): Promise<TestSuiteResult> {
    this.options = options
    const startTime = Date.now()
    const testCases = this.getTestCasesToRun()
    const results: TestResult[] = []

    // Share coverage tracker across all tests in the suite for aggregate metrics
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

  /**
   * 実行すべきテストケースを取得（only/skipを考慮）
   */
  private getTestCasesToRun(): TestCase[] {
    const onlyTests = this.suite.testCases.filter((tc) => tc.only)
    if (onlyTests.length > 0) {
      return onlyTests
    }

    return this.suite.testCases.filter((tc) => !tc.skip)
  }

  /**
   * 単一のテストケースを実行
   */
  private async runTestCase(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now()

    try {
      if (this.mockEngine) {
        this.mockEngine.resetCallCounts()
      }

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

      const executionContext = {
        ...this.options?.executionContext,
        ...this.suite.executionContext,
        ...testCase.executionContext,
      }

      const executionOptions = {
        ...this.options,
        executionContext: Object.keys(executionContext).length > 0 ? executionContext : undefined,
      }

      const executionPromise = executor.execute(testCase.input, executionOptions)

      let result: ExecutionResult
      try {
        result = await Promise.race([executionPromise, timeoutPromise])
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }

      if (this.coverageTracker && result.executionPath) {
        this.coverageTracker.trackExecution(result.executionPath)

        if (result.mapExecutions) {
          this.coverageTracker.trackMapExecutions(
            result.mapExecutions.map((exec) => {
              if (typeof exec !== 'object' || exec === null || Array.isArray(exec)) {
                throw new Error('Invalid map execution data')
              }
              const execObj = exec
              let iterationPaths: string[][] = []
              if (Array.isArray(execObj.iterationPaths)) {
                iterationPaths = execObj.iterationPaths.filter(
                  (path): path is string[] =>
                    Array.isArray(path) && path.every((p) => typeof p === 'string'),
                )
              }
              return {
                state: typeof execObj.state === 'string' ? execObj.state : '',
                iterationPaths,
              }
            }),
          )
        }

        if (result.parallelExecutions) {
          this.coverageTracker.trackParallelExecutions(
            result.parallelExecutions.map((exec) => {
              if (typeof exec !== 'object' || exec === null || Array.isArray(exec)) {
                throw new Error('Invalid parallel execution data')
              }
              const execObj = exec
              let branchPaths: string[][] = []
              if (Array.isArray(execObj.branchPaths)) {
                // Type-safe conversion to string[][]
                branchPaths = execObj.branchPaths.filter(
                  (path): path is string[] =>
                    Array.isArray(path) && path.every((p) => typeof p === 'string'),
                )
              }
              return {
                type: typeof execObj.type === 'string' ? execObj.type : '',
                state: typeof execObj.state === 'string' ? execObj.state : '',
                branchCount: typeof execObj.branchCount === 'number' ? execObj.branchCount : 0,
                branchPaths,
              }
            }),
          )
        }
      }

      let assertions: AssertionResult[] = []
      let assertionError: string | undefined

      try {
        assertions = TestAssertions.performAssertions(testCase, result, this.suite.assertions)
      } catch (error) {
        assertionError = this.formatAssertionError(error, testCase)
        const duration = Date.now() - startTime

        if (testCase.mockOverrides && this.mockEngine) {
          this.mockEngine.clearMockOverrides()
        }

        return {
          name: testCase.name,
          testCase: testCase,
          status: 'failed',
          duration,
          assertions: [],
          error: assertionError,
          executionResult: {
            output: result.output,
            executionPath: result.executionPath,
            success: result.success,
            error: result.error,
          } as JsonValue,
        }
      }

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

      let errorMessage = error instanceof Error ? error.message : String(error)
      if (this.options?.verbose && error instanceof Error) {
        errorMessage = `Runtime error during test execution: ${errorMessage}`
        if (error.stack) {
          const stackLines = error.stack.split('\n').slice(0, 3).join('\n')
          errorMessage += `\n\nStack trace:\n${stackLines}`
        }
      }

      return {
        name: testCase.name,
        testCase: testCase,
        status: 'failed',
        duration,
        assertions: [],
        error: errorMessage,
      }
    } finally {
      if (testCase.mockOverrides && this.mockEngine) {
        this.mockEngine.clearMockOverrides()
      }
    }
  }

  private formatAssertionError(error: unknown, testCase: TestCase): string {
    const baseError = error instanceof Error ? error.message : String(error)

    if (this.options?.verbose) {
      const assertionTypes: string[] = []
      if (testCase.expectedOutput !== undefined) assertionTypes.push('output')
      if (testCase.expectedPath !== undefined) assertionTypes.push('path')
      if (testCase.expectedError !== undefined) assertionTypes.push('error')
      if (testCase.stateExpectations) assertionTypes.push('state expectations')
      if (testCase.mapExpectations) assertionTypes.push('map expectations')
      if (testCase.parallelExpectations) assertionTypes.push('parallel expectations')
      let stackInfo = ''
      if (error instanceof Error && error.stack) {
        const stackLines = error.stack.split('\n')
        const relevantLine = stackLines.find(
          (line) =>
            line.includes('assertOutput') ||
            line.includes('assertPaths') ||
            line.includes('assertStateExpectations') ||
            line.includes('assertMapExpectations') ||
            line.includes('assertParallelExpectations'),
        )
        if (relevantLine) {
          const methodMatch = relevantLine.match(/assert\w+/)
          if (methodMatch) {
            stackInfo = ` (in ${methodMatch[0]})`
          }
        }
      }

      return `Assertion failed while checking ${assertionTypes.join(', ')}${stackInfo}: ${baseError}`
    }

    // For non-verbose mode, provide a simpler message
    // Extract just the key information from the error
    if (baseError.includes('Failed to assert state expectations for states')) {
      const statesMatch = baseError.match(/\[([^\]]+)\]/)
      const states = statesMatch ? statesMatch[1] : 'unknown states'
      if (baseError.includes('no stateExecutions were captured')) {
        return `State expectations failed for [${states}]: No state executions captured`
      }
      return `State expectations failed for [${states}]`
    }

    if (baseError.includes('Failed to assert map expectations for states')) {
      const statesMatch = baseError.match(/\[([^\]]+)\]/)
      const states = statesMatch ? statesMatch[1] : 'unknown states'
      return `Map expectations failed for [${states}]`
    }

    if (baseError.includes('Failed to assert parallel expectations for states')) {
      const statesMatch = baseError.match(/\[([^\]]+)\]/)
      const states = statesMatch ? statesMatch[1] : 'unknown states'
      return `Parallel expectations failed for [${states}]`
    }

    if (baseError.includes('Failed to assert output')) {
      return 'Output assertion failed'
    }

    if (baseError.includes('Failed to assert path')) {
      return 'Path assertion failed'
    }

    // For other errors, return a simplified version
    if (baseError.includes('Cannot convert undefined or null to object')) {
      return 'Assertion failed: Invalid or missing data'
    }

    // Default: return first line of error only
    const firstLine = baseError.split('\n')[0]
    if (firstLine.length > 100) {
      return `${firstLine.substring(0, 97)}...`
    }
    return firstLine
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
