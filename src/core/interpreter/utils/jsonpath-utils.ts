/**
 * JSONPath Utilities
 * Centralized utilities for JSONPath operations to avoid code duplication
 */

import * as jsonpathPlus from 'jsonpath-plus'
import type { JsonObject, JsonValue } from '../../../types/asl'

const { JSONPath } = jsonpathPlus

export class JSONPathUtils {
  /**
   * Evaluate a JSONPath expression against data
   */
  static evaluate(path: string, data: JsonValue): JsonValue {
    try {
      const result = JSONPath({
        path,
        json: data,
        wrap: false,
      })
      return result
    } catch (error) {
      throw new Error(`JSONPath evaluation failed for "${path}": ${error}`)
    }
  }

  /**
   * Evaluate JSONPath with array wrapping disabled (returns single value or array as-is)
   */
  static evaluateWithoutWrap(path: string, data: JsonValue): JsonValue {
    try {
      return JSONPath({
        path,
        json: data,
        wrap: false,
      })
    } catch (error) {
      throw new Error(`JSONPath evaluation failed for "${path}": ${error}`)
    }
  }

  /**
   * Evaluate JSONPath and return first result or default value
   */
  static evaluateFirst(
    path: string,
    data: JsonValue,
    ...rest: [JsonValue?]
  ): JsonValue | undefined {
    const hasDefaultValue = rest.length > 0
    const defaultValue = hasDefaultValue ? rest[0] : null

    try {
      const result = JSONPath({ path, json: data })
      // If result is an empty array, it means the path doesn't exist
      if (Array.isArray(result) && result.length === 0) {
        return defaultValue
      }
      // Return first element if result is array, otherwise return result itself
      return Array.isArray(result) ? result[0] : result
    } catch (_error) {
      return defaultValue
    }
  }

  /**
   * Evaluate JSONPath and always return an array
   */
  static evaluateAsArray(path: string, data: JsonValue): JsonValue[] {
    try {
      const result = JSONPath({ path, json: data })
      return Array.isArray(result) ? result : []
    } catch (_error) {
      return []
    }
  }

  /**
   * Check if a path exists in the data
   */
  static pathExists(path: string, data: JsonValue): boolean {
    try {
      const result = JSONPath({ path, json: data })
      return Array.isArray(result) && result.length > 0
    } catch (_error) {
      return false
    }
  }

  /**
   * Evaluate JSONPath for context-aware operations (e.g., $$.Context.* patterns)
   */
  static evaluateWithContext(path: string, data: JsonValue, context: JsonValue): JsonValue {
    try {
      // If path starts with $$., replace the $$ with the context path
      if (path.startsWith('$$.')) {
        const contextPath = path.replace(/^\$\$\./, '')
        return JSONPath({
          path: `$.${contextPath}`,
          json: context,
        })
      }

      // Otherwise, evaluate normally
      return JSONPath({
        path,
        json: data,
        wrap: false,
      })
    } catch (error) {
      throw new Error(`JSONPath context evaluation failed for "${path}": ${error}`)
    }
  }

  /**
   * Extract ItemsPath data for Map/DistributedMap states
   */
  static extractItemsArray(
    itemsPath: string,
    input: JsonValue,
    variables?: JsonObject,
  ): JsonValue[] {
    if (itemsPath === '$') {
      if (!Array.isArray(input)) {
        throw new Error('Input must be an array when ItemsPath is "$"')
      }
      return input
    }

    // Handle variable references ($varName)
    if (
      variables &&
      itemsPath.startsWith('$') &&
      !itemsPath.startsWith('$.') &&
      !itemsPath.startsWith('$[')
    ) {
      const varName = itemsPath.substring(1)

      // Handle nested variable paths (e.g., $config.items)
      if (varName.includes('.')) {
        const parts = varName.split('.')
        let current: JsonValue = variables[parts[0]]

        for (let i = 1; i < parts.length; i++) {
          if (current === null || current === undefined) {
            throw new Error(`ItemsPath "${itemsPath}" references undefined variable`)
          }
          if (typeof current === 'object' && !Array.isArray(current)) {
            current = (current as JsonObject)[parts[i]]
          } else {
            throw new Error(`ItemsPath "${itemsPath}" references invalid path`)
          }
        }

        if (!Array.isArray(current)) {
          throw new Error(`ItemsPath "${itemsPath}" must resolve to an array`)
        }
        return current
      }

      // Simple variable reference
      const items = variables[varName]
      if (!Array.isArray(items)) {
        throw new Error(`ItemsPath "${itemsPath}" must resolve to an array`)
      }
      return items
    }

    const result = JSONPath({
      path: itemsPath,
      json: input,
    })

    // JSONPath can return a single value or array
    // For ItemsPath, we need to get the first result if it's an array of results
    const items = Array.isArray(result) && result.length > 0 ? result[0] : result

    if (!Array.isArray(items)) {
      throw new Error(`ItemsPath "${itemsPath}" must resolve to an array`)
    }

    return items
  }
}
