import crypto from 'node:crypto'
import * as jsonpathPlus from 'jsonpath-plus'
import { v4 as uuidv4 } from 'uuid'
import type { JsonArray, JsonObject, JsonValue } from '../../../types/asl'

const { JSONPath } = jsonpathPlus

export class JSONPathEvaluator {
  /**
   * Evaluate a JSONPath expression with Step Functions intrinsic functions
   */
  static evaluate(expression: string, data: JsonValue): JsonValue {
    if (JSONPathEvaluator.containsIntrinsicFunction(expression)) {
      return JSONPathEvaluator.evaluateIntrinsicFunction(expression, data)
    }

    const result = JSONPath({
      path: expression,
      json: data,
      wrap: false,
    })

    return result
  }

  /**
   * Check if expression contains an intrinsic function
   */
  private static containsIntrinsicFunction(expression: string): boolean {
    return expression.includes('States.')
  }

  /**
   * Evaluate intrinsic function
   */
  private static evaluateIntrinsicFunction(expression: string, data: JsonValue): JsonValue {
    const match = expression.match(/States\.(\w+)\((.*)\)/)
    if (!match) {
      throw new Error(`Invalid intrinsic function syntax: ${expression}`)
    }

    const [, functionName, args] = match
    const parsedArgs = JSONPathEvaluator.parseArguments(args || '', data)

    switch (functionName) {
      case 'Array':
        return JSONPathEvaluator.statesArray(...parsedArgs)
      case 'ArrayPartition':
        return JSONPathEvaluator.statesArrayPartition(
          parsedArgs[0] as JsonArray,
          parsedArgs[1] as number,
        )
      case 'ArrayContains':
        return JSONPathEvaluator.statesArrayContains(
          parsedArgs[0] as JsonArray,
          parsedArgs[1] as JsonValue,
        )
      case 'ArrayRange':
        return JSONPathEvaluator.statesArrayRange(
          parsedArgs[0] as number,
          parsedArgs[1] as number,
          parsedArgs[2] as number,
        )
      case 'ArrayGetItem':
        return JSONPathEvaluator.statesArrayGetItem(
          parsedArgs[0] as JsonArray,
          parsedArgs[1] as number,
        )
      case 'ArrayLength':
        return JSONPathEvaluator.statesArrayLength(parsedArgs[0] as JsonValue[])
      case 'ArrayUnique':
        return JSONPathEvaluator.statesArrayUnique(parsedArgs[0] as JsonValue[])

      case 'Base64Encode':
        return JSONPathEvaluator.statesBase64Encode(parsedArgs[0] as string)
      case 'Base64Decode':
        return JSONPathEvaluator.statesBase64Decode(parsedArgs[0] as string)

      case 'Hash':
        return JSONPathEvaluator.statesHash(
          parsedArgs[0] as JsonValue,
          parsedArgs[1] as string | undefined,
        )

      case 'JsonMerge':
        return JSONPathEvaluator.statesJsonMerge(
          parsedArgs[0] as JsonObject,
          parsedArgs[1] as JsonObject,
          parsedArgs[2] as boolean | undefined,
        )
      case 'StringToJson':
        return JSONPathEvaluator.statesStringToJson(parsedArgs[0] as string)
      case 'JsonToString':
        return JSONPathEvaluator.statesJsonToString(parsedArgs[0] as JsonValue)

      case 'MathRandom':
        return JSONPathEvaluator.statesMathRandom(
          parsedArgs[0] as number,
          parsedArgs[1] as number,
          parsedArgs[2] as number,
        )
      case 'MathAdd':
        return JSONPathEvaluator.statesMathAdd(parsedArgs[0] as number, parsedArgs[1] as number)

      case 'StringSplit':
        return JSONPathEvaluator.statesStringSplit(parsedArgs[0] as string, parsedArgs[1] as string)
      case 'Format':
        return JSONPathEvaluator.statesFormat(parsedArgs[0] as string, ...parsedArgs.slice(1))

      case 'UUID':
        return JSONPathEvaluator.statesUUID()

      default:
        throw new Error(`Unknown intrinsic function: States.${functionName}`)
    }
  }

  /**
   * Parse function arguments
   */
  private static parseArguments(argsString: string, data: JsonValue): JsonArray {
    if (!argsString.trim()) return []

    const args: JsonArray = []
    let current = ''
    let depth = 0
    let inString = false
    let escapeNext = false

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i]

      if (escapeNext) {
        current += char
        escapeNext = false
        continue
      }

      if (char === '\\') {
        escapeNext = true
        current += char
        continue
      }

      if (char === '"' || char === "'") {
        inString = !inString
        current += char
        continue
      }

      if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth++
        } else if (char === ')' || char === ']' || char === '}') {
          depth--
        } else if (char === ',' && depth === 0) {
          args.push(JSONPathEvaluator.evaluateArgument(current.trim(), data))
          current = ''
          continue
        }
      }

      current += char
    }

    if (current.trim()) {
      args.push(JSONPathEvaluator.evaluateArgument(current.trim(), data))
    }

    return args
  }

  /**
   * Evaluate a single argument
   */
  private static evaluateArgument(arg: string, data: JsonValue): JsonValue {
    if (arg === '$') {
      return data
    }
    if (arg.startsWith('$.') || arg.startsWith('$[')) {
      return JSONPathEvaluator.evaluate(arg, data)
    }

    if (arg.includes('States.')) {
      return JSONPathEvaluator.evaluateIntrinsicFunction(arg, data)
    }

    try {
      return JSON.parse(arg) as JsonValue
    } catch {
      return arg.replace(/^["']|["']$/g, '')
    }
  }

  private static statesArray(...args: JsonValue[]): JsonArray {
    return args
  }

  private static statesArrayPartition(array: JsonArray, size: number): JsonArray[] {
    if (!Array.isArray(array)) return []

    const result: JsonArray[] = []
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size))
    }
    return result
  }

  private static statesArrayContains(array: JsonArray, value: JsonValue): boolean {
    if (!Array.isArray(array)) {
      throw new Error('Invalid arguments in States.ArrayContains')
    }
    return array.some((item) => JSON.stringify(item) === JSON.stringify(value))
  }

  private static statesArrayRange(start: number, end: number, step: number = 1): number[] {
    const result: number[] = []
    start = Math.round(start)
    end = Math.round(end)
    step = Math.round(step) || 1

    if (step > 0) {
      for (let i = start; i < end; i += step) {
        result.push(i)
      }
    } else if (step < 0) {
      for (let i = start; i > end; i += step) {
        result.push(i)
      }
    }

    if (result.length > 1000) {
      throw new Error('ArrayRange cannot generate more than 1000 elements')
    }

    return result
  }

  private static statesArrayGetItem(array: JsonArray, index: number): JsonValue {
    if (!Array.isArray(array)) {
      throw new Error('Invalid arguments in States.ArrayGetItem')
    }
    const roundedIndex = Math.round(index)
    if (roundedIndex < 0 || roundedIndex >= array.length) {
      throw new Error('Invalid arguments in States.ArrayGetItem')
    }
    return array[roundedIndex] as JsonValue
  }

  private static statesArrayLength(array: JsonArray): number {
    if (!Array.isArray(array)) return 0
    return array.length
  }

  private static statesArrayUnique(array: JsonArray): JsonArray {
    if (!Array.isArray(array)) return []

    const seen = new Set<string>()
    const result: JsonArray = []

    for (const item of array) {
      const key = JSON.stringify(item)
      if (!seen.has(key)) {
        seen.add(key)
        result.push(item)
      }
    }

    return result
  }

  private static statesBase64Encode(data: string): string {
    if (typeof data !== 'string') {
      data = JSON.stringify(data)
    }
    return Buffer.from(data).toString('base64')
  }

  private static statesBase64Decode(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8')
  }

  private static statesHash(data: JsonValue, algorithm: string = 'SHA-256'): string {
    const input = typeof data === 'string' ? data : JSON.stringify(data)
    const algo = algorithm.toLowerCase().replace('-', '')

    try {
      const hash = crypto.createHash(algo)
      hash.update(input)
      return hash.digest('hex')
    } catch (_error) {
      throw new Error(`Invalid hash algorithm: ${algorithm}`)
    }
  }

  private static statesJsonMerge(
    json1: JsonObject,
    json2: JsonObject,
    deep: boolean = false,
  ): JsonObject {
    if (deep !== false) {
      throw new Error('Deep merge is not supported, third argument must be false')
    }

    return { ...json1, ...json2 }
  }

  private static statesStringToJson(jsonString: string): JsonValue {
    try {
      return JSON.parse(jsonString) as JsonValue
    } catch (_error) {
      throw new Error(`Invalid JSON string: ${jsonString}`)
    }
  }

  private static statesJsonToString(obj: JsonValue): string {
    return JSON.stringify(obj)
  }

  private static statesMathRandom(start: number, end: number, seed?: number): number {
    start = Math.round(start)
    end = Math.round(end)

    if (seed !== undefined) {
      // Simple seeded random for consistency
      const x = Math.sin(seed) * 10000
      const random = x - Math.floor(x)
      return Math.floor(random * (end - start)) + start
    }

    return Math.floor(Math.random() * (end - start)) + start
  }

  private static statesMathAdd(a: number, b: number): number {
    a = Math.round(a)
    b = Math.round(b)

    const result = a + b

    if (result > 2147483647 || result < -2147483648) {
      throw new Error('MathAdd result exceeds integer range')
    }

    return result
  }

  private static statesStringSplit(str: string, delimiter: string): string[] {
    if (typeof str !== 'string') {
      throw new Error('StringSplit requires a string as first argument')
    }

    // AWS Step Functions treats multi-character delimiters differently:
    // - If delimiter is exactly 2 characters like "::", split by that exact string
    // - If delimiter has mixed characters like ".+-", split by any of those characters

    const isRepeatedChar =
      delimiter.length > 1 && delimiter.split('').every((c) => c === delimiter[0])

    if (isRepeatedChar) {
      return str.split(delimiter)
    } else if (delimiter.length > 1) {
      const pattern = delimiter
        .split('')
        .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')
      return str.split(new RegExp(pattern))
    }

    return str.split(delimiter)
  }

  private static statesFormat(template: string, ...args: JsonValue[]): string {
    let result = template

    for (let i = 0; i < args.length; i++) {
      result = result.replace('{}', String(args[i]))
    }

    return result
  }

  private static statesUUID(): string {
    return uuidv4()
  }
}
