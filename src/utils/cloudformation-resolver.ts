/**
 * Resolves CloudFormation intrinsic functions in templates
 */

import type { JsonObject, JsonValue } from '../types/asl'
import { isJsonObject } from '../types/type-guards'

export function resolveCloudFormationIntrinsics(
  value: JsonValue,
  resources: JsonObject = {},
  parameters: JsonObject = {},
): JsonValue {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveCloudFormationIntrinsics(item, resources, parameters))
  }

  if (isJsonObject(value)) {
    // Handle Fn::Join
    if ('Fn::Join' in value) {
      const joinParams = value['Fn::Join']
      if (Array.isArray(joinParams) && joinParams.length === 2) {
        const delimiter = joinParams[0] as string
        const values = joinParams[1]
        if (Array.isArray(values)) {
          const resolvedValues = values.map((v) =>
            resolveCloudFormationIntrinsics(v, resources, parameters),
          )
          return resolvedValues.join(delimiter)
        }
      }
    }

    // Handle Ref
    if ('Ref' in value) {
      const refName = value.Ref as string

      // Common AWS pseudo parameters
      if (refName === 'AWS::Partition') {
        return 'aws'
      }
      if (refName === 'AWS::Region') {
        return 'us-east-1'
      }
      if (refName === 'AWS::AccountId') {
        return '123456789012'
      }

      // Check parameters
      if (parameters[refName] !== undefined) {
        return parameters[refName]
      }

      // Check resources for logical ID
      if (resources[refName]) {
        const resource = resources[refName]
        if (!isJsonObject(resource)) {
          return `${refName}-PLACEHOLDER`
        }
        // For S3 buckets, return a mock name
        if (resource.Type === 'AWS::S3::Bucket') {
          return `mock-bucket-${refName.toLowerCase()}`
        }
        // For Lambda functions, return a mock ARN
        if (resource.Type === 'AWS::Lambda::Function') {
          return `arn:aws:lambda:us-east-1:123456789012:function:${refName}`
        }
      }

      // Default: return placeholder
      return `${refName}-PLACEHOLDER`
    }

    // Handle Fn::GetAtt
    if ('Fn::GetAtt' in value) {
      const getAttParams = value['Fn::GetAtt']
      if (Array.isArray(getAttParams) && getAttParams.length === 2) {
        const resourceName = getAttParams[0] as string
        const attributeName = getAttParams[1] as string

        // Mock Lambda ARN
        if (attributeName === 'Arn') {
          if (resourceName.includes('Function') || resourceName.includes('Lambda')) {
            return `arn:aws:lambda:us-east-1:123456789012:function:${resourceName}`
          }
          // Mock State Machine ARN
          if (resourceName.includes('StateMachine')) {
            return `arn:aws:states:us-east-1:123456789012:stateMachine:${resourceName}`
          }
        }

        return `${resourceName}.${attributeName}`
      }
    }

    // Handle Fn::Sub
    if ('Fn::Sub' in value) {
      const subValue = value['Fn::Sub']
      if (typeof subValue === 'string') {
        // Simple string substitution with AWS pseudo parameters
        return subValue
          .replace('${AWS::Partition}', 'aws')
          .replace('${AWS::Region}', 'us-east-1')
          .replace('${AWS::AccountId}', '123456789012')
      }
      if (Array.isArray(subValue) && subValue.length === 2) {
        let template = subValue[0] as string
        const variables = subValue[1]
        if (!isJsonObject(variables)) {
          return template
        }

        // Replace variables
        for (const [key, val] of Object.entries(variables)) {
          const resolvedVal = resolveCloudFormationIntrinsics(val, resources, parameters)
          template = template.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(resolvedVal))
        }

        // Replace AWS pseudo parameters
        template = template
          .replace('${AWS::Partition}', 'aws')
          .replace('${AWS::Region}', 'us-east-1')
          .replace('${AWS::AccountId}', '123456789012')

        return template
      }
    }

    // Recursively resolve nested objects
    const resolved: JsonObject = {}
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveCloudFormationIntrinsics(val, resources, parameters)
    }
    return resolved
  }

  return value
}
