import { z } from 'zod'
import type { JsonValue } from '../types/asl'

// JSON value schema - matches JsonValue type from asl.ts
// Using a type annotation to handle the recursive type
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), jsonValueSchema),
    z.array(jsonValueSchema),
  ]),
)

// Base mock schema
const baseMockSchema = z.object({
  state: z.string().describe('State name to mock'),
  description: z.string().optional().describe('Mock description'),
  delay: z.number().optional().describe('Optional delay in milliseconds'),
})

// Fixed mock schema
export const fixedMockSchema = baseMockSchema
  .extend({
    type: z.literal('fixed').describe('Fixed response mock'),
    response: jsonValueSchema.optional().describe('Fixed response value'),
    responseFile: z
      .string()
      .optional()
      .describe('Path to external file (format auto-detected from extension)'),
    responseFormat: z
      .enum(['json', 'csv', 'jsonl', 'yaml'])
      .optional()
      .describe('Rarely needed: Only when auto-detection fails'),
  })
  .describe('Fixed mock configuration')

// Conditional rule schema
const conditionalRuleSchema = z
  .object({
    when: z
      .object({
        input: jsonValueSchema.describe('Input to match'),
      })
      .optional()
      .describe('Required: Must explicitly use "input" field for clarity'),
    response: jsonValueSchema.optional().describe('Response when condition matches'),
    responseFile: z
      .string()
      .optional()
      .describe('Path to external file (format auto-detected from extension)'),
    responseFormat: z
      .enum(['json', 'csv', 'jsonl', 'yaml'])
      .optional()
      .describe('Rarely needed: Only when auto-detection fails'),
    error: z
      .object({
        type: z.string().describe('Error type'),
        cause: z.string().optional().describe('Error cause'),
        message: z.string().optional().describe('Error message'),
      })
      .optional()
      .describe('Error to throw when condition matches'),
    default: jsonValueSchema.optional().describe('Default response if no conditions match'),
    delay: z
      .number()
      .optional()
      .describe('Optional delay in milliseconds for this specific condition'),
  })
  .describe('Conditional rule')

// Conditional mock schema
export const conditionalMockSchema = baseMockSchema
  .extend({
    type: z.literal('conditional').describe('Conditional response mock'),
    conditions: z.array(conditionalRuleSchema).describe('List of conditional rules'),
  })
  .describe('Conditional mock configuration')

// Stateful mock schema
export const statefulMockSchema = baseMockSchema
  .extend({
    type: z.literal('stateful').describe('Stateful response mock'),
    responses: z
      .array(jsonValueSchema)
      .optional()
      .describe('Array of responses (returned in sequence)'),
    responsesFile: z.string().optional().describe('Path to file containing response array'),
    responseFormat: z
      .enum(['json', 'csv', 'jsonl', 'yaml'])
      .optional()
      .describe('Format of responses file'),
  })
  .describe('Stateful mock configuration')

// Error mock schema
export const errorMockSchema = baseMockSchema
  .extend({
    type: z.literal('error').describe('Error mock'),
    error: z
      .object({
        type: z.string().describe('Error type'),
        cause: z.string().optional().describe('Error cause'),
        message: z.string().optional().describe('Error message'),
      })
      .describe('Error to throw'),
    probability: z.number().optional().describe('Probability of error (0-1)'),
  })
  .describe('Error mock configuration')

// ItemReader mock schema
export const itemReaderMockSchema = baseMockSchema
  .extend({
    type: z.literal('itemReader').describe('ItemReader mock for DistributedMap'),
    data: z.array(jsonValueSchema).optional().describe('Inline data array'),
    dataFile: z.string().optional().describe('Path to data file'),
    dataFormat: z
      .enum(['json', 'csv', 'jsonl', 'yaml'])
      .optional()
      .describe('Format of the data file (auto-detected if not specified)'),
  })
  .describe('ItemReader mock configuration')

// Mock definition union
export const mockDefinitionSchema = z.discriminatedUnion('type', [
  fixedMockSchema,
  conditionalMockSchema,
  statefulMockSchema,
  errorMockSchema,
  itemReaderMockSchema,
])

// Mock config schema
export const mockConfigSchema = z
  .object({
    version: z.string().describe('Mock configuration version'),
    mocks: z.array(mockDefinitionSchema).describe('List of mock definitions'),
  })
  .describe('Mock configuration')

// Type exports
export type MockConfig = z.infer<typeof mockConfigSchema>
export type MockDefinition = z.infer<typeof mockDefinitionSchema>
export type FixedMock = z.infer<typeof fixedMockSchema>
export type ConditionalMock = z.infer<typeof conditionalMockSchema>
export type StatefulMock = z.infer<typeof statefulMockSchema>
export type ErrorMock = z.infer<typeof errorMockSchema>
export type ItemReaderMock = z.infer<typeof itemReaderMockSchema>

// Runtime-only types (not part of schema validation)
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
  input: unknown
  output: unknown
  timestamp: Date
  error?: {
    type: string
    cause?: string
    message?: string
  }
}
