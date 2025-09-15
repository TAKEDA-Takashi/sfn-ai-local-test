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

  // 論理演算子（クラス型）
  And?: JSONPathChoiceRule[]
  Or?: JSONPathChoiceRule[]
  Not?: JSONPathChoiceRule

  Next?: string

  constructor(data: Partial<JSONPathChoiceRule>) {
    // 基本プロパティをコピー
    Object.assign(this, data)

    // 論理演算子内を再帰的にインスタンス化
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

    // 基本フィールドをコピー
    if ('Variable' in value && typeof value.Variable === 'string') {
      result.Variable = value.Variable
    }
    if ('Next' in value && typeof value.Next === 'string') {
      result.Next = value.Next
    }

    // 文字列比較
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

    // 数値比較
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

    // ブール値比較
    if ('BooleanEquals' in value && typeof value.BooleanEquals === 'boolean') {
      result.BooleanEquals = value.BooleanEquals
    }

    // タイムスタンプ比較
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

    // 型チェック
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

    // パス比較（Path suffix）
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

    // 論理演算子（再帰的に変換） - 静的ファクトリメソッドを活用
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
   * 型判定メソッド
   */
  isJSONPath(): this is JSONPathChoiceRule {
    return true
  }

  isJSONata(): this is JSONataChoiceRule {
    return false
  }

  /**
   * 評価メソッド
   */
  evaluate(input: JsonValue, context: ExecutionContext): boolean {
    // 論理演算子の評価
    if (this.And) {
      return this.And.every((rule) => rule.evaluate(input, context))
    }

    if (this.Or) {
      return this.Or.some((rule) => rule.evaluate(input, context))
    }

    if (this.Not) {
      return !this.Not.evaluate(input, context)
    }

    // Variable評価
    if (!this.Variable) {
      return false
    }

    // IsPresent特別処理
    if (this.IsPresent !== undefined) {
      const hasPath = this.isFieldPresent(this.Variable, input, context)
      return hasPath === this.IsPresent
    }

    // 値の取得
    const value = this.getVariableValue(this.Variable, input, context)

    // 比較演算子の評価
    return this.evaluateComparisonOperator(value, input, context)
  }

  /**
   * フィールドの存在確認
   */
  private isFieldPresent(path: string, input: JsonValue, context: ExecutionContext): boolean {
    // Direct JSONPath evaluation to check if field exists
    // We need to check if the path returns any results, not the value itself

    if (path.startsWith('$.')) {
      const pathResult = JSONPath({
        path,
        json: input,
      })
      // If path returns empty array, field doesn't exist
      // If it returns array with any value (including null), field exists
      return Array.isArray(pathResult) && pathResult.length > 0
    }

    // For variable references, use the context
    const result = JSONPathProcessor.evaluateStringValue(path, input, {
      context,
      handleIntrinsics: false,
    })
    // This is a fallback - may not distinguish null values from missing fields
    return result !== null
  }

  /**
   * 変数値の取得
   */
  private getVariableValue(path: string, input: JsonValue, context: ExecutionContext): JsonValue {
    // For direct JSONPath, check if field exists first
    if (path.startsWith('$.')) {
      const pathResult = JSONPath({
        path,
        json: input,
      })
      // If path returns empty array, field doesn't exist
      if (!Array.isArray(pathResult) || pathResult.length === 0) {
        throw new Error(
          `Invalid path '${path}': The choice state's condition path references an invalid value.`,
        )
      }
      // Return the first result (could be null if field exists but has null value)
      return pathResult[0]
    }

    // For other paths (like $variableName), use JSONPathProcessor
    const result = JSONPathProcessor.evaluateStringValue(path, input, {
      context,
      handleIntrinsics: false,
    })

    // JSONPathProcessor.evaluateStringValue returns null when path not found
    // For variable references, null means the variable doesn't exist
    if (result === null) {
      throw new Error(
        `Invalid path '${path}': The choice state's condition path references an invalid value.`,
      )
    }

    return result
  }

  /**
   * ワイルドカードパターンを正規表現に変換
   */
  private wildcardToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`)
  }

  /**
   * 比較演算子の評価
   */
  private evaluateComparisonOperator(
    value: JsonValue,
    input?: JsonValue,
    context?: ExecutionContext,
  ): boolean {
    // 文字列比較
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

    // 数値比較
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

    // ブール値比較
    if (this.BooleanEquals !== undefined) {
      return Boolean(value) === this.BooleanEquals
    }

    // タイムスタンプ比較
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

    // 型チェック
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

    // パス比較演算子
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

    // Early detection of wrong mode usage (helpful error message)
    if ('Variable' in value || 'And' in value || 'Or' in value || 'Not' in value) {
      throw new Error(
        "JSONPath choice rule fields (Variable, And, Or, Not) are not supported in JSONata mode. Use 'Condition' field instead",
      )
    }

    if (!('Condition' in value) || typeof value.Condition !== 'string') {
      throw new Error('JSONata choice rule must have a Condition field')
    }

    // AWS仕様: JSONataモードではConditionは{% %}で囲まれている必要がある
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
   * 型判定メソッド
   */
  isJSONPath(): this is JSONPathChoiceRule {
    return false
  }

  isJSONata(): this is JSONataChoiceRule {
    return true
  }

  /**
   * 評価メソッド（非同期）
   */
  async evaluate(input: JsonValue, context: ExecutionContext): Promise<boolean> {
    // JSONata評価
    // $states.inputとして入力を設定
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
      // Variables directly at root level for easy access
      ...context.variables,
    }

    // Remove {% %} wrapper if present
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
