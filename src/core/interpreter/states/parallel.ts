import type {
  ExecutionContext,
  JsonArray,
  JsonValue,
  ParallelState,
  StateMachine,
} from '../../../types/asl'
import { isJsonObject } from '../../../types/type-guards'
import { StateMachineExecutor } from '../executor'
import { BaseStateExecutor, type StateExecutionResult } from './base'

export class ParallelStateExecutor extends BaseStateExecutor<ParallelState> {
  /**
   * Parallelステートの実行: 複数のブランチの並列実行
   */
  protected async executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    const branchResults = await this.executeBranches(input, context)

    // Must return array for ResultSelector to work correctly
    return branchResults
  }

  /**
   * すべてのブランチを並列実行
   */
  private async executeBranches(input: JsonValue, context: ExecutionContext): Promise<JsonArray> {
    const currentStateName = context.currentState
    const branchPaths: string[][] = new Array(this.state.Branches.length)

    // Branches are already converted StateMachines with State instances
    const branchPromises = this.state.Branches.map(async (branch, branchIndex) => {
      const branchResult = await this.executeBranch(
        branch,
        branchIndex,
        input,
        context,
        currentStateName,
      )

      if (branchResult.executionPath) {
        branchPaths[branchIndex] = branchResult.executionPath
      }

      this.recordBranchStateExecutions(branchResult, branchIndex, currentStateName, context)

      return branchResult.output
    })

    // Promise.all returns an array of JsonValue (branch outputs)
    const results: JsonArray = await Promise.all(branchPromises)

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
      variables: { ...parentContext.variables }, // Isolate variable scope per branch
      currentState: branch.StartAt,
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
    const matchedCatch = this.findMatchingCatch(error)
    if (matchedCatch) {
      let errorOutput = context.input

      // Preserve original input while adding error info at ResultPath
      if ('ResultPath' in matchedCatch && matchedCatch.ResultPath) {
        const errorInfo = {
          Error: error instanceof Error ? error.name : 'Error',
          Cause: error instanceof Error ? error.message : String(error),
        }
        // Simplified ResultPath implementation for Parallel state
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
