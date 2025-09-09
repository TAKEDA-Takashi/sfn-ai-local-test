import type {
  ChoiceRule,
  ExecutionContext,
  JSONPathChoiceRule,
  JsonValue,
} from '../../../types/asl'
import type { ChoiceState } from '../../../types/state-classes'
import { JSONataEvaluator } from '../expressions/jsonata'
import { isJSONataChoiceRule, isJSONPathChoiceRule } from '../utils/choice-guards'
import { JSONPathUtils } from '../utils/jsonpath-utils'
import { BaseStateExecutor } from './base'

/**
 * Choiceステートエグゼキュータ
 * 条件評価により次のステートを決定する
 */
export class ChoiceStateExecutor extends BaseStateExecutor<ChoiceState> {
  private selectedNextState?: string

  /**
   * Choiceステートの実行: 条件評価とNext状態の決定
   */
  protected async executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    // JSONata mode validationはStateFactoryで実施済み
    if (this.mockEngine) {
      try {
        const mockResponse = await this.mockEngine.getMockResponse(context.currentState, input)
        if (mockResponse && typeof mockResponse === 'object' && 'Next' in mockResponse) {
          this.selectedNextState =
            typeof mockResponse.Next === 'string' ? mockResponse.Next : undefined
          return context.input
        }
      } catch {}
    }

    // 各Choice条件を評価
    for (const choice of this.state.Choices) {
      const matched = await this.evaluateChoiceCondition(choice, input, context)

      if (matched) {
        this.selectedNextState = choice.Next
        return context.input
      }
    }

    if (this.state.Default) {
      this.selectedNextState = this.state.Default
      return context.input
    }

    throw new Error(
      `No matching choice found and no default specified for state: ${context.currentState}`,
    )
  }

  /**
   * 次の状態を決定（Choiceの場合は特別処理が必要）
   */
  protected determineNextState(): string | undefined {
    // Choice評価で決定した次の状態を返す
    return this.selectedNextState
  }

  /**
   * Choice条件の評価
   */
  private async evaluateChoiceCondition(
    choice: ChoiceRule,
    input: JsonValue,
    context: ExecutionContext,
  ): Promise<boolean> {
    if (isJSONataChoiceRule(choice) && choice.Condition) {
      return await this.evaluateJSONataCondition(choice.Condition, context)
    } else if (isJSONPathChoiceRule(choice)) {
      return this.evaluateJSONPathChoice(choice, input)
    }
    return false
  }

  /**
   * JSONPath Choice条件の評価（論理演算子とオペレータを含む）
   */
  private evaluateJSONPathChoice(choice: ChoiceRule, input: JsonValue): boolean {
    if (!isJSONPathChoiceRule(choice)) {
      return false
    }

    // 論理演算子の処理
    if (choice.And) {
      return choice.And.every((rule) => this.evaluateJSONPathChoice(rule, input))
    }

    if (choice.Or) {
      return choice.Or.some((rule) => this.evaluateJSONPathChoice(rule, input))
    }

    if (choice.Not) {
      return !this.evaluateJSONPathChoice(choice.Not, input)
    }

    if (!choice.Variable) {
      return false
    }

    const choiceRule = choice as JSONPathChoiceRule

    // IsPresentオペレータはパスの存在チェックのみ（エラーをスローしない）
    if (choiceRule.IsPresent !== undefined) {
      const isPresent = this.isFieldPresent(choice.Variable, input)
      return isPresent === choiceRule.IsPresent
    }

    // AWS Step Functionsの仕様：
    // IsPresent以外のすべてのオペレータで、存在しないパスへのアクセスはエラー
    const hasPath = this.isFieldPresent(choice.Variable, input)

    if (!hasPath) {
      // パスが存在しない場合はエラー（IsPresent以外のすべてのオペレータ）
      throw new Error(
        `Invalid path '${choice.Variable}': The choice state's condition path references an invalid value.`,
      )
    }

    const value = this.getVariableValue(choice.Variable, input)
    return this.evaluateComparisonOperator(choiceRule, value, input)
  }

  /**
   * 比較オペレータの評価
   */
  private evaluateComparisonOperator(
    choice: JSONPathChoiceRule,
    value: JsonValue,
    input: JsonValue,
  ): boolean {
    // String比較
    if (choice.StringEquals !== undefined) return value === choice.StringEquals
    if (choice.StringLessThan !== undefined) return String(value) < choice.StringLessThan
    if (choice.StringGreaterThan !== undefined) return String(value) > choice.StringGreaterThan
    if (choice.StringLessThanEquals !== undefined)
      return String(value) <= choice.StringLessThanEquals
    if (choice.StringGreaterThanEquals !== undefined)
      return String(value) >= choice.StringGreaterThanEquals

    if (choice.StringMatches !== undefined) {
      const pattern = this.wildcardToRegex(choice.StringMatches)
      return pattern.test(String(value))
    }

    // 数値比較（null/undefinedは除外）
    if (choice.NumericEquals !== undefined) {
      return value !== null && value !== undefined && Number(value) === choice.NumericEquals
    }
    if (choice.NumericLessThan !== undefined) {
      return value !== null && value !== undefined && Number(value) < choice.NumericLessThan
    }
    if (choice.NumericGreaterThan !== undefined) {
      return value !== null && value !== undefined && Number(value) > choice.NumericGreaterThan
    }
    if (choice.NumericLessThanEquals !== undefined) {
      return value !== null && value !== undefined && Number(value) <= choice.NumericLessThanEquals
    }
    if (choice.NumericGreaterThanEquals !== undefined) {
      return (
        value !== null && value !== undefined && Number(value) >= choice.NumericGreaterThanEquals
      )
    }

    // Boolean比較
    if (choice.BooleanEquals !== undefined) {
      return Boolean(value) === choice.BooleanEquals
    }

    // Timestamp比較
    if (choice.TimestampEquals !== undefined) {
      const valueStr = String(value)
      return new Date(valueStr).toISOString() === new Date(choice.TimestampEquals).toISOString()
    }
    if (choice.TimestampLessThan !== undefined) {
      return new Date(String(value)) < new Date(choice.TimestampLessThan)
    }
    if (choice.TimestampGreaterThan !== undefined) {
      return new Date(String(value)) > new Date(choice.TimestampGreaterThan)
    }
    if (choice.TimestampLessThanEquals !== undefined) {
      return new Date(String(value)) <= new Date(choice.TimestampLessThanEquals)
    }
    if (choice.TimestampGreaterThanEquals !== undefined) {
      return new Date(String(value)) >= new Date(choice.TimestampGreaterThanEquals)
    }

    // 存在確認
    if (choice.IsNull !== undefined) return (value === null) === choice.IsNull
    // IsPresentは evaluateJSONPathChoice で既に処理済み

    // 型確認
    if (choice.IsNumeric !== undefined) {
      return (typeof value === 'number' && !Number.isNaN(value)) === choice.IsNumeric
    }
    if (choice.IsString !== undefined) return (typeof value === 'string') === choice.IsString
    if (choice.IsBoolean !== undefined) return (typeof value === 'boolean') === choice.IsBoolean
    if (choice.IsTimestamp !== undefined) {
      const isTimestamp = value && !Number.isNaN(Date.parse(String(value)))
      return isTimestamp === choice.IsTimestamp
    }

    if (choice.StringEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.StringEqualsPath, input)
      return String(value) === String(compareValue)
    }
    if (choice.NumericEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.NumericEqualsPath, input)
      return Number(value) === Number(compareValue)
    }
    if (choice.BooleanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.BooleanEqualsPath, input)
      return Boolean(value) === Boolean(compareValue)
    }

    return false
  }

  /**
   * JSONPath変数の値を取得
   */
  private getVariableValue(path: string, input: JsonValue): JsonValue {
    if (path === '$') {
      return input
    }

    const result = JSONPathUtils.evaluateAsArray(path, input)
    if (result.length === 0) {
      return null
    }

    return result[0]
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
   * JSONata条件の評価
   */
  private async evaluateJSONataCondition(
    condition: string,
    context: ExecutionContext,
  ): Promise<boolean> {
    try {
      let jsonataExpression = condition
      if (condition.startsWith('{%') && condition.endsWith('%}')) {
        jsonataExpression = condition.slice(2, -2).trim()
      }

      const evaluationData = {}

      const statesObj = {
        input: context.input,
        context: {
          Execution: {
            Input: context.originalInput || context.input,
            Name: context.Execution?.Name || 'test-execution',
            RoleArn: context.Execution?.RoleArn || 'arn:aws:iam::123456789012:role/test-role',
            StartTime: context.Execution?.StartTime || new Date().toISOString(),
          },
          StateMachine: {
            Id: context.StateMachine?.Id || 'test-state-machine',
            Name: context.StateMachine?.Name || 'TestStateMachine',
          },
          State: {
            EnteredTime: context.State?.EnteredTime || new Date().toISOString(),
            Name: context.State?.Name || context.currentState,
            RetryCount: context.State?.RetryCount || 0,
          },
          Task: {
            Token: context.Task?.Token || 'test-token',
          },
        },
        result: context.result ?? null,
      }

      const bindings = {
        ...context.variables,
        states: statesObj,
      }

      const result = await JSONataEvaluator.evaluate(jsonataExpression, evaluationData, bindings)
      return Boolean(result)
    } catch (error) {
      console.warn(`JSONata condition evaluation failed: ${error}`)
      return false
    }
  }
  /**
   * フィールドが実際に存在するかを判定
   */
  private isFieldPresent(path: string, input: JsonValue): boolean {
    if (path === '$') {
      return true
    }

    if (path.startsWith('$.')) {
      const fieldPath = path.slice(2)
      const pathSegments = fieldPath.split('.')

      let current = input
      for (const segment of pathSegments) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return false
        }
        if (!Object.hasOwn(current, segment)) {
          return false
        }
        current = (current as Record<string, JsonValue>)[segment]
      }
      return true
    }

    return false
  }
}
