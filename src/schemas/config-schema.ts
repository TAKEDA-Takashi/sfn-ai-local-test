/**
 * Project Configuration Schema
 *
 * Defines the structure of sfn-test.config files using Zod for type safety
 * and runtime validation.
 */

import { z } from 'zod'

/**
 * State machine configuration schema
 */
export const stateMachineConfigSchema = z.object({
  name: z.string().describe('State machine identifier'),
  source: z.object({
    type: z.enum(['cdk', 'asl']).describe('Source type: CDK template or ASL JSON'),
    path: z.string().describe('Path to source file'),
    stateMachineName: z
      .string()
      .optional()
      .describe('State machine name in CDK template (required for CDK sources)'),
  }),
})

/**
 * Project configuration schema
 */
export const projectConfigSchema = z.object({
  version: z.string().default('1.0').describe('Configuration file version'),
  paths: z
    .object({
      mocks: z.string().optional().describe('Directory for mock files'),
      testSuites: z.string().optional().describe('Directory for test suite files'),
      testData: z.string().optional().describe('Directory for test data files'),
      extracted: z.string().optional().describe('Directory for extracted ASL files'),
      coverage: z.string().optional().describe('Directory for coverage reports'),
    })
    .optional()
    .describe('Custom paths configuration'),
  stateMachines: z
    .array(stateMachineConfigSchema)
    .default([])
    .describe('List of state machine configurations'),
})

// Type exports
export type StateMachineConfig = z.infer<typeof stateMachineConfigSchema>
export type ProjectConfig = z.infer<typeof projectConfigSchema>

/**
 * Validates that CDK sources have stateMachineName defined
 */
export function validateCdkSources(config: ProjectConfig): void {
  for (const machine of config.stateMachines) {
    if (machine.source.type === 'cdk' && !machine.source.stateMachineName) {
      throw new Error(`State machine "${machine.name}" with CDK source requires stateMachineName`)
    }
  }
}
