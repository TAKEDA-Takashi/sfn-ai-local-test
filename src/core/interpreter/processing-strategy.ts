import type { ExecutionContext, JsonValue, State } from '../../types/asl'

/**
 * 処理戦略インターフェース
 * JSONPathとJSONataの両モードで共通の処理フローを提供
 */
export interface ProcessingStrategy {
  /**
   * 前処理
   * - JSONPathモード: InputPath → Parameters
   * - JSONataモード: Arguments
   */
  preprocess(input: JsonValue, state: State, context: ExecutionContext): Promise<JsonValue>

  /**
   * 後処理
   * - JSONPathモード: ResultSelector → ResultPath → OutputPath
   * - JSONataモード: Assign → Output
   */
  postprocess(
    result: JsonValue,
    originalInput: JsonValue,
    state: State,
    context: ExecutionContext,
  ): Promise<JsonValue>
}
