import {
  buildExecutionId,
  buildStateMachineId,
  EXECUTION_CONTEXT_DEFAULTS,
} from '../../constants/execution-context'
import type { ExecutionContextConfig } from '../../schemas/config-schema'
import type { ExecutionContext, JsonObject, JsonValue, StateMachine } from '../../types/asl'
import type { StateExecution } from '../../types/test'
import { isJsonObject } from '../../types/type-guards'
import { deepClone } from '../../utils/deep-clone'
import type { MockEngine } from '../mock/engine'
import type { StateExecutionResult } from './states/base'
import { StateExecutorFactory } from './states/state-executor-factory'

export interface ExecutionOptions {
  verbose?: boolean
  quiet?: boolean
  maxSteps?: number
  executionContext?: ExecutionContextConfig
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
        // 固定値のExecutionコンテキスト（テストの再現性のため）
        // 設定値があれば上書き、なければデフォルト値
        Execution: {
          Id: this.createExecutionId(options.executionContext),
          Input: isJsonObject(input) ? input : {},
          Name: options.executionContext?.name || EXECUTION_CONTEXT_DEFAULTS.NAME,
          RoleArn: options.executionContext?.roleArn || EXECUTION_CONTEXT_DEFAULTS.ROLE_ARN,
          StartTime: options.executionContext?.startTime || EXECUTION_CONTEXT_DEFAULTS.START_TIME,
        },
        // StateMachineコンテキストの追加
        StateMachine: {
          Id: this.createStateMachineId(options.executionContext),
          Name: EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME,
        },
        // Stateコンテキストの初期値（各ステート実行時に更新）
        State: {
          EnteredTime: options.executionContext?.startTime || EXECUTION_CONTEXT_DEFAULTS.START_TIME,
          Name: '',
          RetryCount: 0,
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

        // Update State context with current state name
        if (context.State) {
          context.State.Name = context.currentState
        }

        if (options.verbose) {
          console.log(`Executing state: ${context.currentState} (${state.Type})`)
        }

        const stateInput = deepClone(context.input)
        const variablesBefore = deepClone(context.variables)

        const executor = StateExecutorFactory.create(state, this.mockEngine, this.stateMachine)
        if (!executor) {
          throw new Error(`No executor found for state type: ${state.Type}`)
        }

        let result: StateExecutionResult | undefined
        try {
          const stateResult = await executor.execute(context)
          result = stateResult

          // Map/DistributedMap/Parallelステートの場合、内部の実行パスは追加しない
          // これらのステートは自身のみをexecutionPathに含める
          if (
            result.executionPath &&
            Array.isArray(result.executionPath) &&
            !state.isMap() &&
            !state.isParallel()
          ) {
            // 現在のステートは既に追加済みなので、追加分のみ取得
            const additionalPaths = result.executionPath.slice(1)
            context.executionPath.push(...additionalPaths)
          }

          if (context.stateExecutions) {
            // For Parallel states, child executions are already added by ParallelStateExecutor
            // Only add the Parallel state itself, not overwrite child executions
            if (!state.isParallel()) {
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
          // エラーが発生した場合、result.errorがセットされている可能性がある
          // その場合はエラーを投げずに処理を続ける
          if (result?.error) {
            // エラーハンドリングされた結果を使用
            if (options.verbose) {
              console.log(`Error was handled by state executor: ${result.error}`)
            }
          } else {
            throw error
          }
        }

        if (options.verbose) {
          console.log(`State execution result:`, {
            nextState: result.nextState,
            outputType: typeof result.output,
            hasError: !!result.error,
          })
        }

        if (state.isSucceed()) {
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

        if (state.isFail()) {
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

  /**
   * Create Execution.Id ARN with config values
   */
  private createExecutionId(config?: ExecutionContextConfig): string {
    const name = config?.name || EXECUTION_CONTEXT_DEFAULTS.NAME
    const accountId = config?.accountId || EXECUTION_CONTEXT_DEFAULTS.ACCOUNT_ID
    const region = config?.region || EXECUTION_CONTEXT_DEFAULTS.REGION
    return buildExecutionId(name, accountId, region, EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME)
  }

  /**
   * Create StateMachine.Id ARN with config values
   */
  private createStateMachineId(config?: ExecutionContextConfig): string {
    const accountId = config?.accountId || EXECUTION_CONTEXT_DEFAULTS.ACCOUNT_ID
    const region = config?.region || EXECUTION_CONTEXT_DEFAULTS.REGION
    return buildStateMachineId(accountId, region, EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME)
  }
}
