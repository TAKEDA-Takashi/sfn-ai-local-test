import type { PassState, State, StateMachine, TaskState } from '../../types/asl'
import { isJsonObject } from '../../types/type-guards'

/**
 * Dynamic field detection result
 */
export interface DynamicFieldDetection {
  stateName: string
  hasDynamicFields: boolean
  dynamicPaths: string[]
  reason: string
  recommendPartialMatching: boolean
}

/**
 * Step Functions の動的な値を生成するパターン
 */
const DYNAMIC_JSONPATH_PATTERNS = [
  '$$.State.EnteredTime',
  '$$.State.StartedTime',
  '$$.State.Name',
  '$$.State.Token',
  '$$.Execution.StartTime',
  '$$.Execution.Id',
  '$$.Execution.Name',
  '$$.Execution.Input',
  '$$.Task.Token',
  '$$.Map.Item.Index',
  '$$.Map.Item.Value',
]

const DYNAMIC_INTRINSIC_FUNCTIONS = [
  'States.UUID',
  'States.Format',
  'States.ArrayGetItem($$.State.EnteredTime',
  'States.ArrayGetItem($$.Execution.StartTime',
]

const DYNAMIC_JSONATA_FUNCTIONS = ['$now()', '$millis()', '$random()', '$uuid()']

/**
 * ステートマシンの動的フィールドを検出
 */
export function detectDynamicFields(stateMachine: StateMachine): DynamicFieldDetection[] {
  const detections: DynamicFieldDetection[] = []

  for (const [stateName, state] of Object.entries(stateMachine.States || {})) {
    const detection = analyzeStateForDynamicFields(stateName, state)
    if (detection.hasDynamicFields) {
      detections.push(detection)
    }
  }

  return detections
}

/**
 * 個別のステートを分析して動的フィールドを検出
 */
function analyzeStateForDynamicFields(stateName: string, state: State): DynamicFieldDetection {
  const dynamicPaths: string[] = []
  const reasons: string[] = []

  // Task state の Parameters をチェック（JSONPath モードのみ）
  if (state.isTask() && !state.isJSONataState()) {
    const taskState = state as TaskState
    if ('Parameters' in taskState && taskState.Parameters) {
      const paths = findDynamicFieldsInObject(taskState.Parameters, 'Parameters')
      dynamicPaths.push(...paths.map((p) => `Parameters.${p}`))
      if (paths.length > 0) {
        reasons.push('Task Parameters contain dynamic values')
      }
    }

    // ResultSelector もチェック
    if ('ResultSelector' in taskState && taskState.ResultSelector) {
      const paths = findDynamicFieldsInObject(taskState.ResultSelector, 'ResultSelector')
      dynamicPaths.push(...paths.map((p) => `ResultSelector.${p}`))
      if (paths.length > 0) {
        reasons.push('ResultSelector contains dynamic values')
      }
    }
  }

  // Pass state の Parameters/Result をチェック（JSONPath モードのみ）
  if (state.isPass() && !state.isJSONataState()) {
    const passState = state as PassState
    if ('Parameters' in passState && passState.Parameters) {
      const paths = findDynamicFieldsInObject(passState.Parameters, 'Parameters')
      dynamicPaths.push(...paths.map((p) => `Parameters.${p}`))
      if (paths.length > 0) {
        reasons.push('Pass Parameters contain dynamic values')
      }
    }
    if ('Result' in passState && passState.Result && isJsonObject(passState.Result)) {
      const paths = findDynamicFieldsInObject(passState.Result, 'Result')
      dynamicPaths.push(...paths.map((p) => `Result.${p}`))
      if (paths.length > 0) {
        reasons.push('Pass Result contains dynamic values')
      }
    }
  }

  // JSONata の Output/Assign をチェック
  if (state.isJSONataState()) {
    // JSONata state can be different types with Output/Assign
    const stateObj = state as unknown as Record<string, unknown>
    if ('Output' in stateObj && typeof stateObj.Output === 'string') {
      const outputStr = stateObj.Output as string
      const hasDynamic = DYNAMIC_JSONATA_FUNCTIONS.some((fn) => outputStr.includes(fn))
      if (hasDynamic) {
        dynamicPaths.push('Output')
        reasons.push('JSONata Output uses dynamic functions')
      }
    }
    if ('Assign' in stateObj && stateObj.Assign) {
      const assignStr = JSON.stringify(stateObj.Assign)
      const hasDynamic = DYNAMIC_JSONATA_FUNCTIONS.some((fn) => assignStr.includes(fn))
      if (hasDynamic) {
        dynamicPaths.push('Assign')
        reasons.push('JSONata Assign uses dynamic functions')
      }
    }
  }

  return {
    stateName,
    hasDynamicFields: dynamicPaths.length > 0,
    dynamicPaths,
    reason: reasons.join(', '),
    recommendPartialMatching: dynamicPaths.length > 0,
  }
}

/**
 * オブジェクト内の動的フィールドを再帰的に検出
 */
function findDynamicFieldsInObject(obj: unknown, path = ''): string[] {
  const dynamicPaths: string[] = []

  if (!isJsonObject(obj)) {
    return dynamicPaths
  }

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key

    // Keys ending with .$ indicate JSONPath references
    if (key.endsWith('.$')) {
      if (typeof value === 'string') {
        // Check for dynamic patterns
        const isDynamic =
          DYNAMIC_JSONPATH_PATTERNS.some((pattern) => value.includes(pattern)) ||
          DYNAMIC_INTRINSIC_FUNCTIONS.some((fn) => value.includes(fn))

        if (isDynamic) {
          dynamicPaths.push(currentPath)
        }
      }
    }

    // Recursively check child elements
    if (isJsonObject(value)) {
      const childPaths = findDynamicFieldsInObject(value, currentPath)
      dynamicPaths.push(...childPaths)
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const childPaths = findDynamicFieldsInObject(item, `${currentPath}[${index}]`)
        dynamicPaths.push(...childPaths)
      })
    }
  }

  return dynamicPaths
}

/**
 * テストケースに対してpartial matchingを推奨するかどうかを判定
 */
export function shouldRecommendPartialMatching(
  stateMachine: StateMachine,
  stateName: string,
): boolean {
  const state = stateMachine.States?.[stateName]
  if (!state) return false

  const detection = analyzeStateForDynamicFields(stateName, state)
  return detection.recommendPartialMatching
}
