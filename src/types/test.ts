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

export interface StateExecution {
  statePath: string[] // ["MapState", "0", "InnerTask"]
  state: string // State name
  parentState?: string // Parent state name for nested states
  iterationIndex?: number // For Map/Parallel states
  input: JsonValue
  output: JsonValue
  variablesBefore?: Record<string, JsonValue>
  variablesAfter?: Record<string, JsonValue>
  isParallelSummary?: boolean // True if this is a summary execution for Parallel state
}

export interface TestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped' | 'timeout'
  duration: number // Execution time in ms
  actualOutput?: JsonValue
  actualPath?: string[]
  actualError?: string
  stateExecutions?: StateExecution[] // State-level execution details
  expectedOutput?: JsonValue
  expectedPath?: string[]
  expectedError?: string
  errorMessage?: string
  assertions?: AssertionResult[]
  testCase?: TestCase // Reference to the original test case
  executionResult?: JsonValue // Raw execution result
  error?: string // Error message for failed tests
}

export interface AssertionResult {
  type: 'output' | 'path' | 'error' | 'state' | 'map' | 'parallel'
  passed: boolean
  expected: JsonValue | StateExpectation | MapExpectation | ParallelExpectation
  actual: JsonValue | StateExecution
  message?: string
  stateName?: string // For state-level assertions
}

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
