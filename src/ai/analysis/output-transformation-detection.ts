import type { JSONataTaskState, StateMachine, TaskState } from '../../types/asl'

export interface OutputTransformationDetails {
  stateName: string
  transformationType:
    | 'ResultSelector'
    | 'OutputPath'
    | 'ResultPath'
    | 'JSONataOutput'
    | 'JSONataAssign'
  taskResource: string
  transformsOutput: boolean
  reason: string
}

/**
 * ステートマシンで出力変換を行うステートを検出
 * Lambda統合に限定せず、すべてのタスクステートの出力変換を対象とする
 */
export function detectOutputTransformation(stateMachine: StateMachine): boolean {
  const details = getOutputTransformationDetails(stateMachine)
  return details.length > 0
}

/**
 * 出力変換を行うステートの詳細情報を取得
 * JSONPath および JSONata による任意の出力変換を検出
 */
export function getOutputTransformationDetails(
  stateMachine: StateMachine,
): OutputTransformationDetails[] {
  const details: OutputTransformationDetails[] = []

  for (const [stateName, state] of Object.entries(stateMachine.States || {})) {
    // Task ステートのみを対象
    if (!state.isTask()) {
      continue
    }

    const taskState = state as TaskState
    const resource = taskState.Resource || 'unknown'

    // JSONPath: ResultSelector による変換
    if ('ResultSelector' in taskState && taskState.ResultSelector) {
      details.push({
        stateName,
        transformationType: 'ResultSelector',
        taskResource: resource,
        transformsOutput: true,
        reason: 'ResultSelector extracts specific fields',
      })
    }

    // JSONPath: OutputPath による変換
    if ('OutputPath' in taskState && taskState.OutputPath && taskState.OutputPath !== '$') {
      details.push({
        stateName,
        transformationType: 'OutputPath',
        taskResource: resource,
        transformsOutput: true,
        reason: 'OutputPath filters output',
      })
    }

    // JSONPath: ResultPath による変換（デフォルト '$' 以外）
    if ('ResultPath' in taskState && taskState.ResultPath && taskState.ResultPath !== '$') {
      details.push({
        stateName,
        transformationType: 'ResultPath',
        taskResource: resource,
        transformsOutput: true,
        reason: 'ResultPath merges result with input',
      })
    }

    // JSONata: Output による変換
    if (state.isJSONataState()) {
      const jsonataState = taskState as JSONataTaskState
      if ('Output' in jsonataState && jsonataState.Output) {
        details.push({
          stateName,
          transformationType: 'JSONataOutput',
          taskResource: resource,
          transformsOutput: true,
          reason: 'JSONata Output transforms and computes values',
        })
      }

      if ('Assign' in jsonataState && jsonataState.Assign) {
        details.push({
          stateName,
          transformationType: 'JSONataAssign',
          taskResource: resource,
          transformsOutput: true,
          reason: 'JSONata Assign computes and assigns values',
        })
      }
    }
  }

  return details
}
