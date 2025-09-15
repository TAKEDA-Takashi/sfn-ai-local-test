import crypto from 'node:crypto'
import jsonata from 'jsonata'
import { EXECUTION_CONTEXT_DEFAULTS } from '../../../constants/execution-context'
import type { JsonArray, JsonObject, JsonValue } from '../../../types/asl'
import { isJsonValue } from '../../../types/type-guards'

export class JSONataEvaluator {
  /**
   * Evaluate a JSONata expression against input data
   */
  static async evaluate(
    expression: string,
    data: JsonValue,
    bindings?: JsonObject,
  ): Promise<JsonValue | undefined> {
    try {
      const expr = jsonata(expression)

      if (bindings) {
        Object.keys(bindings).forEach((key) => {
          expr.assign(key, bindings[key])
        })
      }

      JSONataEvaluator.registerStepFunctionsFunctions(expr)

      const result = await expr.evaluate(data)

      // JSONataは undefined を返すことがある（例：$partition([],2)）
      // undefined はJSONの値ではないが、JSONataの仕様上有効な結果
      if (result === undefined) {
        return undefined
      }

      // undefined以外の場合は、有効なJSON値であることを確認
      if (!isJsonValue(result)) {
        throw new Error(`JSONata evaluation returned non-JSON value: ${typeof result}`)
      }
      return result
    } catch (error) {
      console.error('JSONata evaluation error details:', error)
      throw new Error(
        `JSONata evaluation failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      )
    }
  }

  /**
   * Register Step Functions specific JSONata functions
   */
  // biome-ignore lint/suspicious/noExplicitAny: jsonata library has no proper type definitions
  private static registerStepFunctionsFunctions(expr: any): void {
    // $partition - equivalent of States.ArrayPartition
    expr.registerFunction('partition', (...args: JsonValue[]) => {
      const array = args[0]
      const chunkSize = args[1] as number
      if (!Array.isArray(array)) return undefined // AWS returns undefined for non-array
      if (array.length === 0) return undefined // AWS returns undefined for empty array

      const result: JsonArray[] = []
      for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize))
      }
      return result
    })

    // $range - equivalent of States.ArrayRange
    // AWS requires all 3 parameters and includes the end value
    expr.registerFunction('range', (...args: JsonValue[]) => {
      const start = args[0] as number
      const end = args[1] as number
      const step = args[2] as number
      if (step === undefined) {
        throw new Error('$range requires 3 arguments: start, end, and step')
      }

      const result: number[] = []
      if (step > 0) {
        for (let i = start; i <= end; i += step) {
          // AWS includes end value
          result.push(i)
        }
      } else if (step < 0) {
        for (let i = start; i >= end; i += step) {
          // AWS includes end value
          result.push(i)
        }
      } else {
        // step = 0 should return single value if start equals end
        if (start === end) {
          return start // AWS returns single value, not array
        }
      }

      // AWS returns single value if result has only one element
      if (result.length === 1) {
        return result[0]
      }

      return result
    })

    // $hash - equivalent of States.Hash
    expr.registerFunction('hash', (...args: JsonValue[]) => {
      const data = args[0]
      const algorithm = (args[1] as string) || 'SHA-256'
      if (data === undefined || data === null) {
        return null // Return null for undefined/null input
      }
      const normalizedAlgo = algorithm.toLowerCase().replace('-', '')
      const hash = crypto.createHash(normalizedAlgo)
      hash.update(typeof data === 'string' ? data : JSON.stringify(data))
      return hash.digest('hex')
    })

    // $random - equivalent of States.MathRandom with optional seed
    expr.registerFunction('random', (...args: JsonValue[]) => {
      const seed = args[0] as number | undefined
      if (seed !== undefined) {
        const x = Math.sin(seed) * 10000
        return x - Math.floor(x)
      }
      return Math.random()
    })

    // $uuid - equivalent of States.UUID
    expr.registerFunction('uuid', () => {
      // Fixed value for deterministic testing (ADR-001)
      return EXECUTION_CONTEXT_DEFAULTS.FIXED_UUID
      // Original dynamic implementation:
      // return crypto.randomUUID()
    })

    // $now - returns current timestamp in ISO format
    expr.registerFunction('now', () => {
      // Fixed value for deterministic testing (ADR-001)
      return EXECUTION_CONTEXT_DEFAULTS.START_TIME
      // Original dynamic implementation:
      // return new Date().toISOString()
    })

    // $millis - returns current timestamp in milliseconds
    expr.registerFunction('millis', () => {
      // Fixed value for deterministic testing (ADR-001)
      return new Date(EXECUTION_CONTEXT_DEFAULTS.START_TIME).getTime()
      // Original dynamic implementation:
      // return Date.now()
    })

    expr.registerFunction('parse', (...args: JsonValue[]) => {
      const str = args[0] as string
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    })

    // Note: States.* functions are NOT available in JSONata
    // JSONata uses its own function syntax ($partition, $range, etc.)
    // States.* functions are only for JSONPath
  }

  /**
   * Check if a string contains JSONata expression syntax
   */
  static isJSONataExpression(str: string): boolean {
    if (str.startsWith('{%') && str.endsWith('%}')) {
      return true
    }

    const inlinePattern = /\{%[^%]*%\}/
    if (inlinePattern.test(str)) {
      return true
    }

    return false
  }
}
