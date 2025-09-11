import type { ExecutionContext, ItemProcessor, JsonValue } from '../../types/asl'
import type { MockEngine } from '../mock/engine'
import { StateExecutorFactory } from './states/state-executor-factory'

export interface ItemProcessorResult {
  output: JsonValue
  executionPath: string[]
  success: boolean
  error?: string
  variables?: Record<string, JsonValue>
}

export interface ItemProcessorContext {
  input: JsonValue
  variables?: Record<string, JsonValue>
  originalInput: JsonValue
}

/**
 * Independent runner for ItemProcessor execution
 * This avoids circular dependency with StateMachineExecutor
 */
export class ItemProcessorRunner {
  private itemProcessor: ItemProcessor
  private mockEngine?: MockEngine

  constructor(itemProcessor: ItemProcessor, mockEngine?: MockEngine) {
    this.itemProcessor = itemProcessor
    this.mockEngine = mockEngine
  }

  execute(input: JsonValue): Promise<ItemProcessorResult> {
    const context: ItemProcessorContext = {
      input,
      variables: {},
      originalInput: input,
    }

    return this.executeWithContext(context)
  }

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

        const stateData = this.itemProcessor.States[executionContext.currentState]
        if (!stateData) {
          throw new Error(`State "${executionContext.currentState}" not found in ItemProcessor`)
        }

        // Inherit QueryLanguage from ItemProcessor if not specified on the state
        // IMPORTANT: Don't use spread operator as it removes class methods
        const processor = this.itemProcessor
        if ('QueryLanguage' in processor) {
          const queryLanguage = processor.QueryLanguage
          if (
            queryLanguage &&
            (queryLanguage === 'JSONPath' || queryLanguage === 'JSONata') &&
            !stateData.QueryLanguage
          ) {
            // Directly mutate the state object to preserve class methods
            stateData.QueryLanguage = queryLanguage
          }
        }

        executionContext.executionPath.push(executionContext.currentState)

        // stateData is already a State instance from itemProcessor.States
        const state = stateData

        // Use the StateExecutorFactory directly
        // No stateMachine parameter for ItemProcessor execution
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
