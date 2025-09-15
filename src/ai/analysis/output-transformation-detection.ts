import type { StateMachine } from '../../types/asl'

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
    if (!state.isTask()) {
      continue
    }

    // state.isTask() is a type predicate, so state is now TaskState
    const resource = state.Resource || 'unknown'

    if ('ResultSelector' in state && state.ResultSelector) {
      details.push({
        stateName,
        transformationType: 'ResultSelector',
        taskResource: resource,
        transformsOutput: true,
        reason: 'ResultSelector extracts specific fields',
      })
    }

    if ('OutputPath' in state && state.OutputPath && state.OutputPath !== '$') {
      details.push({
        stateName,
        transformationType: 'OutputPath',
        taskResource: resource,
        transformsOutput: true,
        reason: 'OutputPath filters output',
      })
    }

    // ResultPath default is '$' - only track non-default values
    if ('ResultPath' in state && state.ResultPath && state.ResultPath !== '$') {
      details.push({
        stateName,
        transformationType: 'ResultPath',
        taskResource: resource,
        transformsOutput: true,
        reason: 'ResultPath merges result with input',
      })
    }

    if (state.isJSONataState()) {
      if ('Output' in state && state.Output) {
        details.push({
          stateName,
          transformationType: 'JSONataOutput',
          taskResource: resource,
          transformsOutput: true,
          reason: 'JSONata Output transforms and computes values',
        })
      }

      if ('Assign' in state && state.Assign) {
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
