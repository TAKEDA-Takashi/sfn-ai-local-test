/**
 * Test Suite Types for Regression Testing
 */

import type { JsonArray, JsonValue } from './asl'

export interface TestSuite {
  version: string
  name: string
  description?: string
  stateMachine: string // State machine name or path to ASL file
  baseMock?: string // Mock configuration (name or path)
  testCases: TestCase[]
  settings?: TestSettings
  assertions?: AssertionSettings
}

export interface TestCase {
  name: string
  description?: string
  input: JsonValue
  expectedOutput?: JsonValue
  expectedPath?: string[] | string[][] // Single path or multiple paths (AND condition)
  expectedError?: string
  stateExpectations?: StateExpectation[] // State-level validation
  mapExpectations?: MapExpectation[] // Map state validation
  parallelExpectations?: ParallelExpectation[] // Parallel state validation
  timeout?: number
  skip?: boolean
  only?: boolean // Run only this test (for debugging)
  mockOverrides?: MockOverride[] // Test-specific mock configurations
  settings?: AssertionSettings // Test-specific assertion settings
}

export interface MockOverride {
  state: string
  type: 'fixed' | 'conditional' | 'stateful' | 'error' | 'delayed' | 'itemReader'
  description?: string
  response?: JsonValue
  error?: {
    type: string
    cause?: string
  }
  delay?: number
  conditions?: Array<{
    when: JsonValue
    response: JsonValue
  }>
  responses?: JsonArray
  // ItemReader specific properties
  data?: JsonValue
  dataFile?: string
  dataFormat?: 'json' | 'csv' | 'txt'
}

interface TestSettings {
  timeout?: number // Default timeout in ms
  parallel?: boolean // Run tests in parallel
  stopOnFailure?: boolean
  verbose?: boolean
}

export interface AssertionSettings {
  outputMatching?: 'exact' | 'partial'
  pathMatching?: 'exact' | 'includes' | 'sequence' | 'contains'
  stateMatching?: 'exact' | 'partial' // For state-level validation
}

export interface StateExpectation {
  state: string // State name or path (e.g., "MapState[0].InnerTask")
  input?: JsonValue
  output?: JsonValue
  inputMatching?: 'exact' | 'partial' // Override input matching mode for this specific state
  outputMatching?: 'exact' | 'partial' // Override output matching mode for this specific state
  variables?: Record<string, JsonValue> // Expected variable values after state execution
}

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

export interface MapExpectation {
  state: string // Map state name
  iterationCount?: number // Expected number of iterations
  iterationPaths?: {
    pathMatching?: 'exact' | 'sequence' | 'includes' // How to match paths
    all?: string[] // Path all iterations should follow
    samples?: Record<number, string[]> // Paths for specific iterations (by index)
  }
}

export interface ParallelExpectation {
  state: string // Parallel state name
  branchCount?: number // Expected number of branches
  branchPaths?: {
    pathMatching?: 'exact' | 'sequence' | 'includes' // How to match paths
    [index: number]: string[] // Path for each branch (by index)
  }
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
  coverage?: import('../core/coverage/tracker').CoverageReport
  suite?: TestSuite // Reference to the original test suite
}
