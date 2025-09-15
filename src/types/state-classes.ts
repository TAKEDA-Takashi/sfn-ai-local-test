/**
 * Class-based State Implementation for ASL
 *
 * Features:
 * - Type-safe JSONPath/JSONata mode separation
 * - Unified UNSUPPORTED_FIELDS pattern for field validation
 * - DRY principle implementation with consistent patterns
 * - Optimized memory usage with singleton patterns
 */

import type {
  CatchRule,
  ChoiceState,
  DistributedMapState,
  FailState,
  JSONataState as IJSONataState,
  JSONPathState as IJSONPathState,
  InlineMapState,
  State as IState,
  ItemBatcher,
  ItemProcessor,
  ItemReader,
  JsonObject,
  JsonValue,
  MapState,
  ParallelState,
  PassState,
  ResultWriter,
  RetryRule,
  StateMachine,
  SucceedState,
  TaskState,
  WaitState,
} from './asl.js'
import { JSONataChoiceRule, JSONPathChoiceRule } from './asl.js'
import { StateFactory } from './state-factory.js'
import { isJsonArray, isJsonObject, isString } from './type-guards.js'

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>())

// Singleton pattern for unsupported field sets to optimize memory usage
const JSONPATH_CORE_UNSUPPORTED = Object.freeze(new Set(['Arguments', 'Output']))

const JSONATA_CORE_UNSUPPORTED = Object.freeze(
  new Set(['Parameters', 'InputPath', 'OutputPath', 'ResultPath', 'ResultSelector']),
)

// ItemsPath not supported in JSONata mode - use Items field with expression
const JSONATA_MAP_UNSUPPORTED = Object.freeze(
  new Set(['Parameters', 'InputPath', 'OutputPath', 'ResultPath', 'ResultSelector', 'ItemsPath']),
)

export type StateConfig = Partial<IState>

/**
 * ステート基底クラス
 */
export abstract class State implements IState {
  Type: string = ''

  declare Comment?: string
  declare Next?: string
  declare End?: boolean
  declare Retry?: RetryRule[]
  declare Catch?: CatchRule[]
  declare QueryLanguage?: 'JSONPath' | 'JSONata'
  declare Assign?: JsonObject

  /**
   * サポートされていないフィールドのセットを返す
   * @returns サポートされていないフィールド名のセット
   */
  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    // Subclasses override to define mode-specific unsupported fields
    return EMPTY_SET
  }

  constructor(config: StateConfig = {}) {
    const unsupportedProvided = this.getUnsupportedFields(config)
    if (unsupportedProvided.length > 0) {
      this.throwUnsupportedFieldsError(unsupportedProvided, config)
    }

    this.applyConfig(config)
    this.ensureTypeField()
  }

  private getUnsupportedFields(config: StateConfig): string[] {
    return Object.keys(config).filter((field) => this.UNSUPPORTED_FIELDS.has(field))
  }

  private throwUnsupportedFieldsError(fields: string[], config: StateConfig): void {
    const typeName = this.getStateTypeName()
    const fieldList = fields.join(', ')

    const isJSONataMode = config.QueryLanguage === 'JSONata'
    if (fields.length === 1) {
      const field = fields[0]

      if (field === 'Next' && (typeName === 'Succeed' || typeName === 'Fail')) {
        throw new Error(`Terminal state ${typeName} cannot have a Next field`)
      }

      if (field === 'Arguments' && typeName === 'Pass') {
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

    // Generic error message for other cases
    throw new Error(
      `${typeName} state does not support the following field${fields.length > 1 ? 's' : ''}: ${fieldList}`,
    )
  }

  private applyConfig(config: StateConfig): void {
    Object.assign(this, config)
  }

  private ensureTypeField(): void {
    if (!this.Type) {
      this.Type = this.getStateTypeName()
    }
  }

  private getStateTypeName(): string {
    return this.constructor.name.replace('State', '').replace('JSONPath', '').replace('JSONata', '')
  }

  // Type checking methods with type guards (ASL定義の型を使用)
  isTask(): this is TaskState {
    return false
  }
  isChoice(): this is ChoiceState {
    return false
  }
  isMap(): this is MapState {
    return false
  }
  isParallel(): this is ParallelState {
    return false
  }
  isWait(): this is WaitState {
    return false
  }
  isSucceed(): this is SucceedState {
    return false
  }
  isFail(): this is FailState {
    return false
  }
  isPass(): this is PassState {
    return false
  }

  isInlineMap(): this is InlineMapState {
    return false
  }
  isDistributedMap(): this is DistributedMapState {
    return false
  }

  isJSONPathState(): this is IJSONPathState {
    return this.QueryLanguage === 'JSONPath' || !this.QueryLanguage
  }

  isJSONataState(): this is IJSONataState {
    return this.QueryLanguage === 'JSONata'
  }
}

/**
 * JSONPathモードステート基底クラス
 */
export abstract class JSONPathStateBase extends State implements IJSONPathState {
  declare QueryLanguage?: 'JSONPath' | undefined

  declare InputPath?: string
  declare OutputPath?: string
  declare ResultPath?: string
  declare Parameters?: JsonObject
  declare ResultSelector?: JsonObject
}

/**
 * JSONataモードステート基底クラス
 */
export abstract class JSONataStateBase extends State implements IJSONataState {
  QueryLanguage: 'JSONata' = 'JSONata'

  declare Arguments?: string | JsonObject
  declare Output?: JsonValue
}

/**
 * JSONPathモードのTaskステート
 */
export class JSONPathTaskState extends JSONPathStateBase {
  readonly Type = 'Task' as const

  Resource: string
  declare TimeoutSeconds?: number
  declare TimeoutSecondsPath?: string
  declare HeartbeatSeconds?: number
  declare HeartbeatSecondsPath?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_CORE_UNSUPPORTED
  }
  override isTask(): this is TaskState {
    return true
  }

  constructor(config: JsonObject) {
    // Resource is mandatory for Task state per AWS spec
    if (typeof config.Resource !== 'string') {
      throw new Error('Task state requires Resource field')
    }

    const { Resource, ...rest } = config
    super(rest)
    this.Resource = Resource
  }
}

/**
 * JSONataモードのTaskステート
 */
export class JSONataTaskState extends JSONataStateBase {
  readonly Type = 'Task' as const

  Resource: string
  declare TimeoutSeconds?: number
  declare TimeoutSecondsPath?: string
  declare HeartbeatSeconds?: number
  declare HeartbeatSecondsPath?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_CORE_UNSUPPORTED
  }
  override isTask(): this is TaskState {
    return true
  }

  constructor(config: JsonObject) {
    // Resource is mandatory for Task state per AWS spec
    if (typeof config.Resource !== 'string') {
      throw new Error('Task state requires Resource field')
    }

    const { Resource, ...rest } = config
    super(rest)
    this.Resource = Resource

    if (Resource.includes(':::') && !('Arguments' in config)) {
      throw new Error(`Arguments field is required for resource ARN: ${Resource}`)
    }
  }
}

/**
 * JSONPathモードのParallelステート
 */
export class JSONPathParallelState extends JSONPathStateBase {
  readonly Type = 'Parallel' as const

  Branches: StateMachine[]

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_CORE_UNSUPPORTED
  }
  override isParallel(): this is ParallelState {
    return true
  }

  constructor(config: JsonObject) {
    super(config)
    this.Branches = createBranches(config)
  }
}

/**
 * JSONataモードのParallelステート
 */
export class JSONataParallelState extends JSONataStateBase {
  readonly Type = 'Parallel' as const

  Branches: StateMachine[]

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_CORE_UNSUPPORTED
  }
  override isParallel(): this is ParallelState {
    return true
  }

  constructor(config: JsonObject) {
    super(config)
    this.Branches = createBranches(config)
  }
}

/**
 * JSONPathモードのPassステート
 */
export class JSONPathPassState extends JSONPathStateBase {
  readonly Type = 'Pass' as const

  declare Result?: JsonValue

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_CORE_UNSUPPORTED
  }
  override isPass(): this is PassState {
    return true
  }
}

// JSONata PassステートはArguments/Outputもサポートしない特殊ケース
const JSONATA_PASS_UNSUPPORTED = Object.freeze(
  new Set(['Parameters', 'InputPath', 'OutputPath', 'ResultPath', 'ResultSelector', 'Arguments']),
)

/**
 * JSONataモードのPassステート
 */
export class JSONataPassState extends JSONataStateBase {
  readonly Type = 'Pass' as const

  declare Result?: JsonValue

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_PASS_UNSUPPORTED
  }
  override isPass(): this is PassState {
    return true
  }
}

// Choiceステートはほとんどのフィールドをサポートしない
const CHOICE_UNSUPPORTED = Object.freeze(
  new Set([
    'Arguments',
    'Output',
    'InputPath',
    'OutputPath',
    'ResultPath',
    'Parameters',
    'ResultSelector',
  ]),
)

/**
 * JSONPathモードのChoiceステート
 */
export class JSONPathChoiceState extends JSONPathStateBase {
  readonly Type = 'Choice' as const

  Choices: JSONPathChoiceRule[]
  declare Default?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return CHOICE_UNSUPPORTED
  }
  override isChoice(): this is ChoiceState {
    return true
  }

  constructor(config: JsonObject) {
    if (!isJsonArray(config.Choices)) {
      throw new Error('Choice state requires Choices array')
    }
    if (config.Choices.length === 0) {
      throw new Error('Choice state requires non-empty Choices array')
    }

    const { Choices: choicesData, ...rest } = config
    super(rest)

    this.Choices = choicesData.map((choice) => {
      return JSONPathChoiceRule.fromJsonValue(choice)
    })
  }
}

// JSONata Choiceステートも同様に多くのフィールドをサポートしない
const JSONATA_CHOICE_UNSUPPORTED = Object.freeze(
  new Set([
    'Parameters',
    'InputPath',
    'OutputPath',
    'ResultPath',
    'ResultSelector',
    'Arguments',
    'Output',
  ]),
)

/**
 * JSONataモードのChoiceステート
 */
export class JSONataChoiceState extends JSONataStateBase {
  readonly Type = 'Choice' as const

  Choices: JSONataChoiceRule[]
  declare Default?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_CHOICE_UNSUPPORTED
  }
  override isChoice(): this is ChoiceState {
    return true
  }

  constructor(config: JsonObject) {
    if (!isJsonArray(config.Choices)) {
      throw new Error('Choice state requires Choices array')
    }
    if (config.Choices.length === 0) {
      throw new Error('Choice state requires non-empty Choices array')
    }

    const { Choices: choicesData, ...rest } = config
    super(rest)

    this.Choices = choicesData.map((choice) => {
      return JSONataChoiceRule.fromJsonValue(choice)
    })
  }
}

/**
 * MapステートのItemProcessorを生成する
 * @param config ステート設定
 * @returns ItemProcessorインスタンス
 */
// Map stateの共通処理を抽出したヘルパー関数
function createItemProcessor(config: JsonObject): ItemProcessor {
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
      config.QueryLanguage as 'JSONPath' | 'JSONata' | undefined,
    )
  }

  return itemProcessor
}

/**
 * ParallelステートのBranchesを生成する
 * @param config ステート設定
 * @returns StateMachineインスタンスの配列
 */
// Branches must be StateMachine instances to execute independently
function createBranches(config: JsonObject): StateMachine[] {
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

    // ブランチのQueryLanguageを決定（親から継承または独自指定）
    const branchQueryLanguage = branch.QueryLanguage || config.QueryLanguage

    // Each branch needs State instances for proper execution
    const branchStateMachine: StateMachine = {
      ...branch,
      StartAt: branch.StartAt,
      States: StateFactory.createStates(
        branch.States,
        branchQueryLanguage as 'JSONPath' | 'JSONata',
      ),
    }

    return branchStateMachine
  })
}

/**
 * JSONPathモードのInline Mapステート
 */
export class JSONPathInlineMapState extends JSONPathStateBase {
  readonly Type = 'Map' as const

  declare ItemsPath?: string
  declare MaxConcurrency?: number
  declare MaxConcurrencyPath?: string
  ItemProcessor: ItemProcessor

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_CORE_UNSUPPORTED
  }
  override isMap(): this is MapState {
    return true
  }

  override isInlineMap(): this is InlineMapState {
    return true
  }

  constructor(config: JsonObject) {
    const { ItemProcessor: _, Iterator: __, ...rest } = config
    super(rest)
    this.ItemProcessor = createItemProcessor(config)
  }
}

/**
 * JSONataモードのInline Mapステート
 */
export class JSONataInlineMapState extends JSONataStateBase {
  readonly Type = 'Map' as const

  declare Items?: string
  declare MaxConcurrency?: number
  ItemProcessor: ItemProcessor
  declare ItemSelector?: string | JsonObject

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_MAP_UNSUPPORTED
  }
  override isMap(): this is MapState {
    return true
  }

  override isInlineMap(): this is InlineMapState {
    return true
  }

  constructor(config: JsonObject) {
    const { ItemProcessor: _, Iterator: __, ...rest } = config
    super(rest)
    this.ItemProcessor = createItemProcessor(config)
  }
}

/**
 * JSONPathモードのDistributed Mapステート
 */
export class JSONPathDistributedMapState extends JSONPathStateBase {
  readonly Type = 'Map' as const
  ProcessorMode: 'DISTRIBUTED' = 'DISTRIBUTED'

  declare ItemsPath?: string
  declare MaxConcurrency?: number
  declare MaxConcurrencyPath?: string
  declare ToleratedFailureCount?: number
  declare ToleratedFailureCountPath?: string
  declare ToleratedFailurePercentage?: number
  declare ToleratedFailurePercentagePath?: string
  ItemProcessor: ItemProcessor
  declare ItemReader?: ItemReader
  declare ItemBatcher?: ItemBatcher
  declare ResultWriter?: ResultWriter

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_CORE_UNSUPPORTED
  }
  override isMap(): this is MapState {
    return true
  }

  override isDistributedMap(): this is DistributedMapState {
    return true
  }

  constructor(config: JsonObject) {
    const { ItemProcessor: _, Iterator: __, ...rest } = config
    super(rest)
    this.ItemProcessor = createItemProcessor(config)
  }
}

/**
 * JSONataモードのDistributed Mapステート
 */
export class JSONataDistributedMapState extends JSONataStateBase {
  readonly Type = 'Map' as const
  ProcessorMode: 'DISTRIBUTED' = 'DISTRIBUTED'

  declare Items?: string
  declare MaxConcurrency?: number
  declare MaxConcurrencyPath?: string
  declare ToleratedFailureCount?: number
  declare ToleratedFailureCountPath?: string
  declare ToleratedFailurePercentage?: number
  declare ToleratedFailurePercentagePath?: string
  ItemProcessor: ItemProcessor
  declare ItemSelector?: string | JsonObject
  declare ItemReader?: ItemReader
  declare ItemBatcher?: ItemBatcher
  declare ResultWriter?: ResultWriter

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_MAP_UNSUPPORTED
  }
  override isMap(): this is MapState {
    return true
  }

  override isDistributedMap(): this is DistributedMapState {
    return true
  }

  constructor(config: JsonObject) {
    const { ItemProcessor: _, Iterator: __, ...rest } = config
    super(rest)
    this.ItemProcessor = createItemProcessor(config)
  }
}

/**
 * JSONPathモードのWaitステート
 */
export class JSONPathWaitState extends JSONPathStateBase {
  readonly Type = 'Wait' as const

  declare Seconds?: number
  declare SecondsPath?: string
  declare Timestamp?: string
  declare TimestampPath?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_CORE_UNSUPPORTED
  }
  override isWait(): this is WaitState {
    return true
  }

  constructor(config: JsonObject) {
    super(config)
    this.validateWaitConfiguration()
  }

  /**
   * Wait設定の排他性を検証
   */
  private validateWaitConfiguration(): void {
    const waitConfigs = [this.Seconds, this.SecondsPath, this.Timestamp, this.TimestampPath].filter(
      Boolean,
    )

    if (waitConfigs.length > 1) {
      throw new Error('Wait state must have exactly one wait duration field')
    }
  }
}

// JSONata Waitステートは追加でPath系フィールドもサポートしない
const JSONATA_WAIT_UNSUPPORTED = Object.freeze(
  new Set([
    'Parameters',
    'InputPath',
    'OutputPath',
    'ResultPath',
    'ResultSelector',
    'SecondsPath',
    'TimestampPath',
  ]),
)

/**
 * JSONataモードのWaitステート
 */
export class JSONataWaitState extends JSONataStateBase {
  readonly Type = 'Wait' as const

  declare Seconds?: number | string
  declare Timestamp?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_WAIT_UNSUPPORTED
  }
  override isWait(): this is WaitState {
    return true
  }

  constructor(config: JsonObject) {
    super(config)
    this.validateWaitConfiguration()
  }

  /**
   * Wait設定の排他性を検証
   */
  private validateWaitConfiguration(): void {
    const waitConfigs = [this.Seconds, this.Timestamp].filter(Boolean)

    if (waitConfigs.length > 1) {
      throw new Error('Wait state must have exactly one wait duration field')
    }
  }
}

// JSONPath版のSucceed/Failステート用（InputPath/OutputPathはサポート）
const JSONPATH_TERMINAL_UNSUPPORTED = Object.freeze(
  new Set([
    'Next',
    'End',
    'Retry',
    'Catch',
    'Arguments',
    'Output',
    'ResultPath',
    'Parameters',
    'ResultSelector',
  ]),
)

/**
 * JSONPathモードのSucceedステート
 */
export class JSONPathSucceedState extends JSONPathStateBase {
  readonly Type = 'Succeed' as const

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_TERMINAL_UNSUPPORTED
  }
  override isSucceed(): this is SucceedState {
    return true
  }
}

// JSONata版の終端ステート用
const JSONATA_TERMINAL_UNSUPPORTED = Object.freeze(
  new Set([
    'Next',
    'End',
    'Retry',
    'Catch',
    'Parameters',
    'InputPath',
    'OutputPath',
    'ResultPath',
    'ResultSelector',
    'Arguments',
  ]),
)

/**
 * JSONataモードのSucceedステート
 */
export class JSONataSucceedState extends JSONataStateBase {
  readonly Type = 'Succeed' as const

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_TERMINAL_UNSUPPORTED
  }
  override isSucceed(): this is SucceedState {
    return true
  }
}

/**
 * JSONPathモードのFailステート
 */
export class JSONPathFailState extends JSONPathStateBase {
  readonly Type = 'Fail' as const

  declare Error?: string
  declare ErrorPath?: string
  declare Cause?: string
  declare CausePath?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONPATH_TERMINAL_UNSUPPORTED
  }
  override isFail(): this is FailState {
    return true
  }

  constructor(config: JsonObject) {
    super(config)
    this.validateErrorFields()
  }

  /**
   * Errorフィールドの排他性を検証
   */
  private validateErrorFields(): void {
    if (this.Cause && this.CausePath) {
      throw new Error('Fail state cannot have both Cause and CausePath fields')
    }

    if (this.Error && this.ErrorPath) {
      throw new Error('Fail state cannot have both Error and ErrorPath fields')
    }
  }
}

// JSONata FailステートはCausePathもサポートしない
const JSONATA_FAIL_UNSUPPORTED = Object.freeze(
  new Set([
    'Next',
    'End',
    'Retry',
    'Catch',
    'Parameters',
    'InputPath',
    'OutputPath',
    'ResultPath',
    'ResultSelector',
    'Arguments',
    'Output',
    'CausePath',
  ]),
)

/**
 * JSONataモードのFailステート
 */
export class JSONataFailState extends JSONataStateBase {
  readonly Type = 'Fail' as const

  declare Error?: string
  declare ErrorPath?: string
  declare Cause?: string

  protected get UNSUPPORTED_FIELDS(): ReadonlySet<string> {
    return JSONATA_FAIL_UNSUPPORTED
  }
  override isFail(): this is FailState {
    return true
  }

  constructor(config: JsonObject) {
    super(config)
    this.validateErrorFields()
  }

  /**
   * Errorフィールドの排他性を検証
   */
  private validateErrorFields(): void {
    if (this.Error && this.ErrorPath) {
      throw new Error('Fail state cannot have both Error and ErrorPath fields')
    }
  }
}

export type {
  ChoiceState,
  DistributedMapState,
  FailState,
  InlineMapState,
  MapState,
  ParallelState,
  PassState,
  SucceedState,
  TaskState,
  WaitState,
} from './asl.js'
