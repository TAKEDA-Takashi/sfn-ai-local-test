import type { ExecutionContext, FailState, JsonValue } from '../../../types/asl'
import { BaseStateExecutor } from './base'

/**
 * Failステートエグゼキュータ
 * エラーメッセージを生成してエラーで終了する
 */
export class FailStateExecutor extends BaseStateExecutor<FailState> {
  /**
   * Failステートの実行: エラーの発生
   * エラーメッセージを生成して必ずエラーで終了する
   */
  protected executeState(_input: JsonValue, _context: ExecutionContext): Promise<JsonValue> {
    const error = this.state.Error || 'States.Failed'
    const cause = this.state.Cause ?? 'State failed'

    return Promise.reject(new Error(`${error}: ${cause}`))
  }
}
