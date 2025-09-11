/**
 * Type definitions for AI prompts
 *
 * These type definitions are used to help AI understand the structure
 * of YAML configuration files for test suites and mock configurations.
 *
 * Source schemas: src/schemas/test-schema.ts and src/schemas/mock-schema.ts
 *
 * Note: When Zod schemas change significantly, update these types accordingly.
 * Most fields are stable and rarely change.
 *
 * IMPORTANT: Mock and Test type definitions are intentionally separated
 * to improve AI generation accuracy by providing only relevant types.
 */

// Common types used by both mock and test generation
const COMMON_TYPE_DEFINITIONS = `
// ==================== BASIC TYPES ====================
// JsonValue represents any valid JSON value
type JsonValue = string | number | boolean | null | JsonObject | JsonArray
type JsonObject = { [key: string]: JsonValue }
type JsonArray = JsonValue[]`

// Type definitions specifically for mock generation
export const MOCK_TYPE_DEFINITIONS = `${COMMON_TYPE_DEFINITIONS}

// ==================== MOCK CONFIGURATION ====================

interface MockConfig {
  version: string  // Mock configuration version (always "1.0")
  mocks: MockDefinition[]  // List of mock definitions for states
}

// ==================== MOCK TYPES ====================

interface BaseMock {
  state: string  // State name to mock (e.g., "GetUserData", "ProcessPayment")
  description?: string  // Optional description of what this mock simulates
  delay?: number  // Optional delay in milliseconds to simulate latency
}

interface FixedMock extends BaseMock {
  type: 'fixed'  // Always returns the same response
  response?: JsonValue  // Fixed response value (for Lambda states, wrap in Payload)
  responseFile?: string  // Path to external file containing response
  responseFormat?: 'json' | 'csv' | 'jsonl' | 'yaml'  // Format of external file
}

interface ConditionalMock extends BaseMock {
  type: 'conditional'  // Returns different responses based on input
  conditions: ConditionalRule[]  // List of conditional rules evaluated in order
}

interface ConditionalRule {
  when?: { input: JsonValue }  // Input condition to match (partial match)
  response?: JsonValue  // Response when condition matches
  responseFile?: string  // Path to external file for response
  responseFormat?: 'json' | 'csv' | 'jsonl' | 'yaml'  // Format specification
  error?: { type: string; cause?: string; message?: string }  // Error to simulate
  default?: JsonValue  // Default response if no conditions match
  delay?: number  // Optional delay for this specific condition
}

interface StatefulMock extends BaseMock {
  type: 'stateful'  // Returns different responses on each invocation
  responses?: JsonValue[]  // Array of responses returned in sequence
  responsesFile?: string  // Path to file containing response array
  responseFormat?: 'json' | 'csv' | 'jsonl' | 'yaml'  // Format of responses file
}

interface ErrorMock extends BaseMock {
  type: 'error'  // Simulates an error condition
  error: {
    type: string  // Error type (e.g., "States.TaskFailed")
    cause?: string  // Error cause
    message?: string  // Error message
  }
  probability?: number  // Probability of error (0.0 to 1.0)
}

interface ItemReaderMock extends BaseMock {
  type: 'itemReader'  // Mock for DistributedMap ItemReader
  data?: JsonValue[]  // Inline data array for iteration
  dataFile?: string  // Path to data file
  dataFormat?: 'json' | 'csv' | 'jsonl' | 'yaml'  // Format of the data file
}

// Union type for all mock types
type MockDefinition = 
  | FixedMock
  | ConditionalMock
  | StatefulMock
  | ErrorMock
  | ItemReaderMock
`

// Type definitions specifically for test generation
export const TEST_TYPE_DEFINITIONS = `${COMMON_TYPE_DEFINITIONS}

// ==================== TEST SUITE CONFIGURATION ====================

interface TestSuite {
  version: string  // Test suite version (always "1.0")
  name: string  // Test suite name (descriptive identifier)
  description?: string  // Optional description of what is being tested
  stateMachine?: string  // State machine name or path to ASL JSON file
  baseMock?: string  // Mock configuration name or path to YAML file
  testCases: TestCase[]  // Array of test cases to execute
  settings?: TestSettings  // Optional test execution settings
  assertions?: TestAssertions  // Default assertion behavior
}

interface TestSettings {
  timeout?: number  // Test timeout in milliseconds
  parallel?: boolean  // Run tests in parallel
  stopOnFailure?: boolean  // Stop on first failure
  verbose?: boolean  // Enable verbose output
  strict?: boolean  // Strict mode validation
}

interface TestAssertions {
  outputMatching?: 'exact' | 'partial'  // How to compare outputs
  pathMatching?: 'exact' | 'includes' | 'sequence' | 'contains'  // How to compare execution paths
  stateMatching?: 'exact' | 'partial'  // How to compare state inputs/outputs
}

// ==================== TEST CASE DEFINITION ====================

interface TestCase {
  name: string  // Descriptive name for the test case
  description?: string  // Detailed explanation of what's being tested
  input: JsonValue  // Input JSON to start the state machine execution
  expectedOutput?: JsonValue  // Expected final output (omit for error tests)
  expectedPath?: string[] | string[][]  // Expected execution path through states
  expectedError?: string  // Expected error message pattern (for error tests)
  stateExpectations?: StateExpectation[]  // Validate individual state inputs/outputs
  mapExpectations?: MapExpectation[]  // Validate Map state iterations
  parallelExpectations?: ParallelExpectation[]  // Validate Parallel state branches
  timeout?: number  // Override default timeout (milliseconds)
  skip?: boolean  // Temporarily skip this test
  only?: boolean  // Run only this test (useful for debugging)
  mockOverrides?: MockOverride[]  // Override mocks for this specific test
  outputMatching?: 'exact' | 'partial'  // How to compare outputs
  pathMatching?: 'exact' | 'includes' | 'sequence' | 'contains'  // How to compare paths
}

// ==================== TEST EXPECTATIONS ====================

interface StateExpectation {
  state: string  // State name or path
  input?: JsonValue  // Expected input to the state
  output?: JsonValue  // Expected output from the state
  outputMatching?: 'exact' | 'partial'  // Override output matching for this state
  variables?: Record<string, JsonValue>  // Expected variable values after state execution
}

interface MapExpectation {
  state: string  // Map state name
  iterationCount?: number  // Expected number of iterations
  iterationPaths?: {
    pathMatching?: 'exact' | 'sequence' | 'includes'  // How to match paths
    all?: string[]  // Path all iterations should follow
    samples?: Record<string, string[]>  // Paths for specific iterations (by index)
  }
}

interface ParallelExpectation {
  state: string  // Parallel state name
  branchCount?: number  // Expected number of branches
  branchPaths?: {
    pathMatching?: 'exact' | 'sequence' | 'includes'  // How to match paths
    [branchIndex: string]: string[] | string  // Path for each branch
  }
}

// ==================== MOCK OVERRIDES FOR TESTS ====================

interface MockOverride {
  state: string  // State name to mock (e.g., "GetUserData", "ProcessPayment")
  type: 'fixed' | 'conditional' | 'stateful' | 'error' | 'itemReader'  // Mock behavior type
  response?: JsonValue  // Response for fixed/conditional mocks
  error?: JsonValue  // Error to simulate for error testing
  delay?: number  // Simulated latency in milliseconds
  conditions?: JsonValue[]  // Input conditions for conditional responses
  responses?: JsonValue[]  // Sequence of responses for stateful mocks
  data?: JsonValue  // Inline data for itemReader (DistributedMap)
  dataFile?: string  // External data file path
  dataFormat?: 'json' | 'csv' | 'jsonl' | 'yaml'  // Format of external data
}
`
