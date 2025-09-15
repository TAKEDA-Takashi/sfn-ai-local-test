/**
 * State Factory for converting ASL types to State classes
 *
 * This factory converts pure ASL type definitions (from asl.ts)
 * into runtime State class instances (from state-classes.ts).
 *
 * Usage:
 * - Input: ASL State interface from JSON/YAML
 * - Output: State class instance with runtime behavior
 */

import type { JsonObject, StateMachine } from './asl.js'
import {
  JSONataChoiceState,
  JSONataDistributedMapState,
  JSONataFailState,
  JSONataInlineMapState,
  JSONataParallelState,
  JSONataPassState,
  JSONataSucceedState,
  JSONataTaskState,
  JSONataWaitState,
  JSONPathChoiceState,
  JSONPathDistributedMapState,
  JSONPathFailState,
  JSONPathInlineMapState,
  JSONPathParallelState,
  JSONPathPassState,
  JSONPathSucceedState,
  JSONPathTaskState,
  JSONPathWaitState,
  type State,
} from './state-classes.js'
import { isJsonObject, isString } from './type-guards.js'

// Type for State constructors
type StateConstructor = new (config: JsonObject) => State

// QueryLanguageのバリデーションと正規化
// AWS Step FunctionsはJSONPathがデフォルト、JSONataはオプショナル
function getValidQueryLanguage(value: unknown): 'JSONPath' | 'JSONata' {
  if (value === undefined) {
    return 'JSONPath'
  }
  if (value === 'JSONPath' || value === 'JSONata') {
    return value
  }
  throw new Error(
    `Invalid QueryLanguage: ${JSON.stringify(value)}. Must be 'JSONPath' or 'JSONata'`,
  )
}

/**
 * Get State class based on state type, query language, and optional processor mode
 */
function getStateClass(
  stateType: string,
  queryLanguage: 'JSONPath' | 'JSONata',
  config?: JsonObject,
): StateConstructor {
  // Mapステートは ProcessorMode によって4つのクラスに分岐
  if (stateType === 'Map') {
    let processorMode: 'DISTRIBUTED' | 'INLINE' = 'INLINE'
    if (config) {
      const processorData = config.ItemProcessor || config.Iterator
      if (
        isJsonObject(processorData) &&
        isJsonObject(processorData.ProcessorConfig) &&
        processorData.ProcessorConfig.Mode === 'DISTRIBUTED'
      ) {
        processorMode = 'DISTRIBUTED'
      }
    }

    if (processorMode === 'DISTRIBUTED') {
      return queryLanguage === 'JSONata' ? JSONataDistributedMapState : JSONPathDistributedMapState
    } else {
      return queryLanguage === 'JSONata' ? JSONataInlineMapState : JSONPathInlineMapState
    }
  }

  // その他のステートは QueryLanguage のみで決定
  const stateClasses: Record<string, { JSONPath: StateConstructor; JSONata: StateConstructor }> = {
    Parallel: { JSONPath: JSONPathParallelState, JSONata: JSONataParallelState },
    Choice: { JSONPath: JSONPathChoiceState, JSONata: JSONataChoiceState },
    Task: { JSONPath: JSONPathTaskState, JSONata: JSONataTaskState },
    Pass: { JSONPath: JSONPathPassState, JSONata: JSONataPassState },
    Wait: { JSONPath: JSONPathWaitState, JSONata: JSONataWaitState },
    Succeed: { JSONPath: JSONPathSucceedState, JSONata: JSONataSucceedState },
    Fail: { JSONPath: JSONPathFailState, JSONata: JSONataFailState },
  }

  const classes = stateClasses[stateType]
  if (!classes) {
    throw new Error(`Unknown state type: ${stateType}`)
  }

  return classes[queryLanguage]
}

export class StateFactory {
  /**
   * Create a single State instance from ASL definition
   */
  static createState(
    aslState: JsonObject,
    stateMachineQueryLanguage?: 'JSONPath' | 'JSONata',
  ): State {
    // ASL仕様: すべてのStateはTypeフィールドが必須
    if (!isString(aslState.Type)) {
      throw new Error('State must have a Type field')
    }

    // QueryLanguageの優先順位: State定義 > StateMachine定義 > デフォルト
    const queryLanguage =
      aslState.QueryLanguage !== undefined
        ? getValidQueryLanguage(aslState.QueryLanguage)
        : stateMachineQueryLanguage || 'JSONPath'

    const config: JsonObject = {
      ...aslState,
      QueryLanguage: queryLanguage,
    }

    const StateClass = getStateClass(aslState.Type, queryLanguage, config)
    return new StateClass(config)
  }

  /**
   * Create State instances for a StateMachine's States object
   */
  static createStates(
    statesData: JsonObject,
    defaultQueryLanguage?: 'JSONPath' | 'JSONata',
  ): Record<string, State> {
    const states: Record<string, State> = {}

    // 空のステート定義を許容する（エッジケース対応）
    if (!statesData) {
      return states
    }

    for (const [stateName, stateValue] of Object.entries(statesData)) {
      if (!isJsonObject(stateValue)) {
        throw new Error(`State ${stateName} must be an object`)
      }

      // 元のASL定義を変更しないため浅いコピーを作成
      // QueryLanguageプロパティを追加する可能性があるため不変性を保証
      const stateData = { ...stateValue }

      // QueryLanguageの継承階層: State > StateMachine > デフォルト(JSONPath)
      if (!stateData.QueryLanguage && defaultQueryLanguage) {
        stateData.QueryLanguage = defaultQueryLanguage
      }

      states[stateName] = StateFactory.createState(stateData, defaultQueryLanguage)
    }

    return states
  }

  /**
   * Create a complete StateMachine with all states converted to class instances
   *
   * @param stateMachineDefinition - Complete ASL StateMachine definition
   * @returns StateMachine with all states as class instances
   */
  static createStateMachine(stateMachineDefinition: JsonObject): StateMachine {
    // ASL仕様: StateMachineはStatesフィールドが必須
    if (!('States' in stateMachineDefinition && isJsonObject(stateMachineDefinition.States))) {
      throw new Error('StateMachine must have a States field')
    }

    if (
      !('StartAt' in stateMachineDefinition) ||
      typeof stateMachineDefinition.StartAt !== 'string'
    ) {
      throw new Error('StateMachine must have a StartAt field')
    }

    // StateMachineレベルのQueryLanguageを決定
    // 無効な値の場合はエラー、undefinedは許可（デフォルトを使用）
    const queryLanguage = getValidQueryLanguage(stateMachineDefinition.QueryLanguage)

    // すべてのStateを再帰的に変換
    const states = StateFactory.createStates(stateMachineDefinition.States, queryLanguage)

    // StateMachineオブジェクトを構築
    // QueryLanguageは明示的に指定された場合のみ含める
    const result: StateMachine = {
      ...stateMachineDefinition,
      StartAt: stateMachineDefinition.StartAt,
      States: states,
      ...('QueryLanguage' in stateMachineDefinition ? { QueryLanguage: queryLanguage } : {}),
    }

    return result
  }
}
