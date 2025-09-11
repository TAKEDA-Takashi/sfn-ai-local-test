/**
 * JSONPath Expression Processor Utility
 *
 * Provides common utilities for processing JSONPath expressions in AWS Step Functions,
 * particularly handling the `.endsWith('.$')` pattern used throughout the interpreter.
 */

import { JSONPath } from 'jsonpath-plus'
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
      context?: JsonValue
      /** Whether to handle intrinsic functions (States.*) */
      handleIntrinsics?: boolean
      /** Special data mappings for ResultSelector ($._result, $._input) */
      specialMappings?: JsonObject
    },
  ): ProcessedEntry {
    const finalKey = key.endsWith('.$') ? key.slice(0, -2) : key

    // Handle JSONPath expressions (key ends with '.$' and value is string)
    if (key.endsWith('.$') && typeof value === 'string') {
      const processedValue = JSONPathProcessor.evaluateStringValue(value, data, options)
      return { key: finalKey, value: processedValue }
    }

    // Handle nested objects (recursively process)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const processedValue = JSONPathProcessor.processEntries(value, data, options)
      return { key: finalKey, value: processedValue }
    }

    // Handle arrays (recursively process each element)
    if (Array.isArray(value)) {
      const processedValue = value.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return JSONPathProcessor.processEntries(item, data, options)
        }
        return item
      })
      return { key: finalKey, value: processedValue }
    }

    // Return as-is for other types
    return { key: finalKey, value }
  }

  /**
   * Process a collection of key-value pairs
   */
  static processEntries(
    entries: JsonObject,
    data: JsonValue,
    options?: {
      context?: JsonValue
      handleIntrinsics?: boolean
      specialMappings?: JsonObject
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
      context?: JsonValue
      handleIntrinsics?: boolean
      specialMappings?: JsonObject
    },
  ): JsonValue {
    if (options?.handleIntrinsics && value.startsWith('States.')) {
      return JSONPathEvaluator.evaluate(value, data)
    }

    if (value.startsWith('$')) {
      // Check for special mappings (e.g., $._result, $._input)
      if (options?.specialMappings) {
        for (const [prefix, mappedData] of Object.entries(options.specialMappings)) {
          if (value.startsWith(prefix)) {
            const adjustedPath = value.replace(prefix, '$')
            const pathResult = JSONPath({
              path: adjustedPath,
              json: mappedData,
            })
            if (Array.isArray(pathResult) && pathResult.length > 0) {
              const result = pathResult[0]
              return result !== undefined ? result : null
            }
            return null
          }
        }
      }

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
      specialMappings?: JsonObject
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
          handleIntrinsics: options?.handleIntrinsics,
          specialMappings: options?.specialMappings,
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
                processedEntries[newKey] = JSONPathEvaluator.evaluate(value, dataContext)
              } else {
                processedEntries[newKey] = value
              }
            } else if (value.startsWith('$')) {
              if (options?.context?.variables && value.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                const varName = value.substring(1)
                processedEntries[newKey] = options.context.variables[varName] ?? null
              } else {
                // For ResultSelector, $ references the result
                let dataContext = data
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                  const inputObj = data
                  dataContext = inputObj.$ !== undefined ? inputObj.$ : data
                }
                processedEntries[newKey] = JSONPathProcessor.evaluateStringValue(
                  value,
                  dataContext,
                  {
                    handleIntrinsics: options?.handleIntrinsics,
                    specialMappings: options?.specialMappings,
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
