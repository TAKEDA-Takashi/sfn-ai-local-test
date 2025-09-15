import type { ExecutionContext, ItemProcessor, JsonValue } from '../../types/asl'
import type { MockEngine } from '../mock/engine'
import { StateExecutorFactory } from './states/state-executor-factory'

/**
 * ItemProcessor実行結果
 */
export interface ItemProcessorResult {
  output: JsonValue
  executionPath: string[]
  success: boolean
  error?: string
  variables?: Record<string, JsonValue>
}

/**
 * ItemProcessor実行コンテキスト
 */
export interface ItemProcessorContext {
  input: JsonValue
  variables?: Record<string, JsonValue>
  originalInput: JsonValue
}

/**
 * ItemProcessor execution runner for Map/Parallel states
 * Implemented as a separate class to avoid circular dependency with StateMachineExecutor
 */
export class ItemProcessorRunner {
  private itemProcessor: ItemProcessor
  private mockEngine?: MockEngine

  constructor(itemProcessor: ItemProcessor, mockEngine?: MockEngine) {
    this.itemProcessor = itemProcessor
    this.mockEngine = mockEngine
  }

  /**
   * ItemProcessorを実行する
   * @param input 入力データ
   * @returns 実行結果
   */
  execute(input: JsonValue): Promise<ItemProcessorResult> {
    const context: ItemProcessorContext = {
      input,
      variables: {},
      originalInput: input,
    }

    return this.executeWithContext(context)
  }

  /**
   * コンテキストを指定してItemProcessorを実行する
   * @param context 実行コンテキスト
   * @returns 実行結果
   */
  async executeWithContext(context: ItemProcessorContext): Promise<ItemProcessorResult> {
    const executionContext: ExecutionContext = {
      input: context.input,
      currentState: this.itemProcessor.StartAt,
      executionPath: [],
      variables: context.variables || {},
      originalInput: context.originalInput,
    }

    const maxSteps = 100
    let steps = 0

    try {
      while (executionContext.currentState && steps < maxSteps) {
        steps++

        const state = this.itemProcessor.States[executionContext.currentState]
        if (!state) {
          throw new Error(`State "${executionContext.currentState}" not found in ItemProcessor`)
        }

        // AWS Step Functions allows QueryLanguage to be inherited from ItemProcessor
        // Direct mutation is required here because spread operator would strip class methods
        const processor = this.itemProcessor
        if ('QueryLanguage' in processor) {
          const queryLanguage = processor.QueryLanguage
          if (
            queryLanguage &&
            (queryLanguage === 'JSONPath' || queryLanguage === 'JSONata') &&
            !state.QueryLanguage
          ) {
            state.QueryLanguage = queryLanguage
          }
        }

        executionContext.executionPath.push(executionContext.currentState)

        // ItemProcessor doesn't have access to the parent StateMachine context
        // so we pass undefined for the stateMachine parameter
        const executor = StateExecutorFactory.create(state, this.mockEngine)
        const result = await executor.execute(executionContext)

        if (state.isSucceed()) {
          return {
            output: result.output || executionContext.input,
            executionPath: executionContext.executionPath,
            success: true,
            variables: executionContext.variables,
          }
        }

        if (state.isFail()) {
          return {
            output: executionContext.input,
            executionPath: executionContext.executionPath,
            success: false,
            error: result.error,
            variables: executionContext.variables,
          }
        }

        executionContext.input = result.output
        executionContext.currentState = result.nextState || ''

        if ('End' in state && state.End) {
          return {
            output: executionContext.input,
            executionPath: executionContext.executionPath,
            success: true,
            variables: executionContext.variables,
          }
        }
      }

      if (steps >= maxSteps) {
        throw new Error(`ItemProcessor execution exceeded maximum steps (${maxSteps})`)
      }

      return {
        output: executionContext.input,
        executionPath: executionContext.executionPath,
        success: true,
        variables: executionContext.variables,
      }
    } catch (error) {
      return {
        output: executionContext.input,
        executionPath: executionContext.executionPath,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        variables: executionContext.variables,
      }
    }
  }
}
