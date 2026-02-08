/**
 * State型ガードユーティリティ関数
 *
 * Discriminated union (State.Type) による型絞り込みを提供
 */

import type {
  ChoiceState,
  DistributedMapState,
  FailState,
  InlineMapState,
  JSONataState,
  JSONPathState,
  MapState,
  ParallelState,
  PassState,
  State,
  SucceedState,
  TaskState,
  WaitState,
} from './asl.js'

export function isTask(state: State): state is TaskState {
  return state.Type === 'Task'
}

export function isPass(state: State): state is PassState {
  return state.Type === 'Pass'
}

export function isChoice(state: State): state is ChoiceState {
  return state.Type === 'Choice'
}

export function isWait(state: State): state is WaitState {
  return state.Type === 'Wait'
}

export function isSucceed(state: State): state is SucceedState {
  return state.Type === 'Succeed'
}

export function isFail(state: State): state is FailState {
  return state.Type === 'Fail'
}

export function isMap(state: State): state is MapState {
  return state.Type === 'Map'
}

export function isParallel(state: State): state is ParallelState {
  return state.Type === 'Parallel'
}

export function isDistributedMap(state: State): state is DistributedMapState {
  return state.Type === 'Map' && state.ProcessorMode === 'DISTRIBUTED'
}

export function isInlineMap(state: State): state is InlineMapState {
  return state.Type === 'Map' && state.ProcessorMode !== 'DISTRIBUTED'
}

export function isJSONPathState(state: State): state is JSONPathState {
  return state.QueryLanguage !== 'JSONata'
}

export function isJSONataState(state: State): state is JSONataState {
  return state.QueryLanguage === 'JSONata'
}
