import { JSONPath } from 'jsonpath-plus'
import { JSONataEvaluator } from '../core/interpreter/expressions/jsonata'
import { JSONPathProcessor } from '../core/interpreter/utils/jsonpath-processor'
import type { ExecutionContext, JsonObject, JsonValue } from './asl'
import { isJsonObject } from './type-guards'

/**
 * JSONPath ChoiceRuleクラス
 */
export class JSONPathChoiceRule {
  Variable?: string
  StringEquals?: string
  StringLessThan?: string
  StringGreaterThan?: string
  StringLessThanEquals?: string
  StringGreaterThanEquals?: string
  StringMatches?: string
  NumericEquals?: number
  NumericLessThan?: number
  NumericGreaterThan?: number
  NumericLessThanEquals?: number
  NumericGreaterThanEquals?: number
  BooleanEquals?: boolean
  TimestampEquals?: string
  TimestampLessThan?: string
  TimestampGreaterThan?: string
  TimestampLessThanEquals?: string
  TimestampGreaterThanEquals?: string
  IsNull?: boolean
  IsPresent?: boolean
  IsNumeric?: boolean
  IsString?: boolean
  IsBoolean?: boolean
  IsTimestamp?: boolean
  StringEqualsPath?: string
  StringLessThanPath?: string
  StringGreaterThanPath?: string
  StringLessThanEqualsPath?: string
  StringGreaterThanEqualsPath?: string
  NumericEqualsPath?: string
  NumericLessThanPath?: string
  NumericGreaterThanPath?: string
  NumericLessThanEqualsPath?: string
  NumericGreaterThanEqualsPath?: string
  BooleanEqualsPath?: string
  TimestampEqualsPath?: string
  TimestampLessThanPath?: string
  TimestampGreaterThanPath?: string
  TimestampLessThanEqualsPath?: string
  TimestampGreaterThanEqualsPath?: string

  // Logical operators require recursive instantiation as class types
  And?: JSONPathChoiceRule[]
  Or?: JSONPathChoiceRule[]
  Not?: JSONPathChoiceRule

  Next?: string

  constructor(data: Partial<JSONPathChoiceRule>) {
    Object.assign(this, data)

    // Recursively instantiate logical operators to enable proper evaluation
    if (data.And && Array.isArray(data.And)) {
      this.And = data.And.map((r) => new JSONPathChoiceRule(r))
    }
    if (data.Or && Array.isArray(data.Or)) {
      this.Or = data.Or.map((r) => new JSONPathChoiceRule(r))
    }
    if (data.Not) {
      this.Not = new JSONPathChoiceRule(data.Not)
    }
  }

  /**
   * JsonValueから JSONPathChoiceRule インスタンスを作成する静的ファクトリメソッド
   * @param value 変換元のJsonValue
   * @returns JSONPathChoiceRuleインスタンス
   * @throws {Error} 変換できない場合
   */
  static fromJsonValue(value: JsonValue): JSONPathChoiceRule {
    if (!isJsonObject(value)) {
      throw new Error('Choice rule must be an object')
    }

    const result: Partial<JSONPathChoiceRule> = {}

    if ('Variable' in value && typeof value.Variable === 'string') {
      result.Variable = value.Variable
    }
    if ('Next' in value && typeof value.Next === 'string') {
      result.Next = value.Next
    }

    if ('StringEquals' in value && typeof value.StringEquals === 'string') {
      result.StringEquals = value.StringEquals
    }
    if ('StringLessThan' in value && typeof value.StringLessThan === 'string') {
      result.StringLessThan = value.StringLessThan
    }
    if ('StringGreaterThan' in value && typeof value.StringGreaterThan === 'string') {
      result.StringGreaterThan = value.StringGreaterThan
    }
    if ('StringLessThanEquals' in value && typeof value.StringLessThanEquals === 'string') {
      result.StringLessThanEquals = value.StringLessThanEquals
    }
    if ('StringGreaterThanEquals' in value && typeof value.StringGreaterThanEquals === 'string') {
      result.StringGreaterThanEquals = value.StringGreaterThanEquals
    }
    if ('StringMatches' in value && typeof value.StringMatches === 'string') {
      result.StringMatches = value.StringMatches
    }

    if ('NumericEquals' in value && typeof value.NumericEquals === 'number') {
      result.NumericEquals = value.NumericEquals
    }
    if ('NumericLessThan' in value && typeof value.NumericLessThan === 'number') {
      result.NumericLessThan = value.NumericLessThan
    }
    if ('NumericGreaterThan' in value && typeof value.NumericGreaterThan === 'number') {
      result.NumericGreaterThan = value.NumericGreaterThan
    }
    if ('NumericLessThanEquals' in value && typeof value.NumericLessThanEquals === 'number') {
      result.NumericLessThanEquals = value.NumericLessThanEquals
    }
    if ('NumericGreaterThanEquals' in value && typeof value.NumericGreaterThanEquals === 'number') {
      result.NumericGreaterThanEquals = value.NumericGreaterThanEquals
    }

    if ('BooleanEquals' in value && typeof value.BooleanEquals === 'boolean') {
      result.BooleanEquals = value.BooleanEquals
    }

    if ('TimestampEquals' in value && typeof value.TimestampEquals === 'string') {
      result.TimestampEquals = value.TimestampEquals
    }
    if ('TimestampLessThan' in value && typeof value.TimestampLessThan === 'string') {
      result.TimestampLessThan = value.TimestampLessThan
    }
    if ('TimestampGreaterThan' in value && typeof value.TimestampGreaterThan === 'string') {
      result.TimestampGreaterThan = value.TimestampGreaterThan
    }
    if ('TimestampLessThanEquals' in value && typeof value.TimestampLessThanEquals === 'string') {
      result.TimestampLessThanEquals = value.TimestampLessThanEquals
    }
    if (
      'TimestampGreaterThanEquals' in value &&
      typeof value.TimestampGreaterThanEquals === 'string'
    ) {
      result.TimestampGreaterThanEquals = value.TimestampGreaterThanEquals
    }

    if ('IsNull' in value && typeof value.IsNull === 'boolean') {
      result.IsNull = value.IsNull
    }
    if ('IsPresent' in value && typeof value.IsPresent === 'boolean') {
      result.IsPresent = value.IsPresent
    }
    if ('IsNumeric' in value && typeof value.IsNumeric === 'boolean') {
      result.IsNumeric = value.IsNumeric
    }
    if ('IsString' in value && typeof value.IsString === 'boolean') {
      result.IsString = value.IsString
    }
    if ('IsBoolean' in value && typeof value.IsBoolean === 'boolean') {
      result.IsBoolean = value.IsBoolean
    }
    if ('IsTimestamp' in value && typeof value.IsTimestamp === 'boolean') {
      result.IsTimestamp = value.IsTimestamp
    }

    if ('StringEqualsPath' in value && typeof value.StringEqualsPath === 'string') {
      result.StringEqualsPath = value.StringEqualsPath
    }
    if ('StringLessThanPath' in value && typeof value.StringLessThanPath === 'string') {
      result.StringLessThanPath = value.StringLessThanPath
    }
    if ('StringGreaterThanPath' in value && typeof value.StringGreaterThanPath === 'string') {
      result.StringGreaterThanPath = value.StringGreaterThanPath
    }
    if ('StringLessThanEqualsPath' in value && typeof value.StringLessThanEqualsPath === 'string') {
      result.StringLessThanEqualsPath = value.StringLessThanEqualsPath
    }
    if (
      'StringGreaterThanEqualsPath' in value &&
      typeof value.StringGreaterThanEqualsPath === 'string'
    ) {
      result.StringGreaterThanEqualsPath = value.StringGreaterThanEqualsPath
    }
    if ('NumericEqualsPath' in value && typeof value.NumericEqualsPath === 'string') {
      result.NumericEqualsPath = value.NumericEqualsPath
    }
    if ('NumericLessThanPath' in value && typeof value.NumericLessThanPath === 'string') {
      result.NumericLessThanPath = value.NumericLessThanPath
    }
    if ('NumericGreaterThanPath' in value && typeof value.NumericGreaterThanPath === 'string') {
      result.NumericGreaterThanPath = value.NumericGreaterThanPath
    }
    if (
      'NumericLessThanEqualsPath' in value &&
      typeof value.NumericLessThanEqualsPath === 'string'
    ) {
      result.NumericLessThanEqualsPath = value.NumericLessThanEqualsPath
    }
    if (
      'NumericGreaterThanEqualsPath' in value &&
      typeof value.NumericGreaterThanEqualsPath === 'string'
    ) {
      result.NumericGreaterThanEqualsPath = value.NumericGreaterThanEqualsPath
    }
    if ('BooleanEqualsPath' in value && typeof value.BooleanEqualsPath === 'string') {
      result.BooleanEqualsPath = value.BooleanEqualsPath
    }
    if ('TimestampEqualsPath' in value && typeof value.TimestampEqualsPath === 'string') {
      result.TimestampEqualsPath = value.TimestampEqualsPath
    }
    if ('TimestampLessThanPath' in value && typeof value.TimestampLessThanPath === 'string') {
      result.TimestampLessThanPath = value.TimestampLessThanPath
    }
    if ('TimestampGreaterThanPath' in value && typeof value.TimestampGreaterThanPath === 'string') {
      result.TimestampGreaterThanPath = value.TimestampGreaterThanPath
    }
    if (
      'TimestampLessThanEqualsPath' in value &&
      typeof value.TimestampLessThanEqualsPath === 'string'
    ) {
      result.TimestampLessThanEqualsPath = value.TimestampLessThanEqualsPath
    }
    if (
      'TimestampGreaterThanEqualsPath' in value &&
      typeof value.TimestampGreaterThanEqualsPath === 'string'
    ) {
      result.TimestampGreaterThanEqualsPath = value.TimestampGreaterThanEqualsPath
    }

    // Recursively transform logical operators using static factory method for type safety
    if ('And' in value && Array.isArray(value.And)) {
      result.And = value.And.map(JSONPathChoiceRule.fromJsonValue)
    }
    if ('Or' in value && Array.isArray(value.Or)) {
      result.Or = value.Or.map(JSONPathChoiceRule.fromJsonValue)
    }
    if ('Not' in value) {
      result.Not = JSONPathChoiceRule.fromJsonValue(value.Not)
    }

    return new JSONPathChoiceRule(result)
  }

  /**
   * 型判定メソッド - JSONPathルールかどうかを判定
   * @returns 常にtrue（JSONPathChoiceRuleインスタンスの場合）
   */
  isJSONPath(): this is JSONPathChoiceRule {
    return true
  }

  /**
   * 型判定メソッド - JSONataルールかどうかを判定
   * @returns 常にfalse（JSONPathChoiceRuleインスタンスの場合）
   */
  isJSONata(): this is JSONataChoiceRule {
    return false
  }

  /**
   * Choice条件を評価する
   * @param input 評価対象の入力データ
   * @param context 実行コンテキスト
   * @returns 条件が真の場合true、偽の場合false
   */
  evaluate(input: JsonValue, context: ExecutionContext): boolean {
    if (this.And) {
      return this.And.every((rule) => rule.evaluate(input, context))
    }

    if (this.Or) {
      return this.Or.some((rule) => rule.evaluate(input, context))
    }

    if (this.Not) {
      return !this.Not.evaluate(input, context)
    }

    if (!this.Variable) {
      return false
    }

    // IsPresent requires special handling to check field existence without value retrieval
    if (this.IsPresent !== undefined) {
      const hasPath = this.isFieldPresent(this.Variable, input, context)
      return hasPath === this.IsPresent
    }

    const value = this.getVariableValue(this.Variable, input, context)

    return this.evaluateComparisonOperator(value, input, context)
  }

  /**
   * フィールドの存在確認（値自体ではなくパスの存在を確認）
   * @param path 確認するパス
   * @param input 入力データ
   * @param context 実行コンテキスト
   * @returns フィールドが存在する場合true
   */
  private isFieldPresent(path: string, input: JsonValue, context: ExecutionContext): boolean {
    // Must check if path returns results to determine field existence,
    // not the value itself (field with null value still exists)

    if (path.startsWith('$.')) {
      const pathResult = JSONPath({
        path,
        json: input,
      })
      // Empty array means field doesn't exist,
      // any value (including null) means field exists
      return Array.isArray(pathResult) && pathResult.length > 0
    }

    const result = JSONPathProcessor.evaluateStringValue(path, input, {
      context,
      handleIntrinsics: false,
    })
    // Fallback for variable references - limitation: can't distinguish null from missing
    return result !== null
  }

  /**
   * 指定されたパスから変数値を取得
   * @param path 変数パス
   * @param input 入力データ
   * @param context 実行コンテキスト
   * @returns 変数の値
   * @throws {Error} パスが無効な場合
   */
  private getVariableValue(path: string, input: JsonValue, context: ExecutionContext): JsonValue {
    if (path.startsWith('$.')) {
      const pathResult = JSONPath({
        path,
        json: input,
      })
      if (!Array.isArray(pathResult) || pathResult.length === 0) {
        throw new Error(
          `Invalid path '${path}': The choice state's condition path references an invalid value.`,
        )
      }
      return pathResult[0]
    }

    const result = JSONPathProcessor.evaluateStringValue(path, input, {
      context,
      handleIntrinsics: false,
    })

    // Null return means variable doesn't exist (different from null value)
    if (result === null) {
      throw new Error(
        `Invalid path '${path}': The choice state's condition path references an invalid value.`,
      )
    }

    return result
  }

  /**
   * ワイルドカードパターン（* と ?）を正規表現に変換
   * @param pattern ワイルドカードパターン文字列
   * @returns 対応する正規表現オブジェクト
   */
  private wildcardToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`)
  }

  /**
   * 各種比較演算子による条件評価
   * @param value 評価対象の値
   * @param input 入力データ（Path系演算子で使用）
   * @param context 実行コンテキスト（Path系演算子で使用）
   * @returns 条件が真の場合true
   */
  private evaluateComparisonOperator(
    value: JsonValue,
    input?: JsonValue,
    context?: ExecutionContext,
  ): boolean {
    if (this.StringEquals !== undefined) {
      return value === this.StringEquals
    }
    if (this.StringLessThan !== undefined) {
      return String(value) < this.StringLessThan
    }
    if (this.StringGreaterThan !== undefined) {
      return String(value) > this.StringGreaterThan
    }
    if (this.StringLessThanEquals !== undefined) {
      return String(value) <= this.StringLessThanEquals
    }
    if (this.StringGreaterThanEquals !== undefined) {
      return String(value) >= this.StringGreaterThanEquals
    }
    if (this.StringMatches !== undefined) {
      const pattern = this.wildcardToRegex(this.StringMatches)
      return pattern.test(String(value))
    }

    if (this.NumericEquals !== undefined) {
      return value !== null && value !== undefined && Number(value) === this.NumericEquals
    }
    if (this.NumericLessThan !== undefined) {
      return value !== null && value !== undefined && Number(value) < this.NumericLessThan
    }
    if (this.NumericGreaterThan !== undefined) {
      return value !== null && value !== undefined && Number(value) > this.NumericGreaterThan
    }
    if (this.NumericLessThanEquals !== undefined) {
      return value !== null && value !== undefined && Number(value) <= this.NumericLessThanEquals
    }
    if (this.NumericGreaterThanEquals !== undefined) {
      return value !== null && value !== undefined && Number(value) >= this.NumericGreaterThanEquals
    }

    if (this.BooleanEquals !== undefined) {
      return Boolean(value) === this.BooleanEquals
    }

    if (this.TimestampEquals !== undefined) {
      const valueStr = String(value)
      return new Date(valueStr).toISOString() === new Date(this.TimestampEquals).toISOString()
    }
    if (this.TimestampLessThan !== undefined) {
      return new Date(String(value)) < new Date(this.TimestampLessThan)
    }
    if (this.TimestampGreaterThan !== undefined) {
      return new Date(String(value)) > new Date(this.TimestampGreaterThan)
    }
    if (this.TimestampLessThanEquals !== undefined) {
      return new Date(String(value)) <= new Date(this.TimestampLessThanEquals)
    }
    if (this.TimestampGreaterThanEquals !== undefined) {
      return new Date(String(value)) >= new Date(this.TimestampGreaterThanEquals)
    }

    if (this.IsNull !== undefined) {
      return (value === null) === this.IsNull
    }
    if (this.IsNumeric !== undefined) {
      return (typeof value === 'number' && !Number.isNaN(value)) === this.IsNumeric
    }
    if (this.IsString !== undefined) {
      return (typeof value === 'string') === this.IsString
    }
    if (this.IsBoolean !== undefined) {
      return (typeof value === 'boolean') === this.IsBoolean
    }
    if (this.IsTimestamp !== undefined) {
      const isTimestamp = typeof value === 'string' && !Number.isNaN(Date.parse(value))
      return isTimestamp === this.IsTimestamp
    }

    if (input !== undefined && context !== undefined) {
      if (this.StringEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.StringEqualsPath, input, context)
        return String(value) === String(compareValue)
      }
      if (this.StringLessThanPath !== undefined) {
        const compareValue = this.getVariableValue(this.StringLessThanPath, input, context)
        return String(value) < String(compareValue)
      }
      if (this.StringGreaterThanPath !== undefined) {
        const compareValue = this.getVariableValue(this.StringGreaterThanPath, input, context)
        return String(value) > String(compareValue)
      }
      if (this.StringLessThanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.StringLessThanEqualsPath, input, context)
        return String(value) <= String(compareValue)
      }
      if (this.StringGreaterThanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.StringGreaterThanEqualsPath, input, context)
        return String(value) >= String(compareValue)
      }
      if (this.NumericEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.NumericEqualsPath, input, context)
        return Number(value) === Number(compareValue)
      }
      if (this.NumericLessThanPath !== undefined) {
        const compareValue = this.getVariableValue(this.NumericLessThanPath, input, context)
        return Number(value) < Number(compareValue)
      }
      if (this.NumericGreaterThanPath !== undefined) {
        const compareValue = this.getVariableValue(this.NumericGreaterThanPath, input, context)
        return Number(value) > Number(compareValue)
      }
      if (this.NumericLessThanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.NumericLessThanEqualsPath, input, context)
        return Number(value) <= Number(compareValue)
      }
      if (this.NumericGreaterThanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(
          this.NumericGreaterThanEqualsPath,
          input,
          context,
        )
        return Number(value) >= Number(compareValue)
      }
      if (this.BooleanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.BooleanEqualsPath, input, context)
        return Boolean(value) === Boolean(compareValue)
      }
      if (this.TimestampEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.TimestampEqualsPath, input, context)
        return (
          new Date(String(value)).toISOString() === new Date(String(compareValue)).toISOString()
        )
      }
      if (this.TimestampLessThanPath !== undefined) {
        const compareValue = this.getVariableValue(this.TimestampLessThanPath, input, context)
        return new Date(String(value)) < new Date(String(compareValue))
      }
      if (this.TimestampGreaterThanPath !== undefined) {
        const compareValue = this.getVariableValue(this.TimestampGreaterThanPath, input, context)
        return new Date(String(value)) > new Date(String(compareValue))
      }
      if (this.TimestampLessThanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(this.TimestampLessThanEqualsPath, input, context)
        return new Date(String(value)) <= new Date(String(compareValue))
      }
      if (this.TimestampGreaterThanEqualsPath !== undefined) {
        const compareValue = this.getVariableValue(
          this.TimestampGreaterThanEqualsPath,
          input,
          context,
        )
        return new Date(String(value)) >= new Date(String(compareValue))
      }
    }

    return false
  }
}

/**
 * JSONata ChoiceRuleクラス
 */
export class JSONataChoiceRule {
  Condition: string
  Next: string

  constructor(data: { Condition: string; Next: string }) {
    this.Condition = data.Condition
    this.Next = data.Next
  }

  /**
   * JsonValueから JSONataChoiceRule インスタンスを作成する静的ファクトリメソッド
   * @param value 変換元のJsonValue
   * @returns JSONataChoiceRuleインスタンス
   * @throws {Error} 変換できない場合
   */
  static fromJsonValue(value: JsonValue): JSONataChoiceRule {
    if (!isJsonObject(value)) {
      throw new Error('JSONata choice rule must be an object')
    }

    // Detect JSONPath fields in JSONata mode to provide clear error message
    if ('Variable' in value || 'And' in value || 'Or' in value || 'Not' in value) {
      throw new Error(
        "JSONPath choice rule fields (Variable, And, Or, Not) are not supported in JSONata mode. Use 'Condition' field instead",
      )
    }

    if (!('Condition' in value) || typeof value.Condition !== 'string') {
      throw new Error('JSONata choice rule must have a Condition field')
    }

    // AWS requires JSONata Condition to be wrapped with {% %} brackets
    if (!(value.Condition.startsWith('{%') && value.Condition.endsWith('%}'))) {
      throw new Error(
        `JSONata Condition must be wrapped with {% and %} brackets. Got: ${value.Condition}`,
      )
    }

    if (!('Next' in value) || typeof value.Next !== 'string') {
      throw new Error('JSONata choice rule must have a Next field')
    }

    return new JSONataChoiceRule({
      Condition: value.Condition,
      Next: value.Next,
    })
  }

  /**
   * 型判定メソッド - JSONPathルールかどうかを判定
   * @returns 常にfalse（JSONataChoiceRuleインスタンスの場合）
   */
  isJSONPath(): this is JSONPathChoiceRule {
    return false
  }

  /**
   * 型判定メソッド - JSONataルールかどうかを判定
   * @returns 常にtrue（JSONataChoiceRuleインスタンスの場合）
   */
  isJSONata(): this is JSONataChoiceRule {
    return true
  }

  /**
   * JSONata条件式を評価する
   * @param input 評価対象の入力データ
   * @param context 実行コンテキスト
   * @returns 条件が真の場合true、偽の場合falseのPromise
   */
  async evaluate(input: JsonValue, context: ExecutionContext): Promise<boolean> {
    const bindings: JsonObject = {
      states: {
        input,
        context: {
          Execution: {
            ...(context.Execution || {}),
            Input: context.originalInput || {},
          },
          State: context.State || {},
          StateMachine: context.StateMachine || {},
          Map: context.Map || {},
          Task: context.Task || {},
        },
      },
      // Variables at root level for direct access like $variableName
      ...context.variables,
    }

    // Strip {% %} wrapper before evaluation (required by spec but not by JSONata)
    let expression = this.Condition
    if (expression.startsWith('{%') && expression.endsWith('%}')) {
      expression = expression.slice(2, -2).trim()
    }

    const result = await JSONataEvaluator.evaluate(expression, input, bindings)

    return Boolean(result)
  }
}

/**
 * ChoiceRuleユニオン型
 */
export type ChoiceRule = JSONPathChoiceRule | JSONataChoiceRule
