import type { ExecutionContext, JsonArray, JsonValue, StateMachine } from '../../../types/asl'
import type { ParallelState } from '../../../types/state-classes'
import { isJsonObject } from '../../../types/type-guards'
import { StateMachineExecutor } from '../executor'
import { BaseStateExecutor, type StateExecutionResult } from './base'

export class ParallelStateExecutor extends BaseStateExecutor<ParallelState> {
  /**
   * Parallelステートの実行: 複数のブランチの並列実行
   */
  protected async executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    // ブランチを並列実行
    const branchResults = await this.executeBranches(input, context)

    // 結果を配列として返す（後処理でResultSelectorが適用される）
    return branchResults
  }

  /**
   * すべてのブランチを並列実行
   */
  private async executeBranches(input: JsonValue, context: ExecutionContext): Promise<JsonArray> {
    const currentStateName = context.currentState
    const branchPaths: string[][] = new Array(this.state.Branches.length)

    const branchPromises = this.state.Branches.map(async (branch, branchIndex) => {
      const branchResult = await this.executeBranch(
        branch,
        branchIndex,
        input,
        context,
        currentStateName,
      )

      // ブランチパスの記録
      if (branchResult.executionPath) {
        branchPaths[branchIndex] = branchResult.executionPath
      }

      // ステート実行情報の記録
      this.recordBranchStateExecutions(branchResult, branchIndex, currentStateName, context)

      return branchResult.output
    })

    // Promise.all returns an array of JsonValue (branch outputs)
    const results: JsonArray = await Promise.all(branchPromises)

    // Parallelメタデータの記録
    this.recordParallelMetadata(currentStateName, branchPaths, context)

    return results
  }

  /**
   * 単一ブランチの実行
   */
  private async executeBranch(
    branch: StateMachine,
    branchIndex: number,
    input: JsonValue,
    parentContext: ExecutionContext,
    currentStateName: string,
  ) {
    // ブランチ実行用のコンテキストを作成
    const branchContext = this.createBranchContext(
      branch,
      branchIndex,
      input,
      parentContext,
      currentStateName,
    )

    // ブランチを実行
    const branchExecutor = new StateMachineExecutor(branch, this.mockEngine)
    const branchResult = await branchExecutor.execute(branchContext)

    if (!branchResult.success) {
      throw new Error(`Branch execution failed: ${branchResult.error}`)
    }

    return branchResult
  }

  /**
   * ブランチ実行用コンテキストの作成
   */
  private createBranchContext(
    branch: StateMachine,
    branchIndex: number,
    input: JsonValue,
    parentContext: ExecutionContext,
    currentStateName: string,
  ): ExecutionContext {
    return {
      ...parentContext,
      input: input,
      variables: { ...parentContext.variables }, // スコープ分離のためコピー
      currentState: branch.StartAt, // ブランチのStartAt状態から開始
      currentStatePath: [
        ...(parentContext.currentStatePath || []),
        currentStateName,
        branchIndex.toString(),
      ],
      executionPath: [],
      stateExecutions: [],
      parallelExecutions: [],
    }
  }

  /**
   * ブランチのステート実行情報を記録
   */
  private recordBranchStateExecutions(
    branchResult: StateExecutionResult,
    branchIndex: number,
    currentStateName: string,
    parentContext: ExecutionContext,
  ): void {
    if (parentContext.stateExecutions && branchResult.stateExecutions) {
      for (const stateExec of branchResult.stateExecutions) {
        const executionWithContext = {
          ...stateExec,
          statePath: [
            ...(parentContext.currentStatePath || []),
            currentStateName,
            branchIndex.toString(),
            ...stateExec.statePath,
          ],
          parentState: currentStateName,
          iterationIndex: branchIndex, // ブランチインデックスをイテレーションインデックスとして使用
        }
        parentContext.stateExecutions.push(executionWithContext)
      }
    }
  }

  /**
   * Parallelメタデータの記録
   */
  private recordParallelMetadata(
    currentStateName: string,
    branchPaths: string[][],
    context: ExecutionContext,
  ): void {
    if (context.stateExecutions) {
      const parallelMetadata = {
        type: 'Parallel',
        state: currentStateName,
        branchCount: this.state.Branches.length,
        branchPaths,
      }

      if (!context.parallelExecutions) {
        context.parallelExecutions = []
      }
      context.parallelExecutions.push(parallelMetadata)
    }
  }

  /**
   * エラーハンドリング（Catchルールの処理）
   */
  protected handleError(error: unknown, context: ExecutionContext) {
    // Catchルールがある場合の処理
    const matchedCatch = this.findMatchingCatch(error)
    if (matchedCatch) {
      let errorOutput = context.input

      // ResultPathがある場合はエラー情報を適用
      if ('ResultPath' in matchedCatch && matchedCatch.ResultPath) {
        const errorInfo = {
          Error: error instanceof Error ? error.name : 'Error',
          Cause: error instanceof Error ? error.message : String(error),
        }
        // ResultPath処理の簡易実装
        const resultPath = matchedCatch.ResultPath
        if (typeof resultPath === 'string') {
          if (resultPath === '$') {
            errorOutput = errorInfo
          } else {
            // Ensure context.input is an object before spreading
            const baseOutput = isJsonObject(context.input) ? context.input : {}
            errorOutput = {
              ...baseOutput,
              [resultPath.replace('$.', '')]: errorInfo,
            }
          }
        } else {
          errorOutput = errorInfo
        }
      }

      return {
        output: errorOutput,
        nextState: matchedCatch.Next,
        error: error instanceof Error ? error.message : String(error),
        executionPath: [],
        success: false, // エラーが発生したのでfalse
        variables: context.variables,
      }
    }

    // Catchルールにマッチしない場合はベースクラスのエラーハンドリング
    return super.handleError(error, context)
  }
}
