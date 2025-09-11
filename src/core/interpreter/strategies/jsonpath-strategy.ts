import { JSONPath } from 'jsonpath-plus'
import type {
  ExecutionContext,
  JSONPathState,
  JsonObject,
  JsonValue,
  State,
} from '../../../types/asl'
import { deepClone } from '../../../utils/deep-clone'
import type { ProcessingStrategy } from '../processing-strategy'
import { JSONPathProcessor } from '../utils/jsonpath-processor'

/**
 * JSONPath モードの処理戦略
 * AWS Step Functions のデフォルトモード
 */
export class JSONPathStrategy implements ProcessingStrategy {
  /**
   * 前処理: InputPath → Parameters の順で処理
   */
  preprocess(input: JsonValue, state: State, _context: ExecutionContext): Promise<JsonValue> {
    // デバッグアサーション: このStrategyはJSONPathモードでのみ使用されるべき
    if (!state.isJSONPathState()) {
      throw new Error('JSONPathStrategy should only be used with JSONPath mode states')
    }

    // 1. InputPath の適用
    let processedInput = this.applyInputPath(input, state)

    // 2. Parameters の適用
    // Map/DistributedMap states apply Parameters per item, not to the whole input
    if ('Parameters' in state && state.Parameters && !state.isMap()) {
      processedInput = this.applyParameters(processedInput, state)
    }

    return Promise.resolve(processedInput)
  }

  /**
   * 後処理: ResultSelector → ResultPath → OutputPath → Assign の順で処理
   */
  postprocess(
    result: JsonValue,
    originalInput: JsonValue,
    state: State,
    context: ExecutionContext,
  ): Promise<JsonValue> {
    // デバッグアサーション
    if (!state.isJSONPathState()) {
      throw new Error('JSONPathStrategy should only be used with JSONPath mode states')
    }

    // 1. ResultSelector の適用
    let processedResult = result
    if ('ResultSelector' in state && state.ResultSelector) {
      processedResult = this.applyResultSelector(result, originalInput, state)
    }

    // 2. ResultPath の適用
    let output = this.applyResultPath(originalInput, processedResult, state)

    // 3. OutputPath の適用
    output = this.applyOutputPath(output, state)

    // 4. Assign の適用 (Variables の更新) - Task結果から直接評価
    if ('Assign' in state && state.Assign) {
      // Assignは、ResultSelectorが適用された結果（Task実行結果から作られた）から値を取得
      this.applyAssign(processedResult, state, context)
    }

    return Promise.resolve(output)
  }

  /**
   * InputPath の適用
   */
  private applyInputPath(input: JsonValue, state: JSONPathState): JsonValue {
    const inputPath = state.InputPath
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
   * Parameters の適用（ペイロードテンプレート処理）
   */
  private applyParameters(input: JsonValue, state: JSONPathState): JsonValue {
    const parameters = state.Parameters
    if (!parameters) {
      return input
    }

    return this.processPayloadTemplate(parameters, input)
  }

  /**
   * ResultSelector の適用（ペイロードテンプレート処理）
   */
  private applyResultSelector(
    result: JsonValue,
    originalInput: JsonValue,
    state: JSONPathState,
  ): JsonValue {
    const resultSelector = state.ResultSelector
    if (!resultSelector) {
      return result
    }

    const specialMappings: JsonObject = {
      '$._result': result,
      '$._input': originalInput,
    }

    return this.processPayloadTemplate(resultSelector, result, specialMappings)
  }

  /**
   * ResultPath の適用
   */
  private applyResultPath(
    originalInput: JsonValue,
    result: JsonValue,
    state: JSONPathState,
  ): JsonValue {
    const resultPath = state.ResultPath
    if (resultPath === undefined || resultPath === '$') {
      return result
    }
    if (resultPath === null) {
      return originalInput
    }

    // ResultPathが指定されている場合、元の入力にresultを挿入
    if (typeof originalInput !== 'object' || originalInput === null) {
      // 元の入力がオブジェクトでない場合は、新しいオブジェクトを作成
      const pathParts = resultPath.slice(2).split('.')
      const newObj: JsonObject = {}
      let current: JsonObject = newObj

      for (let i = 0; i < pathParts.length - 1; i++) {
        current[pathParts[i]] = {}
        const next = current[pathParts[i]]
        if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
          current = next
        }
      }
      current[pathParts[pathParts.length - 1]] = result

      return newObj
    }

    // 元の入力がオブジェクトの場合はディープコピーして挿入
    const output = deepClone(originalInput)
    const pathParts = resultPath.slice(2).split('.')

    // outputは既にオブジェクトであることが確認済み
    if (typeof output !== 'object' || output === null || Array.isArray(output)) {
      throw new Error('Unexpected output type in ResultPath processing')
    }
    let current = output

    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!(pathParts[i] in current)) {
        current[pathParts[i]] = {}
      }
      const next = current[pathParts[i]]
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        current[pathParts[i]] = {}
      }
      // 上記のチェックで current[pathParts[i]] は必ずオブジェクトになることが保証されている
      const nextObj = current[pathParts[i]]
      if (typeof nextObj !== 'object' || nextObj === null || Array.isArray(nextObj)) {
        throw new Error('Unexpected state in ResultPath processing')
      }
      current = nextObj
    }
    current[pathParts[pathParts.length - 1]] = result

    return output
  }

  /**
   * OutputPath の適用
   */
  private applyOutputPath(output: JsonValue, state: JSONPathState): JsonValue {
    const outputPath = state.OutputPath
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
   * ペイロードテンプレートの処理
   */
  private processPayloadTemplate(
    template: JsonObject,
    data: JsonValue,
    specialMappings?: JsonObject,
  ): JsonValue {
    const options = {
      context: data,
      handleIntrinsics: true,
      specialMappings,
    }

    return JSONPathProcessor.processEntries(template, data, options)
  }

  /**
   * Assign の適用 (Variables の更新)
   */
  private applyAssign(output: JsonValue, state: JSONPathState, context: ExecutionContext): void {
    const assign = state.Assign
    if (!assign || typeof assign !== 'object') {
      return
    }

    // Initialize variables if not exists
    if (!context.variables) {
      context.variables = {}
    }

    // First, evaluate all expressions with the current variable state
    const evaluatedValues: Record<string, JsonValue> = {}

    for (const [key, value] of Object.entries(assign)) {
      // Check if this is a JSONPath assignment (key ends with .$)
      const isJSONPath = key.endsWith('.$')
      const variableName = isJSONPath ? key.slice(0, -2) : key

      if (isJSONPath && typeof value === 'string') {
        // Process the value which may contain intrinsic functions or JSONPath
        evaluatedValues[variableName] = this.evaluateAssignValue(value, output, context)
      } else {
        // Static value
        evaluatedValues[variableName] = value
      }
    }

    // Then, assign all evaluated values to variables
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
    // Handle intrinsic functions with variable references
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

      // Now evaluate the intrinsic function
      return JSONPathProcessor.evaluateStringValue(expandedValue, output, {
        handleIntrinsics: true,
        context: output,
      })
    }

    // Handle context object references ($$.)
    if (value.startsWith('$$.')) {
      // Create a context object with state information
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

      const contextPath = value.slice(3) // Remove $$. prefix
      const result = JSONPath({
        path: `$.${contextPath}`,
        json: contextObj,
        wrap: false,
      })
      return result !== undefined ? result : null
    }

    // Handle variable references ($varName)
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
