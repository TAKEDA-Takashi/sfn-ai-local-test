import { JSONPath } from 'jsonpath-plus'
import type { ExecutionContext, JsonObject, JsonValue, State } from '../../../types/asl'
import { isJSONPathState, isMap } from '../../../types/asl'
import { isJsonObject } from '../../../types/type-guards'
import { deepClone } from '../../../utils/deep-clone'
import type { ProcessingStrategy } from '../processing-strategy'
import { JSONPathProcessor } from '../utils/jsonpath-processor'

/**
 * JSONPath mode processing strategy
 * Default mode for AWS Step Functions
 */
export class JSONPathStrategy implements ProcessingStrategy {
  /**
   * Preprocess: Apply InputPath → Parameters
   */
  preprocess(input: JsonValue, state: State, context: ExecutionContext): Promise<JsonValue> {
    // This Strategy should only be used with JSONPath mode
    if (!isJSONPathState(state)) {
      throw new Error('JSONPathStrategy should only be used with JSONPath mode states')
    }

    let processedInput = this.applyInputPath(input, state)

    // Map/DistributedMap states apply Parameters per item, not to the whole input
    if ('Parameters' in state && state.Parameters && !isMap(state)) {
      processedInput = this.applyParameters(processedInput, state, context)
    }

    return Promise.resolve(processedInput)
  }

  /**
   * Postprocess: Apply ResultSelector → ResultPath → OutputPath → Assign
   */
  postprocess(
    result: JsonValue,
    originalInput: JsonValue,
    state: State,
    context: ExecutionContext,
  ): Promise<JsonValue> {
    if (!isJSONPathState(state)) {
      throw new Error('JSONPathStrategy should only be used with JSONPath mode states')
    }

    let processedResult = result
    if ('ResultSelector' in state && state.ResultSelector) {
      processedResult = this.applyResultSelector(result, state)
    }

    let output = this.applyResultPath(originalInput, processedResult, state)

    output = this.applyOutputPath(output, state)

    if ('Assign' in state && state.Assign) {
      // Assign gets values from ResultSelector output (derived from Task execution result)
      this.applyAssign(processedResult, state, context)
    }

    return Promise.resolve(output)
  }

  /**
   * Apply InputPath to filter input
   */
  private applyInputPath(input: JsonValue, state: State): JsonValue {
    const inputPath = 'InputPath' in state ? state.InputPath : undefined
    if (inputPath === undefined || inputPath === '$') {
      return input
    }
    if (inputPath === null) {
      return null
    }

    const result = JSONPath({
      path: inputPath,
      json: input,
      wrap: false,
    })

    return result !== undefined ? result : null
  }

  /**
   * Apply Parameters (payload template processing)
   */
  private applyParameters(input: JsonValue, state: State, context: ExecutionContext): JsonValue {
    const parameters = 'Parameters' in state ? state.Parameters : undefined
    if (!parameters) {
      return input
    }

    return this.processPayloadTemplate(parameters, input, context)
  }

  /**
   * ResultSelector の適用（ペイロードテンプレート処理）
   */
  private applyResultSelector(result: JsonValue, state: State): JsonValue {
    const resultSelector = 'ResultSelector' in state ? state.ResultSelector : undefined
    if (!resultSelector) {
      return result
    }

    // AWS仕様: ResultSelector内の $ はタスクの結果を参照
    return this.processPayloadTemplate(resultSelector, result)
  }

  /**
   * Apply ResultPath to merge result with original input
   */
  private applyResultPath(originalInput: JsonValue, result: JsonValue, state: State): JsonValue {
    const resultPath = 'ResultPath' in state ? state.ResultPath : undefined
    if (resultPath === undefined || resultPath === '$') {
      return result
    }
    if (resultPath === null) {
      return originalInput
    }

    // ResultPathが指定されている場合、元の入力にresultを挿入
    if (!isJsonObject(originalInput)) {
      // 元の入力がオブジェクトでない場合は、新しいオブジェクトを作成
      const pathParts = resultPath.slice(2).split('.')

      return pathParts.reduceRight<JsonValue>((value, key) => ({ [key]: value }), result)
    }

    // 元の入力がオブジェクトの場合はディープコピーして挿入
    const output = deepClone(originalInput)
    const pathParts = resultPath.slice(2).split('.')

    // 最後の要素以外をたどって、必要に応じてオブジェクトを作成
    let current = output
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!isJsonObject(current[pathParts[i]])) {
        current[pathParts[i]] = {}
      }
      current = current[pathParts[i]] as JsonObject
    }

    current[pathParts[pathParts.length - 1]] = result
    return output
  }

  /**
   * Apply OutputPath to filter output
   */
  private applyOutputPath(output: JsonValue, state: State): JsonValue {
    const outputPath = 'OutputPath' in state ? state.OutputPath : undefined
    if (outputPath === undefined || outputPath === '$') {
      return output
    }
    if (outputPath === null) {
      return null
    }

    const result = JSONPath({
      path: outputPath,
      json: output,
      wrap: false,
    })

    return result !== undefined ? result : null
  }

  /**
   * Process payload template with JSONPath expressions
   */
  private processPayloadTemplate(
    template: JsonObject,
    data: JsonValue,
    executionContext?: ExecutionContext,
  ): JsonValue {
    const options = {
      context: executionContext,
      handleIntrinsics: true,
      contextPathHandler: executionContext
        ? (path: string) => {
            if (path.startsWith('$$.')) {
              const contextPath = path.replace(/^\$\$\./, '')
              return JSONPath({
                path: `$.${contextPath}`,
                json: executionContext,
                wrap: false,
              })
            }
            return null
          }
        : undefined,
    }

    return JSONPathProcessor.processParameters(template, data, options)
  }

  /**
   * Apply Assign to update Variables
   */
  private applyAssign(output: JsonValue, state: State, context: ExecutionContext): void {
    const assign = state.Assign
    if (!assign || typeof assign !== 'object') {
      return
    }

    if (!context.variables) {
      context.variables = {}
    }

    // First, evaluate all expressions with the current variable state
    const evaluatedValues: JsonObject = {}

    for (const [key, value] of Object.entries(assign)) {
      const isJSONPath = key.endsWith('.$')
      const variableName = isJSONPath ? key.slice(0, -2) : key

      if (isJSONPath && typeof value === 'string') {
        evaluatedValues[variableName] = this.evaluateAssignValue(value, output, context)
      } else {
        evaluatedValues[variableName] = value
      }
    }

    for (const [variableName, value] of Object.entries(evaluatedValues)) {
      context.variables[variableName] = value
    }
  }

  /**
   * Evaluate an assignment value that may contain intrinsic functions, variable references, or JSONPath
   */
  private evaluateAssignValue(
    value: string,
    output: JsonValue,
    context: ExecutionContext,
  ): JsonValue {
    if (value.includes('States.')) {
      // Replace variable references ($varName) with actual values
      const expandedValue = value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, varName) => {
        if (context.variables && varName in context.variables) {
          const varValue = context.variables[varName]
          // For intrinsic functions, we need to preserve the type
          if (typeof varValue === 'string') {
            return `"${varValue}"`
          }
          return JSON.stringify(varValue)
        }
        return match // Keep original if variable not found
      })

      return JSONPathProcessor.evaluateStringValue(expandedValue, output, {
        handleIntrinsics: true,
        context: { variables: context.variables },
      })
    }

    if (value.startsWith('$$.')) {
      const contextObj = {
        State: {
          EnteredTime: new Date().toISOString(),
          Name: context.currentState,
        },
        Execution: {
          Input: context.originalInput,
        },
        Map: context.Map,
      }

      const contextPath = value.slice(3)
      const result = JSONPath({
        path: `$.${contextPath}`,
        json: contextObj,
        wrap: false,
      })
      return result !== undefined ? result : null
    }

    if (value.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      const varName = value.slice(1)
      if (context.variables && varName in context.variables) {
        return context.variables[varName]
      }
      return null
    }

    // Regular JSONPath from output
    const result = JSONPath({
      path: value,
      json: output,
      wrap: false,
    })
    return result !== undefined ? result : null
  }
}
