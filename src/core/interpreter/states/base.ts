import type {
  ExecutionContext,
  JsonObject,
  JsonValue,
  State,
  StateMachine,
} from '../../../types/asl'
import { isJSONataState } from '../../../types/asl'
import { isJsonObject } from '../../../types/type-guards'

import type { MockEngine } from '../../mock/engine'
import { JSONataStrategy } from '../strategies/jsonata-strategy'
import { JSONPathStrategy } from '../strategies/jsonpath-strategy'

export interface StateExecutionResult {
  output: JsonValue
  executionPath: string[]
  processedInput?: JsonValue // Input after Parameters processing
  stateExecutions?: Array<{
    statePath: string[]
    state: string
    parentState?: string
    iterationIndex?: number
    input: JsonValue
    output: JsonValue
    variablesBefore?: JsonObject
    variablesAfter?: JsonObject
    isParallelSummary?: boolean
  }>
  mapExecutions?: JsonObject[]
  parallelExecutions?: JsonObject[]
  variables?: JsonObject
  success: boolean
  nextState?: string
  error?: string
}

/**
 * ステートエグゼキュータの基底クラス
 * Strategy PatternでJSONPath/JSONata処理を分離し、Template Methodで統一フローを提供
 */
export abstract class BaseStateExecutor<TState extends State = State> {
  protected readonly state: TState
  protected readonly mockEngine?: MockEngine
  protected readonly stateMachine?: StateMachine
  protected strategy: JSONPathStrategy | JSONataStrategy

  constructor(state: TState, mockEngine?: MockEngine, stateMachine?: StateMachine) {
    this.state = state
    this.mockEngine = mockEngine
    this.stateMachine = stateMachine
    this.strategy = isJSONataState(state) ? new JSONataStrategy() : new JSONPathStrategy()
  }

  /**
   * ステートの実行 (Template Method)
   * 統一されたフロー: 前処理 → ステート処理 → 後処理
   */
  async execute(context: ExecutionContext): Promise<StateExecutionResult> {
    let preprocessedInput: JsonValue = context.input
    try {
      preprocessedInput = await this.strategy.preprocess(context.input, this.state, context)

      // Subclasses must implement state-specific logic
      const result = await this.executeState(preprocessedInput, context)

      const postprocessedOutput = await this.strategy.postprocess(
        result,
        context.input,
        this.state,
        context,
      )

      const nextState = this.determineNextState()

      return {
        output: postprocessedOutput,
        nextState,
        executionPath: [],
        processedInput: preprocessedInput,
        success: true,
        variables: context.variables,
      }
    } catch (error) {
      return this.handleError(error, context, preprocessedInput)
    }
  }

  /**
   * ステート固有の処理（サブクラスで実装）
   */
  protected abstract executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue>

  /**
   * 次の状態を決定
   */
  protected determineNextState(): string | undefined {
    return this.state.Next
  }

  /**
   * エラーハンドリング
   */
  protected handleError(
    error: unknown,
    context: ExecutionContext,
    preprocessedInput?: JsonValue,
  ): StateExecutionResult {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 設定エラーやChoice評価エラーは再投げ
    if (
      error instanceof Error &&
      (errorMessage.includes('does not support Arguments field') ||
        errorMessage.includes('Variable field is not supported in JSONata mode') ||
        errorMessage.includes('No matching choice found and no default specified') ||
        errorMessage.includes('Invalid path') ||
        errorMessage.includes("The choice state's condition path references an invalid value"))
    ) {
      throw error
    }

    // ProcessingError は Catch ルールがない場合のみ再投げ
    if (
      error instanceof Error &&
      errorMessage.includes('ProcessingError: State failed') &&
      !('Catch' in this.state && this.state.Catch)
    ) {
      throw error
    }

    if ('Catch' in this.state && this.state.Catch) {
      const matchedCatch = this.findMatchingCatch(error)
      if (matchedCatch) {
        let errorOutput = context.input

        // Preserve original input while adding error info at ResultPath
        if ('ResultPath' in matchedCatch && matchedCatch.ResultPath) {
          const errorInfo = {
            Error:
              error instanceof Error
                ? 'type' in error && typeof error.type === 'string'
                  ? error.type
                  : error.name
                : 'Error',
            Cause: error instanceof Error ? error.message : String(error),
          }
          // ResultPath処理
          if (matchedCatch.ResultPath === '$') {
            errorOutput = errorInfo
          } else {
            // 簡易的なResultPath処理（$.path形式）
            const resultPath = matchedCatch.ResultPath
            if (typeof resultPath === 'string') {
              const path = resultPath.replace('$.', '')
              // Ensure context.input is an object before spreading
              const baseOutput = isJsonObject(context.input) ? context.input : {}
              errorOutput = {
                ...baseOutput,
                [path]: errorInfo,
              }
            } else {
              errorOutput = errorInfo
            }
          }
        }

        return {
          output: errorOutput,
          nextState: typeof matchedCatch.Next === 'string' ? matchedCatch.Next : undefined,
          executionPath: [],
          processedInput: preprocessedInput,
          success: false,
          error: errorMessage,
          variables: context.variables,
        }
      }
    }

    return {
      output: preprocessedInput !== undefined ? preprocessedInput : context.input,
      executionPath: [],
      processedInput: preprocessedInput,
      success: false,
      error: errorMessage,
    }
  }

  /**
   * マッチするCatchルールを検索
   */
  protected findMatchingCatch(error: unknown): { Next?: string; ErrorEquals: string[] } | null {
    if (!('Catch' in this.state && this.state.Catch)) {
      return null
    }

    // エラータイプの特定: MockEngineが設定した error.type を優先、なければ error.name を使用
    let errorType = 'Error'
    if (error instanceof Error) {
      errorType = 'type' in error && typeof error.type === 'string' ? error.type : error.name
    }

    for (const catchRule of this.state.Catch) {
      if (
        catchRule.ErrorEquals.includes(errorType) ||
        catchRule.ErrorEquals.includes('States.ALL')
      ) {
        return catchRule
      }
    }

    return null
  }
}
