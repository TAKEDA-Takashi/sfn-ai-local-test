import type { ExecutionContext, JsonValue } from '../../../types/asl'
import type { TaskState } from '../../../types/state-classes'
import { BaseStateExecutor } from './base'

/**
 * Taskステートエグゼキュータ
 *
 * AWS Lambda、HTTP API、AWS SDK統合など外部サービスを呼び出すステート。
 * リトライ機能、Lambda最適化統合、エラーハンドリングをサポート。
 */
export class TaskStateExecutor extends BaseStateExecutor<TaskState> {
  /**
   * Taskステートの実行: 外部サービスの呼び出しと結果処理
   */
  protected async executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    // リトライ処理
    const maxAttempts = this.getMaxAttempts()
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.invokeTask(input, context)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxAttempts) {
          await this.waitForRetry(attempt)
        }
      }
    }

    throw lastError || new Error('Task execution failed')
  }

  /**
   * 外部タスクの実行
   */
  private async invokeTask(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    // モックエンジンがある場合はモックレスポンスを返す
    if (this.mockEngine) {
      return await this.mockEngine.getMockResponse(context.currentState, input, this.state)
    }

    // 実際のタスク実行（簡略化実装）
    throw new Error('Task execution not implemented')
  }

  /**
   * 最大試行回数の取得
   */
  private getMaxAttempts(): number {
    if (!this.state.Retry || this.state.Retry.length === 0) {
      return 1
    }

    // 簡略化のため、最初のRetryルールのMaxAttemptsを使用
    const firstRetry = this.state.Retry[0]
    return (firstRetry.MaxAttempts ?? 3) + 1
  }

  /**
   * リトライ待機処理
   */
  private async waitForRetry(attemptNumber: number): Promise<void> {
    if (!this.state.Retry || this.state.Retry.length === 0) {
      return
    }

    const firstRetry = this.state.Retry[0]
    const intervalSeconds = firstRetry.IntervalSeconds ?? 1
    const backoffRate = firstRetry.BackoffRate ?? 2.0

    // エクスポネンシャルバックオフ（計算はするが実際の待機はしない）
    const waitTime = intervalSeconds * backoffRate ** (attemptNumber - 1) * 1000

    // ローカルテストツールなので、実際の待機時間は短縮（最大100ms）
    // 本番のStep Functionsでの待機時間を再現する必要はない
    const actualWaitTime = Math.min(waitTime, 100)

    await new Promise((resolve) => setTimeout(resolve, actualWaitTime))
  }
}
