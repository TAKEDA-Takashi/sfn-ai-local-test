/**
 * Amazon States Language (ASL) Type Definitions
 *
 * Discriminated Union設計:
 * - Type フィールドによる discriminated union
 * - QueryLanguage はフィールドレベルで表現（モードごとに型を分けない）
 * - バリデーションは StateFactory に集約
 */

import type { ChoiceRule } from './choice-rule.js'
import type { StateExecution } from './test.js'

// =============================================================================
// Core JSON Type Definitions
// =============================================================================

/**
 * JSON値の型定義
 * Step Functionsで扱える値の型（undefinedやfunctionは含まない）
 */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray

export type JsonObject = {
  [key: string]: JsonValue
}

export type JsonArray = JsonValue[]

// =============================================================================
// Error Handling Definitions
// =============================================================================

/** リトライルール定義 */
interface RetryRule {
  ErrorEquals: string[]
  IntervalSeconds?: number
  MaxAttempts?: number
  BackoffRate?: number
  MaxDelaySeconds?: number
  JitterStrategy?: 'FULL' | 'NONE'
}

/** JSONPath用Catchルール */
interface JSONPathCatchRule {
  ErrorEquals: string[]
  Next?: string
  ResultPath?: string
}

/** JSONata用Catchルール */
interface JSONataCatchRule {
  ErrorEquals: string[]
  Next?: string
  Output?: JsonValue
}

// =============================================================================
// Query Language
// =============================================================================

export type QueryLanguage = 'JSONPath' | 'JSONata'

// =============================================================================
// Common State Fields (shared by all state types)
// =============================================================================

/** 全Stateが持つ共通フィールド */
interface StateCommon {
  Next?: string
  End?: boolean
  Comment?: string
  Retry?: RetryRule[]
  Catch?: JSONPathCatchRule[] | JSONataCatchRule[]
  QueryLanguage?: QueryLanguage
  Assign?: JsonObject
}

/** JSONPath固有フィールド */
interface JSONPathFields {
  InputPath?: string
  OutputPath?: string
  ResultPath?: string
  Parameters?: JsonObject
  ResultSelector?: JsonObject
}

/** JSONata固有フィールド */
interface JSONataFields {
  Arguments?: string | JsonObject
  Output?: JsonValue
}

// =============================================================================
// State Type Definitions (Discriminated Union)
// =============================================================================

/** Task State */
export interface TaskState extends StateCommon, JSONPathFields, JSONataFields {
  Type: 'Task'
  Resource: string
  TimeoutSeconds?: number
  TimeoutSecondsPath?: string
  HeartbeatSeconds?: number
  HeartbeatSecondsPath?: string
}

/** Pass State */
export interface PassState extends StateCommon, JSONPathFields {
  Type: 'Pass'
  Result?: JsonValue
  Output?: JsonValue
}

/** Choice State */
export interface ChoiceState extends StateCommon {
  Type: 'Choice'
  Choices: ChoiceRule[]
  Default?: string
}

/** Wait State */
export interface WaitState extends StateCommon, JSONPathFields, JSONataFields {
  Type: 'Wait'
  Seconds?: number | string
  SecondsPath?: string
  Timestamp?: string
  TimestampPath?: string
}

/** Succeed State */
export interface SucceedState extends StateCommon, JSONPathFields, JSONataFields {
  Type: 'Succeed'
}

/** Fail State */
export interface FailState extends StateCommon {
  Type: 'Fail'
  Error?: string
  ErrorPath?: string
  Cause?: string
  CausePath?: string
  Output?: JsonValue
}

/** Map State Components */
export interface ItemProcessor {
  ProcessorConfig?: {
    Mode?: 'INLINE' | 'DISTRIBUTED'
    ExecutionType?: 'STANDARD' | 'EXPRESS'
  }
  StartAt: string
  States: Record<string, State>
}

/** ItemBatcher設定 */
export interface ItemBatcher {
  MaxItemsPerBatch?: number
  MaxInputBytesPerBatch?: number
  BatchInput?: JsonObject
}

/** DistributedMap失敗許容設定 */
export interface ToleranceConfig {
  ToleratedFailureCount?: number
  ToleratedFailureCountPath?: string
  ToleratedFailurePercentage?: number
  ToleratedFailurePercentagePath?: string
}

/** Reader基本設定 */
export interface ReaderConfig {
  InputType?: 'CSV' | 'JSON' | 'JSONL' | 'MANIFEST'
  CSVHeaderLocation?: 'FIRST_ROW' | 'GIVEN'
  CSVHeaders?: string[]
  CSVDelimiter?: 'COMMA' | 'PIPE' | 'SEMICOLON' | 'SPACE' | 'TAB'
  MaxItems?: number
}

/** JSONPath用ItemReader */
interface JSONPathItemReader {
  Resource: string
  ReaderConfig?: ReaderConfig & {
    MaxItemsPath?: string
  }
  Parameters?: JsonObject
}

/** JSONata用ItemReader */
interface JSONataItemReader {
  Resource: string
  ReaderConfig?: ReaderConfig
  Arguments?: string | JsonObject
}

/** ItemReader統合型 */
export type ItemReader = JSONPathItemReader | JSONataItemReader

/** ResultWriter基本設定 */
interface ResultWriterBase {
  Resource: string
  WriterConfig?: {
    Bucket?: string
    Prefix?: string
  }
}

/** JSONPath用ResultWriter */
interface JSONPathResultWriter extends ResultWriterBase {
  Parameters?: JsonObject
}

/** JSONata用ResultWriter */
interface JSONataResultWriter extends ResultWriterBase {
  Arguments?: string | JsonObject
}

/** ResultWriter統合型 */
export type ResultWriter = JSONPathResultWriter | JSONataResultWriter

/** Map State */
export interface MapState extends StateCommon, JSONPathFields, JSONataFields {
  Type: 'Map'
  ItemProcessor: ItemProcessor
  ItemsPath?: string
  Items?: string
  MaxConcurrency?: number
  MaxConcurrencyPath?: string
  ItemSelector?: string | JsonObject
  /** DISTRIBUTED mode indicator */
  ProcessorMode?: 'DISTRIBUTED'
  ItemReader?: ItemReader
  ItemBatcher?: ItemBatcher
  ResultWriter?: ResultWriter
  ToleratedFailureCount?: number
  ToleratedFailureCountPath?: string
  ToleratedFailurePercentage?: number
  ToleratedFailurePercentagePath?: string
}

/** Parallel State */
export interface ParallelState extends StateCommon, JSONPathFields, JSONataFields {
  Type: 'Parallel'
  Branches: StateMachine[]
}

// =============================================================================
// Discriminated Union
// =============================================================================

/** 全State型のDiscriminated Union */
export type State =
  | TaskState
  | PassState
  | ChoiceState
  | WaitState
  | SucceedState
  | FailState
  | MapState
  | ParallelState

/** State Type文字列リテラル */
export type StateType = State['Type']

// =============================================================================
// Convenience Type Aliases (後方互換)
// =============================================================================

/** Inline Map State (ProcessorModeが未設定 or INLINE) */
export type InlineMapState = MapState & { ProcessorMode?: undefined }

/** Distributed Map State (ProcessorMode === 'DISTRIBUTED') */
export type DistributedMapState = MapState & { ProcessorMode: 'DISTRIBUTED' }

/** JSONPath State (QueryLanguage !== 'JSONata') */
export type JSONPathState = State & { QueryLanguage?: 'JSONPath' | undefined }

/** JSONata State (QueryLanguage === 'JSONata') */
export type JSONataState = State & { QueryLanguage: 'JSONata' }

// =============================================================================
// State Machine Definitions
// =============================================================================

/** ステートマシン共通インターフェース */
interface StateMachineBase {
  Comment?: string
  StartAt: string
  States: Record<string, State>
  Version?: string
  TimeoutSeconds?: number
}

/** JSONPathモードステートマシン */
interface JSONPathStateMachine extends StateMachineBase {
  QueryLanguage?: 'JSONPath' | undefined
}

/** JSONataモードステートマシン */
interface JSONataStateMachine extends StateMachineBase {
  QueryLanguage: 'JSONata'
}

/** 統合ステートマシン型 */
export type StateMachine = JSONPathStateMachine | JSONataStateMachine

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Step Functions実行コンテキスト
 */
export interface ExecutionContext {
  input: JsonValue
  output?: JsonValue
  result?: JsonValue
  errorOutput?: JsonValue
  currentState: string
  executionPath: string[]
  variables: JsonObject
  originalInput?: JsonValue
  stateExecutions?: StateExecution[]
  currentStatePath?: string[]
  mapExecutions?: Array<JsonObject>
  parallelExecutions?: Array<JsonObject>

  Execution?: {
    Id: string
    Input: JsonObject
    Name: string
    RoleArn: string
    StartTime: string
    RedriveCount?: number
    RedriveTime?: string
  }
  State?: {
    EnteredTime: string
    Name: string
    RetryCount: number
  }
  StateMachine?: {
    Id: string
    Name: string
  }
  Task?: {
    Token: string
  }
  Map?: {
    Item: {
      Index: number
      Value: JsonValue
    }
  }
}

// =============================================================================
// Re-exports
// =============================================================================

export type { ChoiceRule } from './choice-rule.js'
export { JSONataChoiceRule, JSONPathChoiceRule } from './choice-rule.js'
export { StateFactory } from './state-factory.js'
export {
  isChoice,
  isDistributedMap,
  isFail,
  isInlineMap,
  isJSONataState,
  isJSONPathState,
  isMap,
  isParallel,
  isPass,
  isSucceed,
  isTask,
  isWait,
} from './state-guards.js'
