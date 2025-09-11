import type { JsonObject } from '../types/asl'
import { isJsonObject } from '../types/type-guards'

/**
 * Extract Step Functions state machine definition from CDK/CloudFormation template
 */
export function extractStateMachineFromCDK(cdkTemplate: JsonObject): JsonObject {
  const resources = isJsonObject(cdkTemplate.Resources) ? cdkTemplate.Resources : {}

  for (const [, resource] of Object.entries(resources)) {
    if (!isJsonObject(resource)) continue
    if (resource.Type === 'AWS::StepFunctions::StateMachine') {
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
    }
  }

  throw new Error('No Step Functions state machine found in CDK template')
}
