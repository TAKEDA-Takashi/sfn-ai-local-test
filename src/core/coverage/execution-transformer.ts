import type { JsonValue } from '../../types/asl'
import { isJsonObject } from '../../types/type-guards'

export interface MapExecutionInput {
  state: string
  iterationPaths?: string[][]
}

export interface ParallelExecutionInput {
  type: string
  state: string
  branchCount: number
  branchPaths: string[][]
}

/** JsonValue配列からMapExecution入力に変換 */
export function transformMapExecutions(executions: unknown[] | undefined): MapExecutionInput[] {
  if (!executions) return []

  return executions
    .filter((exec): exec is Record<string, unknown> => isJsonObject(exec as JsonValue))
    .map((exec) => ({
      state: typeof exec.state === 'string' ? exec.state : '',
      iterationPaths: isStringArrayArray(exec.iterationPaths) ? exec.iterationPaths : undefined,
    }))
}

/** JsonValue配列からParallelExecution入力に変換 */
export function transformParallelExecutions(
  executions: unknown[] | undefined,
): ParallelExecutionInput[] {
  if (!executions) return []

  return executions
    .filter((exec): exec is Record<string, unknown> => isJsonObject(exec as JsonValue))
    .map((exec) => ({
      type: typeof exec.type === 'string' ? exec.type : 'parallel',
      state: typeof exec.state === 'string' ? exec.state : '',
      branchCount: typeof exec.branchCount === 'number' ? exec.branchCount : 0,
      branchPaths: isStringArrayArray(exec.branchPaths) ? exec.branchPaths : [],
    }))
}

function isStringArrayArray(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (path: unknown) => Array.isArray(path) && path.every((p: unknown) => typeof p === 'string'),
    )
  )
}
