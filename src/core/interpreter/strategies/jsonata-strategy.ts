import type { ExecutionContext, JsonObject, JsonValue, State } from '../../../types/asl'
import { JSONataEvaluator } from '../expressions/jsonata'
import type { ProcessingStrategy } from '../processing-strategy'

/**
 * JSONata モードの処理戦略
 * JSONata式評価を使用した柔軟なデータ変換
 */
export class JSONataStrategy implements ProcessingStrategy {
  /**
   * 前処理: Arguments フィールドの処理
   */
  async preprocess(input: JsonValue, state: State, context: ExecutionContext): Promise<JsonValue> {
    // デバッグアサーション: このStrategyはJSONataモードでのみ使用されるべき
    if (!state.isJSONataState()) {
      throw new Error('JSONataStrategy should only be used with JSONata mode states')
    }

    if ('Arguments' in state && state.Arguments) {
      const statesContext = this.buildStatesContext(input, context)
      return await this.evaluateJSONataExpression(state.Arguments, statesContext)
    }

    // Arguments がない場合は入力をそのまま返す
    return input
  }

  /**
   * 後処理: Assign → Output の処理
   */
  async postprocess(
    result: JsonValue,
    _originalInput: JsonValue,
    state: State,
    context: ExecutionContext,
  ): Promise<JsonValue> {
    if (!state.isJSONataState()) {
      throw new Error('JSONataStrategy should only be used with JSONata mode states')
    }

    if ('Assign' in state && state.Assign) {
      await this.processAssign(state.Assign, result, context)
    }

    if ('Output' in state && state.Output) {
      const statesContext = this.buildStatesContext(context.input, context, result)
      return await this.evaluateJSONataExpression(state.Output, statesContext)
    }

    return result
  }

  /**
   * Assign フィールドの処理
   */
  private async processAssign(
    assign: JsonObject,
    result: JsonValue,
    context: ExecutionContext,
  ): Promise<void> {
    const statesContext = this.buildStatesContext(context.input, context, result)

    for (const [key, value] of Object.entries(assign)) {
      const assignedValue = await this.evaluateJSONataExpression(value, statesContext)

      if (!context.variables) {
        context.variables = {}
      }
      context.variables[key] = assignedValue
    }
  }

  /**
   * JSONata式の評価
   * {%...%}でラップされた文字列のみをJSONata式として評価
   */
  private async evaluateJSONataExpression(
    expression: JsonValue,
    statesContext: ExecutionContext,
  ): Promise<JsonValue> {
    if (typeof expression === 'string') {
      // {%...%} でラップされている場合は除去して評価
      if (expression.startsWith('{%') && expression.endsWith('%}')) {
        const jsonataExpr = expression.slice(2, -2).trim()
        return await this.executeJSONata(jsonataExpr, statesContext)
      }

      // {%...%}でラップされていない文字列はそのまま返す（AWS仕様準拠）
      return expression
    }

    if (expression && typeof expression === 'object' && !Array.isArray(expression)) {
      const result: JsonObject = {}
      for (const [key, value] of Object.entries(expression)) {
        result[key] = await this.evaluateJSONataExpression(value, statesContext)
      }
      return result
    }

    if (Array.isArray(expression)) {
      const result: JsonValue[] = []
      for (const item of expression) {
        result.push(await this.evaluateJSONataExpression(item, statesContext))
      }
      return result
    }

    // その他（null、number、boolean）はそのまま返す
    return expression
  }

  /**
   * JSONata式を実行する共通メソッド
   */
  private async executeJSONata(
    jsonataExpr: string,
    statesContext: ExecutionContext,
  ): Promise<JsonValue> {
    // statesコンテキストの構築
    const bindings: JsonObject = {
      ...statesContext.variables,
      states: {
        input: statesContext.input,
        result: statesContext.result ?? null,
        context: {
          Execution: statesContext.Execution || {},
          StateMachine: statesContext.StateMachine || {},
          State: statesContext.State || {},
          Task: statesContext.Task || {},
        },
      },
    }

    const result = await JSONataEvaluator.evaluate(jsonataExpr, statesContext.input, bindings)
    // JSONataは undefined を返すことがある（例：$partition([],2)）
    // AWS Step Functionsの仕様では、undefinedはnullとして扱われる
    return result === undefined ? null : result
  }

  /**
   * states コンテキストの構築
   */
  private buildStatesContext(
    input: JsonValue,
    context: ExecutionContext,
    result?: JsonValue,
  ): ExecutionContext {
    return {
      ...context,
      input: input,
      result: result,
      Execution: context.Execution,
      State: context.State,
      StateMachine: context.StateMachine,
      variables: context.variables || {},
    }
  }
}
