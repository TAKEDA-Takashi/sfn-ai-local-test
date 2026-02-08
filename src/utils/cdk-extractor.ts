import chalk from 'chalk'
import type { JsonObject } from '../types/asl'
import { isJsonObject } from '../types/type-guards'

export interface ExtractOptions {
  stateMachineName?: string
  verbose?: boolean
}

/**
 * Extract Step Functions state machine definition from CDK/CloudFormation template
 */
export function extractStateMachineFromCDK(
  cdkTemplate: JsonObject,
  options?: ExtractOptions,
): JsonObject {
  const resources = isJsonObject(cdkTemplate.Resources) ? cdkTemplate.Resources : {}
  const stateMachines: Record<string, JsonObject> = {}

  for (const [logicalId, resource] of Object.entries(resources)) {
    if (!isJsonObject(resource)) continue
    if (resource.Type === 'AWS::StepFunctions::StateMachine') {
      stateMachines[logicalId] = resource
    }
  }

  const stateMachineCount = Object.keys(stateMachines).length

  if (stateMachineCount === 0) {
    throw new Error('No Step Functions state machine found in CDK template')
  }

  // 特定のステートマシンが指定されている場合
  if (options?.stateMachineName) {
    const resource = stateMachines[options.stateMachineName]
    if (!resource) {
      const availableNames = Object.keys(stateMachines).join(', ')
      throw new Error(
        `State machine '${options.stateMachineName}' not found. Available: ${availableNames}`,
      )
    }
    return extractDefinition(resource, options.stateMachineName)
  }

  // ステートマシンが1つだけの場合は自動的に選択
  if (stateMachineCount === 1) {
    const [logicalId, resource] = Object.entries(stateMachines)[0]
    if (options?.verbose) {
      console.log(chalk.gray(`  Auto-selected state machine: ${logicalId}`))
    }
    return extractDefinition(resource, logicalId)
  }

  // 複数のステートマシンがある場合はエラー
  const availableNames = Object.keys(stateMachines).join(', ')
  throw new Error(
    `Multiple state machines found in CDK template. Please specify one with --cdk-state-machine option.\n` +
      `Available: ${availableNames}`,
  )
}

function extractDefinition(resource: JsonObject, logicalId: string): JsonObject {
  const properties = isJsonObject(resource.Properties) ? resource.Properties : undefined
  const definition = properties?.Definition || properties?.DefinitionString
  if (typeof definition === 'string') {
    const parsed = JSON.parse(definition)
    if (!isJsonObject(parsed)) {
      throw new Error('Parsed definition is not a valid object')
    }
    return parsed
  }
  if (isJsonObject(definition)) {
    return definition
  }
  throw new Error(`Invalid state machine definition in resource '${logicalId}'`)
}
