/**
 * JSONPath Expression Processor Utility
 *
 * Provides common utilities for processing JSONPath expressions in AWS Step Functions,
 * particularly handling the `.endsWith('.$')` pattern used throughout the interpreter.
 */

import { JSONPath } from 'jsonpath-plus'
import { buildExecutionId, EXECUTION_CONTEXT_DEFAULTS } from '../../../constants/execution-context'
import type { ExecutionContext, JsonObject, JsonValue } from '../../../types/asl'
import { JSONPathEvaluator } from '../expressions/jsonpath'

export interface ProcessedEntry {
  /** The processed key (without '.$' suffix if present) */
  key: string
  /** The evaluated value */
  value: JsonValue
}

export class JSONPathProcessor {
  /**
   * Process a single key-value entry that may contain JSONPath expressions
   */
  static processEntry(
    key: string,
    value: JsonValue,
    data: JsonValue,
    options?: {
      /** Custom context for intrinsic functions */
      context?: { variables?: JsonObject }
      /** Whether to handle intrinsic functions (States.*) */
      handleIntrinsics?: boolean
    },
  ): ProcessedEntry {
    const finalKey = key.endsWith('.$') ? key.slice(0, -2) : key

    if (key.endsWith('.$') && typeof value === 'string') {
      const processedValue = JSONPathProcessor.evaluateStringValue(value, data, options)
      return { key: finalKey, value: processedValue }
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const processedValue = JSONPathProcessor.processEntries(value, data, options)
      return { key: finalKey, value: processedValue }
    }

    if (Array.isArray(value)) {
      const processedValue = value.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return JSONPathProcessor.processEntries(item, data, options)
        }
        return item
      })
      return { key: finalKey, value: processedValue }
    }

    return { key: finalKey, value }
  }

  /**
   * Process a collection of key-value pairs
   */
  static processEntries(
    entries: JsonObject,
    data: JsonValue,
    options?: {
      context?: { variables?: JsonObject }
      handleIntrinsics?: boolean
    },
  ): JsonObject {
    const result: JsonObject = {}

    for (const [key, value] of Object.entries(entries)) {
      const processed = JSONPathProcessor.processEntry(key, value, data, options)
      result[processed.key] = processed.value
    }

    return result
  }

  /**
   * Evaluate a string value that may contain JSONPath expressions or intrinsic functions
   */
  static evaluateStringValue(
    value: string,
    data: JsonValue,
    options?: {
      context?: ExecutionContext | { variables?: JsonObject }
      handleIntrinsics?: boolean
    },
  ): JsonValue {
    if (options?.handleIntrinsics && value.startsWith('States.')) {
      const variables =
        options.context && 'variables' in options.context ? options.context.variables : undefined
      return JSONPathEvaluator.evaluate(value, data, variables)
    }

    if (value.startsWith('$$.') && options?.context && 'Execution' in options.context) {
      const contextPath = value.slice(3) // Remove $$. prefix
      const contextObj: JsonObject = {
        Execution: options.context.Execution || {
          StartTime: EXECUTION_CONTEXT_DEFAULTS.START_TIME,
          Id: buildExecutionId(),
          Name: EXECUTION_CONTEXT_DEFAULTS.NAME,
          RoleArn: EXECUTION_CONTEXT_DEFAULTS.ROLE_ARN,
          Input: options.context.originalInput || data,
        },
        State: options.context.State || {
          EnteredTime: EXECUTION_CONTEXT_DEFAULTS.START_TIME,
          Name: options.context.currentState || 'UnknownState',
        },
        StateMachine: options.context.StateMachine || {},
        Map: options.context.Map || {},
        Task: options.context.Task || {},
      }

      const pathResult = JSONPath({
        path: `$.${contextPath}`,
        json: contextObj,
      })
      return Array.isArray(pathResult) && pathResult.length > 0 ? pathResult[0] : null
    }

    if (value.startsWith('$')) {
      const variables =
        options?.context && 'variables' in options.context ? options.context.variables : undefined
      if (!(value.startsWith('$.') || value.startsWith('$[')) && variables) {
        const varPath = value.slice(1) // Remove the leading $

        // Find the variable name (everything before the first . or [)
        const firstDotIndex = varPath.indexOf('.')
        const firstBracketIndex = varPath.indexOf('[')
        let variableName: string
        let remainingPath: string

        if (firstDotIndex === -1 && firstBracketIndex === -1) {
          variableName = varPath
          remainingPath = ''
        } else if (
          firstBracketIndex === -1 ||
          (firstDotIndex !== -1 && firstDotIndex < firstBracketIndex)
        ) {
          // Dot comes first
          variableName = varPath.substring(0, firstDotIndex)
          remainingPath = varPath.substring(firstDotIndex)
        } else {
          // Bracket comes first
          variableName = varPath.substring(0, firstBracketIndex)
          remainingPath = varPath.substring(firstBracketIndex)
        }

        if (variableName in variables) {
          const variableValue = variables[variableName]

          if (remainingPath) {
            // Evaluate the remaining path on the variable value
            const pathResult = JSONPath({
              path: `$${remainingPath}`,
              json: variableValue,
            })
            return Array.isArray(pathResult) && pathResult.length > 0 ? pathResult[0] : null
          }

          return variableValue
        }
      }

      // Regular JSONPath on data
      const pathResult = JSONPath({
        path: value,
        json: data,
      })
      return Array.isArray(pathResult) && pathResult.length > 0 ? pathResult[0] : null
    }

    return value
  }

  /**
   * Process parameters recursively, handling all JSONPath patterns
   */
  static processParameters(
    params: JsonValue,
    data: JsonValue,
    options?: {
      context?: ExecutionContext
      handleIntrinsics?: boolean
      contextPathHandler?: (path: string) => JsonValue
      evaluateIntrinsicWithVariables?: (
        value: string,
        dataContext: JsonValue,
        context: ExecutionContext,
      ) => JsonValue
    },
  ): JsonValue {
    if (params === null || params === undefined) {
      return params
    }

    if (typeof params === 'string') {
      if (params.startsWith('$$') && options?.contextPathHandler) {
        return options.contextPathHandler(params)
      }

      if (params.endsWith('.$')) {
        return JSONPathProcessor.evaluateStringValue(params.slice(0, -2), data, {
          context: options?.context,
          handleIntrinsics: options?.handleIntrinsics,
        })
      }

      return params
    }

    if (Array.isArray(params)) {
      return params.map((item) => JSONPathProcessor.processParameters(item, data, options))
    }

    if (typeof params === 'object') {
      const processedEntries: JsonObject = {}
      for (const [key, value] of Object.entries(params)) {
        if (key.endsWith('.$')) {
          const newKey = key.slice(0, -2)
          // When key ends with .$, treat the value as a JSONPath or context path
          if (typeof value === 'string') {
            if (value.startsWith('$$') && options?.contextPathHandler) {
              processedEntries[newKey] = options.contextPathHandler(value)
            } else if (value.startsWith('States.')) {
              let dataContext = data
              if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                const inputObj = data
                dataContext = inputObj.$ !== undefined ? inputObj.$ : data
              }
              if (options?.context?.variables && options.evaluateIntrinsicWithVariables) {
                processedEntries[newKey] = options.evaluateIntrinsicWithVariables(
                  value,
                  dataContext,
                  options.context,
                )
              } else if (options?.handleIntrinsics) {
                processedEntries[newKey] = JSONPathEvaluator.evaluate(
                  value,
                  dataContext,
                  options.context?.variables,
                )
              } else {
                processedEntries[newKey] = value
              }
            } else if (value.startsWith('$')) {
              if (value === '$') {
                let dataContext = data
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                  const inputObj = data
                  dataContext = inputObj.$ !== undefined ? inputObj.$ : data
                }
                processedEntries[newKey] = dataContext
              } else {
                let dataContext = data
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                  const inputObj = data
                  dataContext = inputObj.$ !== undefined ? inputObj.$ : data
                }
                processedEntries[newKey] = JSONPathProcessor.evaluateStringValue(
                  value,
                  dataContext,
                  {
                    context: options?.context,
                    handleIntrinsics: options?.handleIntrinsics,
                  },
                )
              }
            } else {
              processedEntries[newKey] = value
            }
          } else {
            processedEntries[newKey] = JSONPathProcessor.processParameters(value, data, options)
          }
        } else {
          processedEntries[key] = JSONPathProcessor.processParameters(value, data, options)
        }
      }
      return processedEntries
    }

    return params
  }
}
