import type { ExecutionContext, JsonValue } from '../../../types/asl'
import type { WaitState } from '../../../types/state-classes'
import { JSONPathProcessor } from '../utils/jsonpath-processor'
import { BaseStateExecutor } from './base'

/**
 * Waitステートエグゼキュータ
 * 指定された時間待機してから次のステートに進む
 */
export class WaitStateExecutor extends BaseStateExecutor<WaitState> {
  /**
   * Waitステートの実行: 待機処理
   */
  protected async executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    // JSONata mode validationはStateFactoryで実施済み
    const waitTimeMs = this.calculateWaitTime(input, context)

    // 待機処理（ローカルテストツールなので最大100ms）
    // 本番のStep Functionsでの実際の待機時間を再現する必要はない
    if (waitTimeMs > 0) {
      const actualWaitTime = Math.min(waitTimeMs, 100)
      await new Promise((resolve) => setTimeout(resolve, actualWaitTime))
    }

    return Promise.resolve(input)
  }

  /**
   * 待機時間の計算
   */
  private calculateWaitTime(input: JsonValue, _context: ExecutionContext): number {
    // Seconds フィールド（リテラル値のみサポート、JSONata式は簡略化）
    if ('Seconds' in this.state && this.state.Seconds !== undefined) {
      return Number(this.state.Seconds) * 1000
    }

    // SecondsPath フィールド（JSONPathモードのみ、簡略化実装）
    if ('SecondsPath' in this.state && this.state.SecondsPath !== undefined) {
      const seconds = this.getPathValue(this.state.SecondsPath, input)
      if (seconds !== undefined) {
        return Number(seconds) * 1000
      }
    }

    // Timestamp フィールド（リテラル値のみサポート）
    if ('Timestamp' in this.state && this.state.Timestamp !== undefined) {
      const targetTime = new Date(String(this.state.Timestamp)).getTime()
      return Math.max(0, targetTime - Date.now())
    }

    // TimestampPath フィールド（JSONPathモードのみ、簡略化実装）
    if ('TimestampPath' in this.state && this.state.TimestampPath !== undefined) {
      const timestamp = this.getPathValue(this.state.TimestampPath, input)
      if (timestamp !== undefined) {
        const targetTime =
          typeof timestamp === 'number' ? timestamp : new Date(String(timestamp)).getTime()
        return Math.max(0, targetTime - Date.now())
      }
    }

    return 0
  }

  /**
   * JSONPath値の取得
   */
  private getPathValue(path: string, input: JsonValue): JsonValue | undefined {
    // JSONPathProcessorを使用して統一的に評価
    const result = JSONPathProcessor.evaluateStringValue(path, input, {
      handleIntrinsics: false,
    })
    return result === null ? undefined : result
  }
}
