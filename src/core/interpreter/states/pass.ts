import type { ExecutionContext, JsonValue, PassState } from '../../../types/asl'
import { isJSONataState } from '../../../types/asl'
import { BaseStateExecutor } from './base'

/**
 * Passステートエグゼキュータ
 *
 * Passステートは入力をそのまま返すか、Resultフィールドの値を返すシンプルなステート。
 * JSONPathモードではResult、JSONataモードではOutputフィールドで出力を制御。
 */
export class PassStateExecutor extends BaseStateExecutor<PassState> {
  /**
   * Passステートの実行: Result値の返却または入力の透過
   */
  protected executeState(input: JsonValue, _context: ExecutionContext): Promise<JsonValue> {
    // JSONPathモードでResultフィールドがある場合は優先
    if (!isJSONataState(this.state) && 'Result' in this.state && this.state.Result !== undefined) {
      return Promise.resolve(this.state.Result)
    }

    // その他の場合は入力をそのまま透過
    // JSONataモードのOutputフィールドは後処理で処理される
    return Promise.resolve(input)
  }
}
