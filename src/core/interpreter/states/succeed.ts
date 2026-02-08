import type { ExecutionContext, JsonValue, SucceedState } from '../../../types/asl'
import { BaseStateExecutor } from './base'

/**
 * Succeedステートエグゼキュータ
 * 成功で実行を終了するステート
 */
export class SucceedStateExecutor extends BaseStateExecutor<SucceedState> {
  /**
   * Succeedステートの実行: 入力をそのまま返して成功終了
   */
  protected executeState(input: JsonValue, _context: ExecutionContext): Promise<JsonValue> {
    // Pass through input unchanged - Output field handled by post-processing
    return Promise.resolve(input)
  }

  /**
   * 次の状態を決定（Succeedは終了状態）
   */
  protected determineNextState(): string | undefined {
    // Succeed always terminates execution
    return undefined
  }
}
