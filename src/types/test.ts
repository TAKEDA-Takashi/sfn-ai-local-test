/**
 * Test Execution Result Types
 *
 * These types are not part of the test suite schema but are used
 * for runtime execution results and assertions.
 */

import type { CoverageReport } from '../core/coverage/nested-coverage-tracker'
import type {
  MapExpectation,
  ParallelExpectation,
  StateExpectation,
  TestCase,
  TestSuite,
} from '../schemas/test-schema'
import type { JsonValue } from './asl'

/**
 * ステート実行の詳細情報
 */
export interface StateExecution {
  /** State execution path, e.g., ["MapState", "0", "InnerTask"] */
  statePath: string[]
  /** State name */
  state: string
  /** Parent state name for nested states */
  parentState?: string
  /** For Map/Parallel states */
  iterationIndex?: number
  input: JsonValue
  output: JsonValue
  variablesBefore?: Record<string, JsonValue>
  variablesAfter?: Record<string, JsonValue>
  /** True if this is a summary execution for Parallel state */
  isParallelSummary?: boolean
}

/**
 * テスト実行結果
 */
export interface TestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped' | 'timeout'
  /** Execution time in ms */
  duration: number
  actualOutput?: JsonValue
  actualPath?: string[]
  actualError?: string
  /** State-level execution details */
  stateExecutions?: StateExecution[]
  expectedOutput?: JsonValue
  expectedPath?: string[]
  expectedError?: string
  errorMessage?: string
  assertions?: AssertionResult[]
  /** Reference to the original test case */
  testCase?: TestCase
  /** Raw execution result */
  executionResult?: JsonValue
  error?: string // Error message for failed tests
}

/**
 * アサーション結果
 */
export interface AssertionResult {
  type: 'output' | 'path' | 'error' | 'state' | 'map' | 'parallel'
  passed: boolean
  expected: JsonValue | StateExpectation | MapExpectation | ParallelExpectation
  actual: JsonValue | StateExecution
  message?: string
  stateName?: string // For state-level assertions
}

/**
 * テストスイート実行結果
 */
export interface TestSuiteResult {
  suiteName: string
  totalTests: number
  passedTests: number
  failedTests: number
  skippedTests: number
  duration: number
  results: TestResult[]
  summary: {
    successRate: number
    averageDuration: number
    slowestTest?: TestResult
    fastestTest?: TestResult
  }
  coverage?: CoverageReport
  suite?: TestSuite // Reference to the original test suite
}
