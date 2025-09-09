import type { ExecutionContext, JsonValue } from '../../../types/asl'
import type { SucceedState } from '../../../types/state-classes'
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
    // Succeedステートは入力をそのまま返す
    // JSONataモードでのOutput処理は後処理で対応
    return Promise.resolve(input)
  }

  /**
   * 次の状態を決定（Succeedは終了状態）
   */
  protected determineNextState(): string | undefined {
    // Succeedステートは必ず実行を終了
    return undefined
  }
}
