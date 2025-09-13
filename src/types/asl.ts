/**
 * Amazon States Language (ASL) Type Definitions
 *
 * JSONPath/JSONata分離型設計:
 * - QueryLanguageによる完全な型分離
 * - ステートマシンレベル・ステートレベル両方の階層的判定サポート
 * - AWS仕様準拠の排他的フィールド制御
 */

// Import StateExecution from test types
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
export interface RetryRule {
  ErrorEquals: string[]
  IntervalSeconds?: number
  MaxAttempts?: number
  BackoffRate?: number
  MaxDelaySeconds?: number
  JitterStrategy?: 'FULL' | 'NONE'
}

/** JSONPath用Catchルール */
export interface JSONPathCatchRule {
  ErrorEquals: string[]
  Next?: string
  ResultPath?: string // エラー情報の挿入先パス
}

/** JSONata用Catchルール */
export interface JSONataCatchRule {
  ErrorEquals: string[]
  Next?: string
  Output?: JsonValue // エラー時の出力を指定
}

/** Catchルール統合型（互換性のため） */
export type CatchRule = JSONPathCatchRule | JSONataCatchRule

// =============================================================================
// State Type Forward Declarations
// =============================================================================

// 統合型定義（型ガードで使用）
export type TaskState = JSONPathTaskState | JSONataTaskState
export type ChoiceState = JSONPathChoiceState | JSONataChoiceState
export type MapState =
  | JSONPathInlineMapState
  | JSONataInlineMapState
  | JSONPathDistributedMapState
  | JSONataDistributedMapState
export type InlineMapState = JSONPathInlineMapState | JSONataInlineMapState
export type DistributedMapState = JSONPathDistributedMapState | JSONataDistributedMapState
export type ParallelState = JSONPathParallelState | JSONataParallelState
export type PassState = JSONPathPassState | JSONataPassState
export type WaitState = JSONPathWaitState | JSONataWaitState
export type SucceedState = JSONPathSucceedState | JSONataSucceedState
export type FailState = JSONPathFailState | JSONataFailState

// =============================================================================
// Base State Interface
// =============================================================================

/**
 * 基本Stateインターフェース（全てのStateの基底）
 *
 * @see https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-state-types.html
 */
export interface State {
  /** ステートのタイプ (Task, Pass, Choice, Wait, Succeed, Fail, Map, Parallel) */
  Type: string
  /** 次に遷移するステート名 */
  Next?: string
  /** 終了ステートの場合true */
  End?: boolean
  /** コメント（ドキュメント用） */
  Comment?: string
  /** リトライルール */
  Retry?: RetryRule[]
  /**
   * エラーキャッチルール
   * - JSONPathモード: JSONPathCatchRule[]
   * - JSONataモード: JSONataCatchRule[]
   */
  Catch?: JSONPathCatchRule[] | JSONataCatchRule[]
  /** クエリ言語の指定（未指定の場合は親から継承） */
  QueryLanguage?: 'JSONPath' | 'JSONata'
  /**
   * 変数割り当て（両モードで使用可能）
   * @see https://docs.aws.amazon.com/step-functions/latest/dg/workflow-variables.html
   */
  Assign?: JsonObject

  // 型ガード関数（実装クラスで定義）
  isTask(): this is TaskState
  isChoice(): this is ChoiceState
  isMap(): this is MapState
  isParallel(): this is ParallelState
  isPass(): this is PassState
  isWait(): this is WaitState
  isSucceed(): this is SucceedState
  isFail(): this is FailState
  isDistributedMap(): this is DistributedMapState
  isInlineMap(): this is InlineMapState
  isJSONPathState(): this is JSONPathState
  isJSONataState(): this is JSONataState
}

// =============================================================================
// Query Language Specific State Interfaces
// =============================================================================

/**
 * JSONPathステートの型定義
 * @see https://docs.aws.amazon.com/step-functions/latest/dg/input-output-jsonpath.html
 */
export interface JSONPathState extends State {
  QueryLanguage?: 'JSONPath' | undefined
  Catch?: JSONPathCatchRule[]
  /** 入力のフィルタリング */
  InputPath?: string
  /** 出力のフィルタリング */
  OutputPath?: string
  /** 結果の挿入先パス */
  ResultPath?: string
  /** タスクへのパラメータ（ペイロードテンプレート） */
  Parameters?: JsonObject
  /** 結果のフィルタリング（ペイロードテンプレート） */
  ResultSelector?: JsonObject
  /** 変数への代入（Variables機能） */
  Assign?: JsonObject
}

/**
 * JSONataステートの型定義
 * @see https://docs.aws.amazon.com/step-functions/latest/dg/transforming-data.html
 */
export interface JSONataState extends State {
  QueryLanguage: 'JSONata'
  Catch?: JSONataCatchRule[]
  /**
   * タスクへの引数（JSONata式）
   * - オブジェクト: 各値にJSONata式を含む
   * - 文字列: JSONata式全体
   */
  Arguments?: string | JsonObject
  /**
   * ステートの出力（JSONata式またはJSON値）
   */
  Output?: JsonValue
}

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
export interface JSONPathStateMachine extends StateMachineBase {
  QueryLanguage?: 'JSONPath' | undefined
}

/** JSONataモードステートマシン */
export interface JSONataStateMachine extends StateMachineBase {
  QueryLanguage: 'JSONata'
}

/** 統合ステートマシン型 */
export type StateMachine = JSONPathStateMachine | JSONataStateMachine

// =============================================================================
// Choice State Rules
// =============================================================================

/** JSONPath用ChoiceRule */
export interface JSONPathChoiceRule {
  Variable?: string
  StringEquals?: string
  StringLessThan?: string
  StringGreaterThan?: string
  StringLessThanEquals?: string
  StringGreaterThanEquals?: string
  StringMatches?: string
  NumericEquals?: number
  NumericLessThan?: number
  NumericGreaterThan?: number
  NumericLessThanEquals?: number
  NumericGreaterThanEquals?: number
  BooleanEquals?: boolean
  TimestampEquals?: string
  TimestampLessThan?: string
  TimestampGreaterThan?: string
  TimestampLessThanEquals?: string
  TimestampGreaterThanEquals?: string
  IsNull?: boolean
  IsPresent?: boolean
  IsNumeric?: boolean
  IsString?: boolean
  IsBoolean?: boolean
  IsTimestamp?: boolean
  StringEqualsPath?: string
  StringLessThanPath?: string
  StringGreaterThanPath?: string
  StringLessThanEqualsPath?: string
  StringGreaterThanEqualsPath?: string
  NumericEqualsPath?: string
  BooleanEqualsPath?: string
  TimestampEqualsPath?: string
  TimestampLessThanPath?: string
  TimestampGreaterThanPath?: string
  TimestampLessThanEqualsPath?: string
  TimestampGreaterThanEqualsPath?: string
  NumericLessThanPath?: string
  NumericGreaterThanPath?: string
  NumericLessThanEqualsPath?: string
  NumericGreaterThanEqualsPath?: string
  And?: JSONPathChoiceRule[]
  Or?: JSONPathChoiceRule[]
  Not?: JSONPathChoiceRule
  Next?: string
}

/** JSONata用ChoiceRule */
export interface JSONataChoiceRule {
  Condition?: string
  Next?: string
}

/** ChoiceRule統合型 */
export type ChoiceRule = JSONPathChoiceRule | JSONataChoiceRule

// =============================================================================
// Map State Components
// =============================================================================

/**
 * ItemProcessor（Map/DistributedMapステートで使用）
 */
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
export interface JSONPathItemReader {
  Resource: string
  ReaderConfig?: ReaderConfig & {
    MaxItemsPath?: string // JSONPathモードのみ
  }
  Parameters?: JsonObject
}

/** JSONata用ItemReader */
export interface JSONataItemReader {
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
export interface JSONPathResultWriter extends ResultWriterBase {
  Parameters?: JsonObject
}

/** JSONata用ResultWriter */
export interface JSONataResultWriter extends ResultWriterBase {
  Arguments?: string | JsonObject
}

/** ResultWriter統合型 */
export type ResultWriter = JSONPathResultWriter | JSONataResultWriter

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Step Functions実行コンテキスト
 * 内部的な実行状態とAWS Context Objectの両方を含む
 */
export interface ExecutionContext {
  // === 内部的な実行状態 ===
  /** 現在のステートへの入力 */
  input: JsonValue
  /** ステートの出力 */
  output?: JsonValue
  /** Task/Map/Parallelステートの結果 */
  result?: JsonValue
  /** エラー出力（Catchハンドラで利用） */
  errorOutput?: JsonValue
  /** 現在実行中のステート名 */
  currentState: string
  /** 実行パス（通過したステートの履歴） */
  executionPath: string[]
  /** 変数ストア（Assignで設定された変数） */
  variables: JsonObject
  /** 元の入力（変換前） */
  originalInput?: JsonValue
  /** ステート実行の詳細情報 */
  stateExecutions?: StateExecution[]
  /** 現在のステートパス（ネストしたステートの場合） */
  currentStatePath?: string[]
  /** Map実行の情報 */
  mapExecutions?: Array<JsonObject>
  /** Parallel実行の情報 */
  parallelExecutions?: Array<JsonObject>

  // === AWS Context Object ($$.) ===
  /** 実行情報 */
  Execution?: {
    /** 実行ARN */
    Id: string
    /** 実行への入力 */
    Input: JsonObject
    /** 実行名 */
    Name: string
    /** 実行ロールARN */
    RoleArn: string
    /** 開始時刻（ISO 8601形式） */
    StartTime: string
    /** リドライブ回数（リドライブ時のみ） */
    RedriveCount?: number
    /** リドライブ時刻（リドライブ時のみ） */
    RedriveTime?: string
  }
  /** 現在のステート情報 */
  State?: {
    /** ステート開始時刻（ISO 8601形式） */
    EnteredTime: string
    /** ステート名 */
    Name: string
    /** リトライ回数 */
    RetryCount: number
  }
  /** ステートマシン情報 */
  StateMachine?: {
    /** ステートマシンARN */
    Id: string
    /** ステートマシン名 */
    Name: string
  }
  /** タスクトークン（.waitForTaskToken使用時） */
  Task?: {
    Token: string
  }
  /** Mapステート内のイテレーション情報 */
  Map?: {
    Item: {
      /** 現在のインデックス */
      Index: number
      /** 現在処理中の値 */
      Value: JsonValue
    }
  }
}

// =============================================================================
// Re-exports from other modules
// =============================================================================

// 具体的なStateクラス実装をre-export（外部API用）
export {
  JSONataChoiceState,
  JSONataDistributedMapState,
  JSONataFailState,
  JSONataInlineMapState,
  JSONataParallelState,
  JSONataPassState,
  JSONataSucceedState,
  // JSONata States
  JSONataTaskState,
  JSONataWaitState,
  JSONPathChoiceState,
  JSONPathDistributedMapState,
  JSONPathFailState,
  JSONPathInlineMapState,
  JSONPathParallelState,
  JSONPathPassState,
  JSONPathSucceedState,
  // JSONPath States
  JSONPathTaskState,
  JSONPathWaitState,
} from './state-classes.js'

export { StateFactory } from './state-factory.js'

// 内部使用：union型構築のためのインポート
import type {
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
} from './state-classes.js'
