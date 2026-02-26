/**
 * Factory for creating appropriate StateExecutor instances based on state type
 */

import type { State, StateMachine } from '../../../types/asl'
import {
  isChoice,
  isDistributedMap,
  isFail,
  isMap,
  isParallel,
  isPass,
  isSucceed,
  isTask,
  isWait,
} from '../../../types/asl'
import type { MockEngine } from '../../mock/engine'
import type { BaseStateExecutor } from './base'
import { ChoiceStateExecutor } from './choice'
import { FailStateExecutor } from './fail'
import { DistributedMapStateExecutor, MapStateExecutor } from './map'
import { ParallelStateExecutor } from './parallel'
import { PassStateExecutor } from './pass'
import { SucceedStateExecutor } from './succeed'
import { TaskStateExecutor } from './task'
import { WaitStateExecutor } from './wait'

export class StateExecutorFactory {
  /**
   * Create an appropriate StateExecutor based on the state type
   * @param state The state to create an executor for
   * @param mockEngine Optional mock engine for testing
   * @param stateMachine Optional parent state machine
   * @returns The appropriate StateExecutor instance
   * @throws Error if the state type is unknown
   */
  static create(
    state: State,
    mockEngine?: MockEngine,
    stateMachine?: StateMachine,
  ): BaseStateExecutor {
    if (isTask(state)) {
      return new TaskStateExecutor(state, mockEngine, stateMachine)
    }
    if (isChoice(state)) {
      return new ChoiceStateExecutor(state, mockEngine, stateMachine)
    }
    if (isDistributedMap(state)) {
      return new DistributedMapStateExecutor(state, mockEngine, stateMachine)
    }
    if (isMap(state)) {
      return new MapStateExecutor(state, mockEngine, stateMachine)
    }
    if (isParallel(state)) {
      return new ParallelStateExecutor(state, mockEngine, stateMachine)
    }
    if (isPass(state)) {
      return new PassStateExecutor(state, mockEngine, stateMachine)
    }
    if (isWait(state)) {
      return new WaitStateExecutor(state, mockEngine, stateMachine)
    }
    if (isSucceed(state)) {
      return new SucceedStateExecutor(state, mockEngine, stateMachine)
    }
    if (isFail(state)) {
      return new FailStateExecutor(state, mockEngine, stateMachine)
    }

    // This should never happen if all state types are properly implemented
    throw new Error(`Unknown state type: ${(state as State).Type}`)
  }
}
