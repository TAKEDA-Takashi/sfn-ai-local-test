import {
  buildExecutionId,
  buildStateMachineId,
  EXECUTION_CONTEXT_DEFAULTS,
} from '../../constants/execution-context'
import type { ExecutionContextConfig } from '../../schemas/config-schema'
import type { ExecutionContext, JsonObject, JsonValue, StateMachine } from '../../types/asl'
import { isFail, isMap, isParallel, isSucceed } from '../../types/asl'
import type { StateExecution } from '../../types/test'
import { isJsonObject } from '../../types/type-guards'
import { deepClone } from '../../utils/deep-clone'
import type { MockEngine } from '../mock/engine'
import type { StateExecutionResult } from './states/base'
import { StateExecutorFactory } from './states/state-executor-factory'

/**
 * ステートマシン実行オプション
 */
export interface ExecutionOptions {
  verbose?: boolean
  quiet?: boolean
  maxSteps?: number
  executionContext?: ExecutionContextConfig
}

/**
 * ステートマシン実行結果
 */
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

/**
 * ステートマシン実行エンジン
 */
export class StateMachineExecutor {
  private stateMachine: StateMachine
  private mockEngine?: MockEngine

  constructor(stateMachine: StateMachine, mockEngine?: MockEngine) {
    // StateMachine should already be properly structured and converted
    this.stateMachine = stateMachine
    this.mockEngine = mockEngine
  }

  /**
   * 値がExecutionContext型かどうかを判定する
   * @param value 判定対象の値
   * @returns ExecutionContext型の場合true
   */
  private isExecutionContext(value: JsonValue | ExecutionContext): value is ExecutionContext {
    // JsonValueの可能性を最初に除外
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false
    }

    // Avoid casting by checking all required fields
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

  /**
   * ステートマシンを実行する
   * @param input 入力データまたは実行コンテキスト
   * @param options 実行オプション
   * @returns 実行結果
   */
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
        originalInput: input, // Preserve for reference throughout execution context
        stateExecutions: [],
        currentStatePath: [],
        mapExecutions: [],
        // Fixed execution context values for test reproducibility
        Execution: {
          Id: this.createExecutionId(options.executionContext),
          Input: isJsonObject(input) ? input : {},
          Name: options.executionContext?.name || EXECUTION_CONTEXT_DEFAULTS.NAME,
          RoleArn: options.executionContext?.roleArn || EXECUTION_CONTEXT_DEFAULTS.ROLE_ARN,
          StartTime: options.executionContext?.startTime || EXECUTION_CONTEXT_DEFAULTS.START_TIME,
        },
        StateMachine: {
          Id: this.createStateMachineId(options.executionContext),
          Name: EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME,
        },
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

        const state = this.stateMachine.States[context.currentState]

        if (!state) {
          throw new Error(`State "${context.currentState}" not found`)
        }

        context.executionPath.push(context.currentState)

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

          // Map/DistributedMap/Parallel states only include themselves in executionPath,
          // not their internal execution paths
          if (
            result.executionPath &&
            Array.isArray(result.executionPath) &&
            !isMap(state) &&
            !isParallel(state)
          ) {
            const additionalPaths = result.executionPath.slice(1)
            context.executionPath.push(...additionalPaths)
          }

          if (context.stateExecutions) {
            // For Parallel states, child executions are already added by ParallelStateExecutor
            // Only add the Parallel state itself, not overwrite child executions
            if (!isParallel(state)) {
              const stateExecution: StateExecution = {
                statePath: [...(context.currentStatePath || []), context.currentState],
                state: context.currentState,
                input: result.processedInput !== undefined ? result.processedInput : stateInput,
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
                input: result.processedInput !== undefined ? result.processedInput : stateInput,
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
          // Continue processing if error was handled by state executor
          if (result?.error) {
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

        if (isSucceed(state)) {
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

        if (isFail(state)) {
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
