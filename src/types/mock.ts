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
