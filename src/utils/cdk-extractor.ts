import type { JsonObject } from '../types/asl'

/**
 * Extract Step Functions state machine definition from CDK/CloudFormation template
 */
export function extractStateMachineFromCDK(cdkTemplate: JsonObject): JsonObject {
  const resources = (cdkTemplate.Resources as JsonObject) || {}

  for (const [, resource] of Object.entries(resources)) {
    const res = resource as JsonObject
    if (res.Type === 'AWS::StepFunctions::StateMachine') {
      const properties = res.Properties as JsonObject | undefined
      const definition = properties?.Definition || properties?.DefinitionString
      if (typeof definition === 'string') {
        return JSON.parse(definition) as JsonObject
      }
      if (definition && typeof definition === 'object') {
        return definition as JsonObject
      }
    }
  }

  throw new Error('No Step Functions state machine found in CDK template')
}
