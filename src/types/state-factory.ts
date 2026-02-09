/**
 * State Factory - ASL JSON をバリデーション済み State オブジェクトに変換
 *
 * プレーンオブジェクト（discriminated union）を返す。
 * 旧 state-classes.ts のバリデーションロジックを統合。
 */

import type {
  ChoiceState,
  FailState,
  ItemProcessor,
  JsonObject,
  JsonValue,
  MapState,
  ParallelState,
  PassState,
  QueryLanguage,
  State,
  StateMachine,
  StateType,
  SucceedState,
  TaskState,
  WaitState,
} from './asl.js'
import { JSONataChoiceRule, JSONPathChoiceRule } from './choice-rule.js'
import { isJsonArray, isJsonObject, isString } from './type-guards.js'

// =============================================================================
// フィールドバリデーション定義
// =============================================================================

// --- ベースフィールドグループ（意味的なグルーピング） ---

/** JSONPathモードでのみ有効なフィールド（JSONataモードでは使用不可） */
const JSONPATH_ONLY_FIELDS = new Set([
  'Parameters',
  'InputPath',
  'OutputPath',
  'ResultPath',
  'ResultSelector',
])

/** JSONataモードでのみ有効なフィールド（JSONPathモードでは使用不可） */
const JSONATA_ONLY_FIELDS = new Set(['Arguments', 'Output'])

/** 終端ステート（Succeed/Fail）では使用不可のフィールド */
const TERMINAL_FIELDS = new Set(['Next', 'End', 'Retry', 'Catch'])

/** 結果処理フィールド（終端ステートのJSONPathモードで使用不可） */
const RESULT_PROCESSING_FIELDS = new Set(['Parameters', 'ResultPath', 'ResultSelector'])

function mergeFieldSets(
  ...sets: Array<ReadonlySet<string> | readonly string[]>
): ReadonlySet<string> {
  const result = new Set<string>()
  for (const s of sets) {
    for (const item of s) result.add(item)
  }
  return result
}

// --- ステートタイプ別の非対応フィールドセット ---

/** Choiceステート: I/O処理フィールドすべて使用不可（両モード共通） */
const CHOICE_UNSUPPORTED = mergeFieldSets(JSONPATH_ONLY_FIELDS, JSONATA_ONLY_FIELDS)

/** JSONataモード - Passステート: JSONPath系 + Arguments（Passは引数を取らない） */
const JSONATA_PASS_UNSUPPORTED = mergeFieldSets(JSONPATH_ONLY_FIELDS, ['Arguments'])

/** JSONataモード - Mapステート: JSONPath系 + ItemsPath（Itemsを使用） */
const JSONATA_MAP_UNSUPPORTED = mergeFieldSets(JSONPATH_ONLY_FIELDS, ['ItemsPath'])

/** JSONataモード - Waitステート: JSONPath系 + Path系の待機フィールド */
const JSONATA_WAIT_UNSUPPORTED = mergeFieldSets(JSONPATH_ONLY_FIELDS, [
  'SecondsPath',
  'TimestampPath',
])

/** JSONPathモード - 終端ステート: 終端系 + JSONata系 + 結果処理系 */
const JSONPATH_TERMINAL_UNSUPPORTED = mergeFieldSets(
  TERMINAL_FIELDS,
  JSONATA_ONLY_FIELDS,
  RESULT_PROCESSING_FIELDS,
)

/** JSONataモード - Succeedステート: 終端系 + JSONPath系 + Arguments */
const JSONATA_TERMINAL_UNSUPPORTED = mergeFieldSets(TERMINAL_FIELDS, JSONPATH_ONLY_FIELDS, [
  'Arguments',
])

/** JSONataモード - Failステート: 終端系 + 全I/O系 + CausePath */
const JSONATA_FAIL_UNSUPPORTED = mergeFieldSets(
  TERMINAL_FIELDS,
  JSONPATH_ONLY_FIELDS,
  JSONATA_ONLY_FIELDS,
  ['CausePath'],
)

// =============================================================================
// バリデーションヘルパー
// =============================================================================

function getUnsupportedFieldSet(
  stateType: string,
  queryLanguage: QueryLanguage,
): ReadonlySet<string> {
  // Choice: I/O処理フィールドすべて使用不可（両モード共通）
  if (stateType === 'Choice') return CHOICE_UNSUPPORTED

  if (queryLanguage === 'JSONata') {
    switch (stateType) {
      case 'Pass':
        return JSONATA_PASS_UNSUPPORTED
      case 'Wait':
        return JSONATA_WAIT_UNSUPPORTED
      case 'Map':
        return JSONATA_MAP_UNSUPPORTED
      case 'Succeed':
        return JSONATA_TERMINAL_UNSUPPORTED
      case 'Fail':
        return JSONATA_FAIL_UNSUPPORTED
      default: // Task, Parallel
        return JSONPATH_ONLY_FIELDS
    }
  }

  // JSONPathモード
  switch (stateType) {
    case 'Succeed':
    case 'Fail':
      return JSONPATH_TERMINAL_UNSUPPORTED
    default: // Task, Pass, Wait, Map, Parallel
      return JSONATA_ONLY_FIELDS
  }
}

function validateUnsupportedFields(
  config: JsonObject,
  stateType: string,
  queryLanguage: QueryLanguage,
  unsupported: ReadonlySet<string>,
): void {
  const provided = Object.keys(config).filter((field) => unsupported.has(field))
  if (provided.length === 0) return

  const isJSONataMode = queryLanguage === 'JSONata'

  if (provided.length === 1) {
    const field = provided[0]

    if (field === 'Next' && (stateType === 'Succeed' || stateType === 'Fail')) {
      throw new Error(`Terminal state ${stateType} cannot have a Next field`)
    }

    if (field === 'Arguments' && stateType === 'Pass') {
      throw new Error('Pass state does not support Arguments field')
    }

    if (isJSONataMode) {
      const jsonataFieldMap: Record<string, string> = {
        Parameters: 'Arguments',
        InputPath: 'Assign',
        ResultPath: 'Output',
        Variable: 'Condition',
      }

      const replacement = jsonataFieldMap[field]
      if (replacement) {
        throw new Error(
          `${field} field is not supported in JSONata mode. Use ${replacement === 'Condition' ? `'${replacement}'` : replacement} field instead`,
        )
      }

      if (field.endsWith('Path')) {
        const baseField = field.replace('Path', '')
        const pathToBaseFields = ['Output', 'Items', 'Seconds', 'Timestamp']

        if (pathToBaseFields.includes(baseField)) {
          throw new Error(
            `${field} field is not supported in JSONata mode. Use ${baseField} field instead`,
          )
        }
      }
    }
  }

  throw new Error(
    `${stateType} state does not support the following field${provided.length > 1 ? 's' : ''}: ${provided.join(', ')}`,
  )
}

// =============================================================================
// State 生成ヘルパー
// =============================================================================

function getValidQueryLanguage(value: unknown): QueryLanguage {
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

function detectProcessorMode(config: JsonObject): 'DISTRIBUTED' | undefined {
  const processorData = config.ItemProcessor || config.Iterator
  if (
    isJsonObject(processorData) &&
    isJsonObject(processorData.ProcessorConfig) &&
    processorData.ProcessorConfig.Mode === 'DISTRIBUTED'
  ) {
    return 'DISTRIBUTED'
  }
  return undefined
}

function createItemProcessor(config: JsonObject, queryLanguage: QueryLanguage): ItemProcessor {
  const processorData = config.ItemProcessor || config.Iterator
  if (!isJsonObject(processorData)) {
    throw new Error('Map state requires ItemProcessor or Iterator field')
  }

  if (!isString(processorData.StartAt)) {
    throw new Error('ItemProcessor/Iterator requires StartAt field')
  }

  const itemProcessor: ItemProcessor = {
    ...processorData,
    StartAt: processorData.StartAt,
    States: {},
  }

  if (isJsonObject(processorData.States)) {
    itemProcessor.States = StateFactory.createStates(
      processorData.States,
      (processorData.QueryLanguage as QueryLanguage) || queryLanguage,
    )
  }

  return itemProcessor
}

function createBranches(config: JsonObject, queryLanguage: QueryLanguage): StateMachine[] {
  const branchesData = config.Branches
  if (!isJsonArray(branchesData)) {
    throw new Error('Parallel state requires Branches array')
  }
  if (branchesData.length === 0) {
    throw new Error('Parallel state requires non-empty Branches array')
  }

  return branchesData.map((branch) => {
    if (!isJsonObject(branch)) {
      throw new Error('Each branch must be an object')
    }
    if (!isString(branch.StartAt)) {
      throw new Error('Branch must have a StartAt field')
    }
    if (!isJsonObject(branch.States)) {
      throw new Error('Branch must have a States field')
    }

    const branchQueryLanguage = (branch.QueryLanguage as QueryLanguage) || queryLanguage

    const branchStateMachine: StateMachine = {
      ...branch,
      StartAt: branch.StartAt,
      States: StateFactory.createStates(branch.States, branchQueryLanguage),
    }

    return branchStateMachine
  })
}

function createChoiceRules(
  choicesData: JsonValue[],
  queryLanguage: QueryLanguage,
): (JSONPathChoiceRule | JSONataChoiceRule)[] {
  return choicesData.map((choice) => {
    if (queryLanguage === 'JSONata') {
      return JSONataChoiceRule.fromJsonValue(choice as JsonValue)
    }
    return JSONPathChoiceRule.fromJsonValue(choice as JsonValue)
  })
}

// =============================================================================
// State 構築関数
// =============================================================================

/**
 * configからQueryLanguageフィールドを除去し、JSONataの場合のみ追加するオブジェクトを返す
 * undefinedをオブジェクトのフィールドにセットしないことで、isJsonValueチェックとの互換性を保つ
 */
function stripAndSpreadQueryLanguage(config: JsonObject, queryLanguage: QueryLanguage): JsonObject {
  const { QueryLanguage: _, ...rest } = config
  return queryLanguage === 'JSONata' ? { ...rest, QueryLanguage: 'JSONata' } : rest
}

function buildTaskState(config: JsonObject, queryLanguage: QueryLanguage): TaskState {
  if (typeof config.Resource !== 'string') {
    throw new Error('Task state requires Resource field')
  }

  if (
    queryLanguage === 'JSONata' &&
    typeof config.Resource === 'string' &&
    config.Resource.includes(':::') &&
    !('Arguments' in config)
  ) {
    throw new Error(`Arguments field is required for resource ARN: ${config.Resource}`)
  }

  return {
    ...stripAndSpreadQueryLanguage(config, queryLanguage),
    Type: 'Task' as const,
    Resource: config.Resource,
  } as TaskState
}

function buildPassState(config: JsonObject, queryLanguage: QueryLanguage): PassState {
  return {
    ...stripAndSpreadQueryLanguage(config, queryLanguage),
    Type: 'Pass' as const,
  } as PassState
}

function buildChoiceState(config: JsonObject, queryLanguage: QueryLanguage): State {
  if (!isJsonArray(config.Choices)) {
    throw new Error('Choice state requires Choices array')
  }
  if (config.Choices.length === 0) {
    throw new Error('Choice state requires non-empty Choices array')
  }

  const choices = createChoiceRules(config.Choices, queryLanguage)
  const { Choices: _c, ...configWithoutChoices } = config

  return {
    ...stripAndSpreadQueryLanguage(configWithoutChoices, queryLanguage),
    Type: 'Choice' as const,
    Choices: choices,
  } as ChoiceState
}

function buildWaitState(config: JsonObject, queryLanguage: QueryLanguage): WaitState {
  if (queryLanguage === 'JSONata') {
    const waitConfigs = [config.Seconds, config.Timestamp].filter(Boolean)
    if (waitConfigs.length > 1) {
      throw new Error('Wait state must have exactly one wait duration field')
    }
  } else {
    const waitConfigs = [
      config.Seconds,
      config.SecondsPath,
      config.Timestamp,
      config.TimestampPath,
    ].filter(Boolean)
    if (waitConfigs.length > 1) {
      throw new Error('Wait state must have exactly one wait duration field')
    }
  }

  return {
    ...stripAndSpreadQueryLanguage(config, queryLanguage),
    Type: 'Wait' as const,
  } as WaitState
}

function buildSucceedState(config: JsonObject, queryLanguage: QueryLanguage): SucceedState {
  return {
    ...stripAndSpreadQueryLanguage(config, queryLanguage),
    Type: 'Succeed' as const,
  } as SucceedState
}

function buildFailState(config: JsonObject, queryLanguage: QueryLanguage): FailState {
  if (config.Cause && config.CausePath) {
    throw new Error('Fail state cannot have both Cause and CausePath fields')
  }
  if (config.Error && config.ErrorPath) {
    throw new Error('Fail state cannot have both Error and ErrorPath fields')
  }

  return {
    ...stripAndSpreadQueryLanguage(config, queryLanguage),
    Type: 'Fail' as const,
  } as FailState
}

function buildMapState(config: JsonObject, queryLanguage: QueryLanguage): MapState {
  const processorMode = detectProcessorMode(config)
  const { ItemProcessor: _, Iterator: __, ...configWithoutProcessor } = config
  const itemProcessor = createItemProcessor(config, queryLanguage)

  return {
    ...stripAndSpreadQueryLanguage(configWithoutProcessor, queryLanguage),
    Type: 'Map' as const,
    ItemProcessor: itemProcessor,
    ...(processorMode ? { ProcessorMode: processorMode } : {}),
  } as MapState
}

function buildParallelState(config: JsonObject, queryLanguage: QueryLanguage): ParallelState {
  const branches = createBranches(config, queryLanguage)
  const { Branches: _, ...configWithoutBranches } = config

  return {
    ...stripAndSpreadQueryLanguage(configWithoutBranches, queryLanguage),
    Type: 'Parallel' as const,
    Branches: branches,
  } as ParallelState
}

const STATE_BUILDERS: Record<StateType, (config: JsonObject, ql: QueryLanguage) => State> = {
  Task: buildTaskState,
  Pass: buildPassState,
  Choice: buildChoiceState,
  Wait: buildWaitState,
  Succeed: buildSucceedState,
  Fail: buildFailState,
  Map: buildMapState,
  Parallel: buildParallelState,
}

// =============================================================================
// StateFactory
// =============================================================================

export class StateFactory {
  /**
   * ASL定義からバリデーション済み State プレーンオブジェクトを生成
   */
  static createState(aslState: JsonObject, stateMachineQueryLanguage?: QueryLanguage): State {
    if (!isString(aslState.Type)) {
      throw new Error('State must have a Type field')
    }

    const queryLanguage =
      aslState.QueryLanguage !== undefined
        ? getValidQueryLanguage(aslState.QueryLanguage)
        : stateMachineQueryLanguage || 'JSONPath'

    const config: JsonObject = {
      ...aslState,
      QueryLanguage: queryLanguage,
    }

    const stateType = aslState.Type as StateType
    const builder = STATE_BUILDERS[stateType]
    if (!builder) {
      throw new Error(`Unknown state type: ${aslState.Type}`)
    }

    const unsupported = getUnsupportedFieldSet(stateType, queryLanguage)
    validateUnsupportedFields(config, stateType, queryLanguage, unsupported)

    return builder(config, queryLanguage)
  }

  /**
   * StateMachine の States オブジェクトを変換
   */
  static createStates(
    statesData: JsonObject,
    defaultQueryLanguage?: QueryLanguage,
  ): Record<string, State> {
    const states: Record<string, State> = {}

    if (!statesData) {
      return states
    }

    for (const [stateName, stateValue] of Object.entries(statesData)) {
      if (!isJsonObject(stateValue)) {
        throw new Error(`State ${stateName} must be an object`)
      }

      const stateData = { ...stateValue }

      if (!stateData.QueryLanguage && defaultQueryLanguage) {
        stateData.QueryLanguage = defaultQueryLanguage
      }

      states[stateName] = StateFactory.createState(stateData, defaultQueryLanguage)
    }

    return states
  }

  /**
   * 完全な StateMachine 定義をバリデーション・変換
   */
  static createStateMachine(stateMachineDefinition: JsonObject): StateMachine {
    if (!('States' in stateMachineDefinition && isJsonObject(stateMachineDefinition.States))) {
      throw new Error('StateMachine must have a States field')
    }

    if (
      !('StartAt' in stateMachineDefinition) ||
      typeof stateMachineDefinition.StartAt !== 'string'
    ) {
      throw new Error('StateMachine must have a StartAt field')
    }

    const queryLanguage = getValidQueryLanguage(stateMachineDefinition.QueryLanguage)
    const states = StateFactory.createStates(stateMachineDefinition.States, queryLanguage)

    const result: StateMachine = {
      ...stateMachineDefinition,
      StartAt: stateMachineDefinition.StartAt,
      States: states,
      ...('QueryLanguage' in stateMachineDefinition ? { QueryLanguage: queryLanguage } : {}),
    }

    return result
  }
}
