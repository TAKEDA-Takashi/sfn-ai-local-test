import type { ExecutionContext, JsonObject, JsonValue, StateMachine } from '../../types/asl'
import type { StateExecution } from '../../types/test'
import { deepClone } from '../../utils/deep-clone'
import type { MockEngine } from '../mock/engine'
import type { StateExecutionResult } from './states/base'
import { StateExecutorFactory } from './states/state-executor-factory'

export interface ExecutionOptions {
  verbose?: boolean
  quiet?: boolean
  maxSteps?: number
}

export interface ExecutionResult {
  output: JsonValue
  executionPath: string[]
  stateExecutions?: StateExecution[]
  mapExecutions?: JsonObject[]
  parallelExecutions?: JsonObject[]
  variables?: Record<string, JsonValue>
  success: boolean
  error?: string
}

export class StateMachineExecutor {
  private stateMachine: StateMachine
  private mockEngine?: MockEngine

  constructor(stateMachine: StateMachine, mockEngine?: MockEngine) {
    // StateMachine should already be properly structured and converted
    this.stateMachine = stateMachine
    this.mockEngine = mockEngine
  }

  private isExecutionContext(value: JsonValue | ExecutionContext): value is ExecutionContext {
    // ExecutionContextには必須フィールドがあるので、それらを確認
    // JsonValueの可能性を最初に除外
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false
    }

    // 必須フィールドの型チェック（キャストを避ける）
    return (
      'currentState' in value &&
      typeof value.currentState === 'string' &&
      'executionPath' in value &&
      Array.isArray(value.executionPath) &&
      value.executionPath.every((item) => typeof item === 'string') &&
      'variables' in value &&
      typeof value.variables === 'object' &&
      value.variables !== null &&
      !Array.isArray(value.variables) &&
      'input' in value
    )
  }

  async execute(
    input: JsonValue | ExecutionContext,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    // Single state has already been handled in constructor
    const startAt = this.stateMachine.StartAt

    let context: ExecutionContext
    if (this.isExecutionContext(input)) {
      context = input
      if (!context.currentState) {
        context.currentState = startAt
      }
      // Ensure required fields for tracking are present
      if (!context.stateExecutions) {
        context.stateExecutions = []
      }
      if (!context.parallelExecutions) {
        context.parallelExecutions = []
      }
      if (!context.mapExecutions) {
        context.mapExecutions = []
      }
    } else {
      context = {
        input: input,
        currentState: startAt,
        executionPath: [],
        variables: {},
        originalInput: input, // コンテキスト全体で初期入力を参照できるよう保持
        stateExecutions: [],
        currentStatePath: [],
        mapExecutions: [],
        // JSONata用のExecutionコンテキストを追加
        Execution: {
          Id: `execution-${Date.now()}`,
          Input: input as JsonObject,
          Name: `execution-${Date.now()}`,
          RoleArn: 'arn:aws:iam::123456789012:role/StepFunctionsRole',
          StartTime: new Date().toISOString(),
        },
        parallelExecutions: [],
      }
    }

    const maxSteps = options.maxSteps || 1000
    let steps = 0

    try {
      while (context.currentState && steps < maxSteps) {
        steps++

        // Get the state from the StateMachine (single states are already wrapped)
        const state = this.stateMachine.States[context.currentState]

        if (!state) {
          throw new Error(`State "${context.currentState}" not found`)
        }

        context.executionPath.push(context.currentState)

        if (options.verbose) {
          console.log(`Executing state: ${context.currentState} (${state.Type})`)
        }

        const stateInput = deepClone(context.input)
        const variablesBefore = deepClone(context.variables)

        const executor = StateExecutorFactory.create(state, this.mockEngine, this.stateMachine)
        if (!executor) {
          throw new Error(`No executor found for state type: ${state.Type}`)
        }

        let result: StateExecutionResult
        try {
          const stateResult = await executor.execute(context)
          result = stateResult

          if (result.executionPath && Array.isArray(result.executionPath)) {
            // 現在のステートは既に追加済みなので、追加分のみ取得
            const additionalPaths = result.executionPath.slice(1)
            context.executionPath.push(...additionalPaths)
          }

          if (context.stateExecutions) {
            // For Parallel states, child executions are already added by ParallelStateExecutor
            // Only add the Parallel state itself, not overwrite child executions
            if (state.Type !== 'Parallel') {
              const stateExecution: StateExecution = {
                statePath: [...(context.currentStatePath || []), context.currentState],
                state: context.currentState,
                input: stateInput,
                output: result.output !== undefined ? deepClone(result.output) : context.input,
                variablesBefore,
                variablesAfter: deepClone(context.variables),
              }
              context.stateExecutions.push(stateExecution)
            } else {
              // For Parallel states, add a summary execution but preserve child executions
              const parallelExecution: StateExecution = {
                statePath: [...(context.currentStatePath || []), context.currentState],
                state: context.currentState,
                input: stateInput,
                output: result.output !== undefined ? deepClone(result.output) : context.input,
                variablesBefore,
                variablesAfter: deepClone(context.variables),
                isParallelSummary: true, // Mark this as a summary execution
              }
              context.stateExecutions.push(parallelExecution)
            }
          }
        } catch (error) {
          if (options.verbose) {
            console.error(`State execution error in ${context.currentState}:`, error)
          }
          throw error
        }

        if (options.verbose) {
          console.log(`State execution result:`, {
            nextState: result.nextState,
            outputType: typeof result.output,
            hasError: !!result.error,
          })
        }

        if (state.Type === 'Succeed') {
          return {
            output: result.output || context.input,
            executionPath: context.executionPath,
            stateExecutions: context.stateExecutions,
            mapExecutions: context.mapExecutions,
            parallelExecutions: context.parallelExecutions,
            variables: context.variables,
            success: true,
          }
        }

        if (state.Type === 'Fail') {
          return {
            output: context.input,
            executionPath: context.executionPath,
            stateExecutions: context.stateExecutions,
            mapExecutions: context.mapExecutions,
            parallelExecutions: context.parallelExecutions,
            variables: context.variables,
            success: false,
            error: result.error,
          }
        }

        context.input = result.output
        context.currentState = result.nextState || ''

        if (options.verbose) {
          console.log(`Next state: ${context.currentState || '(none)'}`)
        }

        if ('End' in state && state.End) {
          return {
            output: context.input,
            executionPath: context.executionPath,
            stateExecutions: context.stateExecutions,
            mapExecutions: context.mapExecutions,
            parallelExecutions: context.parallelExecutions,
            variables: context.variables,
            success: true,
          }
        }
      }

      if (steps >= maxSteps) {
        throw new Error(`Execution exceeded maximum steps (${maxSteps})`)
      }

      return {
        output: context.input,
        executionPath: context.executionPath,
        stateExecutions: context.stateExecutions,
        mapExecutions: context.mapExecutions,
        parallelExecutions: context.parallelExecutions,
        variables: context.variables,
        success: true,
      }
    } catch (error) {
      return {
        output: context.input,
        executionPath: context.executionPath,
        stateExecutions: context.stateExecutions,
        mapExecutions: context.mapExecutions,
        parallelExecutions: context.parallelExecutions,
        variables: context.variables,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
