import { JSONPath } from 'jsonpath-plus'
import {
  buildStateMachineId,
  EXECUTION_CONTEXT_DEFAULTS,
} from '../../../constants/execution-context'
import type {
  ChoiceRule,
  ExecutionContext,
  JSONPathChoiceRule,
  JsonValue,
} from '../../../types/asl'
import type { ChoiceState } from '../../../types/state-classes'
import { JSONataEvaluator } from '../expressions/jsonata'
import { isJSONataChoiceRule, isJSONPathChoiceRule } from '../utils/choice-guards'
import { JSONPathProcessor } from '../utils/jsonpath-processor'
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
    // StateFactory has already validated JSONata mode requirements
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
      return this.evaluateJSONPathChoice(choice, input, context)
    }
    return false
  }

  /**
   * JSONPath Choice条件の評価（論理演算子とオペレータを含む）
   */
  private evaluateJSONPathChoice(
    choice: ChoiceRule,
    input: JsonValue,
    context: ExecutionContext,
  ): boolean {
    if (!isJSONPathChoiceRule(choice)) {
      return false
    }

    if (choice.And) {
      return choice.And.every((rule) => this.evaluateJSONPathChoice(rule, input, context))
    }

    if (choice.Or) {
      return choice.Or.some((rule) => this.evaluateJSONPathChoice(rule, input, context))
    }

    if (choice.Not) {
      return !this.evaluateJSONPathChoice(choice.Not, input, context)
    }

    if (!choice.Variable) {
      return false
    }

    const hasPath = this.isFieldPresent(choice.Variable, input, context)

    // IsPresent only checks existence without throwing errors
    if (choice.IsPresent !== undefined) {
      return hasPath === choice.IsPresent
    }

    // AWS Step Functions spec: all operators except IsPresent throw on missing paths
    if (!hasPath) {
      throw new Error(
        `Invalid path '${choice.Variable}': The choice state's condition path references an invalid value.`,
      )
    }

    const value = this.getVariableValue(choice.Variable, input, context)
    return this.evaluateComparisonOperator(choice, value, input, context)
  }

  /**
   * 比較オペレータの評価
   */
  private evaluateComparisonOperator(
    choice: JSONPathChoiceRule,
    value: JsonValue,
    input: JsonValue,
    context: ExecutionContext,
  ): boolean {
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

    // Numeric comparisons exclude null/undefined to prevent NaN coercion
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

    if (choice.BooleanEquals !== undefined) {
      return Boolean(value) === choice.BooleanEquals
    }

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

    if (choice.IsNull !== undefined) return (value === null) === choice.IsNull
    // IsPresent is already handled in evaluateJSONPathChoice

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
      const compareValue = this.getVariableValue(choice.StringEqualsPath, input, context)
      return String(value) === String(compareValue)
    }
    if (choice.StringLessThanPath !== undefined) {
      const compareValue = this.getVariableValue(choice.StringLessThanPath, input, context)
      return String(value) < String(compareValue)
    }
    if (choice.StringGreaterThanPath !== undefined) {
      const compareValue = this.getVariableValue(choice.StringGreaterThanPath, input, context)
      return String(value) > String(compareValue)
    }
    if (choice.StringLessThanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.StringLessThanEqualsPath, input, context)
      return String(value) <= String(compareValue)
    }
    if (choice.StringGreaterThanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.StringGreaterThanEqualsPath, input, context)
      return String(value) >= String(compareValue)
    }
    if (choice.NumericEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.NumericEqualsPath, input, context)
      return Number(value) === Number(compareValue)
    }
    if (choice.BooleanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.BooleanEqualsPath, input, context)
      return Boolean(value) === Boolean(compareValue)
    }
    if (choice.TimestampEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.TimestampEqualsPath, input, context)
      return new Date(String(value)).toISOString() === new Date(String(compareValue)).toISOString()
    }
    if (choice.TimestampLessThanPath !== undefined) {
      const compareValue = this.getVariableValue(choice.TimestampLessThanPath, input, context)
      return new Date(String(value)) < new Date(String(compareValue))
    }
    if (choice.TimestampGreaterThanPath !== undefined) {
      const compareValue = this.getVariableValue(choice.TimestampGreaterThanPath, input, context)
      return new Date(String(value)) > new Date(String(compareValue))
    }
    if (choice.TimestampLessThanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.TimestampLessThanEqualsPath, input, context)
      return new Date(String(value)) <= new Date(String(compareValue))
    }
    if (choice.TimestampGreaterThanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(
        choice.TimestampGreaterThanEqualsPath,
        input,
        context,
      )
      return new Date(String(value)) >= new Date(String(compareValue))
    }
    if (choice.NumericLessThanPath !== undefined) {
      const compareValue = this.getVariableValue(choice.NumericLessThanPath, input, context)
      return Number(value) < Number(compareValue)
    }
    if (choice.NumericGreaterThanPath !== undefined) {
      const compareValue = this.getVariableValue(choice.NumericGreaterThanPath, input, context)
      return Number(value) > Number(compareValue)
    }
    if (choice.NumericLessThanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(choice.NumericLessThanEqualsPath, input, context)
      return Number(value) <= Number(compareValue)
    }
    if (choice.NumericGreaterThanEqualsPath !== undefined) {
      const compareValue = this.getVariableValue(
        choice.NumericGreaterThanEqualsPath,
        input,
        context,
      )
      return Number(value) >= Number(compareValue)
    }

    return false
  }

  /**
   * JSONPath変数の値を取得
   */
  private getVariableValue(path: string, input: JsonValue, context: ExecutionContext): JsonValue {
    // Delegate to JSONPathProcessor to handle both regular and context paths ($$.*)
    return JSONPathProcessor.evaluateStringValue(path, input, {
      context: context,
      handleIntrinsics: false,
    })
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

      // JSONata accesses context through $states object per AWS spec
      // Defaults ensure deterministic behavior for testing
      const statesObj = {
        input: context.input,
        context: {
          Execution: {
            Input: context.Execution?.Input || context.originalInput || context.input,
            Name: context.Execution?.Name || EXECUTION_CONTEXT_DEFAULTS.NAME,
            RoleArn: context.Execution?.RoleArn || EXECUTION_CONTEXT_DEFAULTS.ROLE_ARN,
            StartTime: context.Execution?.StartTime || EXECUTION_CONTEXT_DEFAULTS.START_TIME,
          },
          StateMachine: {
            Id: context.StateMachine?.Id || buildStateMachineId(),
            Name: context.StateMachine?.Name || EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME,
          },
          State: {
            EnteredTime: context.State?.EnteredTime || EXECUTION_CONTEXT_DEFAULTS.START_TIME,
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
      // Treat undefined as false per AWS Step Functions behavior
      return result === undefined ? false : Boolean(result)
    } catch (error) {
      console.warn(`JSONata condition evaluation failed: ${error}`)
      return false
    }
  }
  /**
   * フィールドが実際に存在するかを判定
   */
  private isFieldPresent(path: string, input: JsonValue, context: ExecutionContext): boolean {
    if (path === '$') {
      return true
    }

    // Variable reference pattern ($variableName)
    if (path.startsWith('$') && !path.startsWith('$.') && !path.startsWith('$[')) {
      const variableName = path.slice(1)

      // Complex path with nesting or array indices
      if (variableName.includes('.') || variableName.includes('[')) {
        try {
          const value = this.getVariableValue(path, input, context)
          // null means path doesn't exist
          return value !== null
        } catch {
          return false
        }
      }

      return variableName in context.variables
    }

    // Standard JSONPath - use JSONPath-plus to check if path exists
    if (path.startsWith('$.')) {
      try {
        const result = JSONPath({
          path: path,
          json: input,
        })
        return Array.isArray(result) && result.length > 0
      } catch {
        return false
      }
    }

    return false
  }
}
