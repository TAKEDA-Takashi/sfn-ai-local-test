import { z } from 'zod'
import type { JsonValue } from '../types/asl'
import { executionContextSchema } from './config-schema'

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

// Map expectation schema
const mapExpectationSchema = z
  .object({
    state: z.string().describe('Map state name'),
    iterationCount: z.number().optional().describe('Expected number of iterations'),
    iterationPaths: z
      .object({
        pathMatching: z.enum(['exact', 'includes']).optional().describe('How to match paths'),
        all: z.array(z.string()).optional().describe('Path all iterations should follow'),
        samples: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe('Paths for specific iterations (by index)'),
      })
      .optional()
      .describe('Expected paths for iterations'),
  })
  .strict()
  .describe('Map state validation')

// State expectation schema
const stateExpectationSchema = z
  .object({
    state: z.string().describe('State name or path (e.g., "MapState[0].InnerTask")'),
    input: jsonValueSchema.optional().describe('Expected input to the state'),
    output: jsonValueSchema.optional().describe('Expected output from the state'),
    outputMatching: z
      .enum(['exact', 'partial'])
      .optional()
      .describe('Override output matching for this state'),
    variables: z
      .record(z.string(), jsonValueSchema)
      .optional()
      .describe('Expected variable values after state execution'),
  })
  .strict()
  .describe('State-level validation')

// Parallel expectation schema
const parallelExpectationSchema = z
  .object({
    state: z.string().describe('Parallel state name'),
    branchCount: z.number().optional().describe('Expected number of branches'),
    branchPaths: z
      .object({
        pathMatching: z.enum(['exact', 'includes']).optional().describe('How to match paths'),
      })
      .catchall(z.array(z.string())) // Allow numeric string keys for branch indices
      .optional(),
  })
  .strict()

// Test case schema
const testCaseSchema = z
  .object({
    name: z.string().describe('Test case name'),
    description: z.string().optional().describe('Test case description'),
    input: jsonValueSchema.describe('Required: Test input data'),
    expectedOutput: jsonValueSchema
      .optional()
      .describe('Expected output (optional for error tests)'),
    expectedPath: z
      .union([z.array(z.string()), z.array(z.array(z.string()))])
      .optional()
      .describe('Single path or multiple paths (AND condition)'),
    expectedError: z.string().optional().describe('Expected error message pattern'),
    stateExpectations: z
      .array(stateExpectationSchema)
      .optional()
      .describe('State-level validation'),
    mapExpectations: z.array(mapExpectationSchema).optional().describe('Map state validation'),
    parallelExpectations: z
      .array(parallelExpectationSchema)
      .optional()
      .describe('Parallel state validation'),
    timeout: z.number().optional().describe('Test-specific timeout in ms'),
    skip: z.boolean().optional().describe('Skip this test'),
    only: z.boolean().optional().describe('Run only this test (for debugging)'),
    executionContext: executionContextSchema.describe('Test-specific ExecutionContext overrides'),
    mockOverrides: z
      .array(
        z
          .object({
            state: z.string().describe('State name to mock'),
            type: z
              .enum(['fixed', 'conditional', 'stateful', 'error', 'itemReader'])
              .describe('Mock type'),
            response: jsonValueSchema.optional().describe('Mock response'),
            error: jsonValueSchema.optional().describe('Error to throw'),
            delay: z.number().optional().describe('Delay in milliseconds'),
            conditions: z
              .array(jsonValueSchema)
              .optional()
              .describe('Conditions for conditional mock'),
            responses: z.array(jsonValueSchema).optional().describe('Responses for stateful mock'),
            data: jsonValueSchema.optional().describe('Data for itemReader mock'),
            dataFile: z.string().optional().describe('Path to data file'),
            dataFormat: z
              .enum(['json', 'csv', 'jsonl', 'yaml'])
              .optional()
              .describe('Data file format'),
          })
          .strict(),
      )
      .optional()
      .describe('Test-specific mock configurations'),
  })
  .strict()
  .refine((data) => 'input' in data, {
    message: 'input is required',
    path: ['input'],
  })

// Settings schema
const settingsSchema = z
  .object({
    timeout: z.number().optional().describe('Default timeout in ms'),
    parallel: z.boolean().optional().describe('Run tests in parallel'),
    stopOnFailure: z.boolean().optional().describe('Stop on first failure'),
    verbose: z.boolean().optional().describe('Verbose output'),
    strict: z.boolean().optional().describe('Strict mode'),
  })
  .strict()
  .describe('Test suite settings')

// Assertions schema
const assertionsSchema = z
  .object({
    outputMatching: z.enum(['exact', 'partial']).optional().describe('Output matching mode'),
    pathMatching: z.enum(['exact', 'includes']).optional().describe('Path matching mode'),
    stateMatching: z.enum(['exact', 'partial']).optional().describe('State matching mode'),
  })
  .strict()
  .describe('Assertion settings')

// Test suite schema
export const testSuiteSchema = z
  .object({
    version: z.string().describe('Test suite version'),
    name: z.string().describe('Test suite name'),
    description: z.string().optional().describe('Test suite description'),
    stateMachine: z.string().optional().describe('State machine name or path to ASL JSON file'),
    baseMock: z.string().optional().describe('Mock configuration name or path to YAML file'),
    executionContext: executionContextSchema.describe('Suite-wide ExecutionContext defaults'),
    testCases: z.array(testCaseSchema).describe('Test cases to run'),
    settings: settingsSchema.optional().describe('Test suite settings'),
    assertions: assertionsSchema.optional().describe('Default assertion settings'),
  })
  .strict()
  .describe('Test suite configuration')

// Type exports
export type TestSuite = z.infer<typeof testSuiteSchema>
export type TestCase = z.infer<typeof testCaseSchema>
export type MapExpectation = z.infer<typeof mapExpectationSchema>
export type StateExpectation = z.infer<typeof stateExpectationSchema>
export type ParallelExpectation = z.infer<typeof parallelExpectationSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Assertions = z.infer<typeof assertionsSchema>

// Extract MockOverride type from TestCase
export type MockOverride = NonNullable<TestCase['mockOverrides']>[number]
