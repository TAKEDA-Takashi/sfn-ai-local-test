/**
 * AUTO-GENERATED: Type definitions embedded at build time
 * DO NOT EDIT - Edit src/types/*.ts instead
 */
export const EMBEDDED_TYPE_DEFINITIONS = `
## Test Suite Type Definition (TypeScript):
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


## Mock Configuration Type Definition (TypeScript):
/**
 * Mock Configuration Type Definitions
 */

import type { JsonArray, JsonValue } from './asl'

export interface MockConfig {
  version: string
  mocks: MockDefinition[]
}

export type MockDefinition = FixedMock | ConditionalMock | StatefulMock | ErrorMock | ItemReaderMock

interface BaseMock {
  state: string
  description?: string
  delay?: number // Optional delay in milliseconds
}

export interface FixedMock extends BaseMock {
  type: 'fixed'
  response?: JsonValue
  responseFile?: string // Path to external file (format auto-detected from extension or ItemReader)
  responseFormat?: 'json' | 'csv' | 'jsonl' | 'yaml' // Rarely needed: Only when auto-detection fails
}

export interface ConditionalMock extends BaseMock {
  type: 'conditional'
  conditions: ConditionalRule[]
}

interface ConditionalRule {
  when?: {
    input: JsonValue // Required: Must explicitly use 'input' field for clarity
  }
  response?: JsonValue
  responseFile?: string // Path to external file (format auto-detected from extension or ItemReader)
  responseFormat?: 'json' | 'csv' | 'jsonl' | 'yaml' // Rarely needed: Only when auto-detection fails
  error?: MockError // Error to throw when condition matches
  default?: JsonValue
  delay?: number // Optional delay in milliseconds for this specific condition
}

export interface StatefulMock extends BaseMock {
  type: 'stateful'
  responses?: JsonArray
  responsesFile?: string // Path to external file containing array (format auto-detected)
  responseFormat?: 'json' | 'csv' | 'jsonl' | 'yaml' // Rarely needed: Only when auto-detection fails
}

export interface ErrorMock extends BaseMock {
  type: 'error'
  error: {
    type: string
    cause?: string
    message?: string
  }
  probability?: number
}

export interface ItemReaderMock extends BaseMock {
  type: 'itemReader'
  data?: JsonArray // Inline data array
  dataFile?: string // Path to data file
  dataFormat?: 'json' | 'csv' | 'jsonl' | 'yaml' // Format of the data file (auto-detected if not specified)
}

interface MockError {
  type: string
  cause?: string
  message?: string
}

export interface MockEngineOptions {
  verbose?: boolean
  seed?: number
  basePath?: string // Base path for resolving relative file paths
}

export interface MockState {
  callCount: Map<string, number>
  history: MockCallHistory[]
}

interface MockCallHistory {
  state: string
  input: JsonValue
  output: JsonValue
  timestamp: Date
  error?: MockError
}

`
