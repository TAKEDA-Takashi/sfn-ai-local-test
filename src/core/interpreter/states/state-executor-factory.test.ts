/**
 * Tests for StateExecutorFactory
 */

import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { ChoiceStateExecutor } from './choice'
import { FailStateExecutor } from './fail'
import { DistributedMapStateExecutor, MapStateExecutor } from './map'
import { ParallelStateExecutor } from './parallel'
import { PassStateExecutor } from './pass'
import { StateExecutorFactory } from './state-executor-factory'
import { SucceedStateExecutor } from './succeed'
import { TaskStateExecutor } from './task'
import { WaitStateExecutor } from './wait'

describe('StateExecutorFactory', () => {
  const mockEngine = {} as MockEngine
  const stateMachine = {} as StateMachine

  describe('create', () => {
    it('should create TaskStateExecutor for Task state', () => {
      const state = StateFactory.createState({ Type: 'Task', Resource: 'arn:aws:lambda:function' })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(TaskStateExecutor)
    })

    it('should create ChoiceStateExecutor for Choice state', () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.value',
            NumericEquals: 1,
            Next: 'State1',
          },
        ],
        Default: 'DefaultState',
      })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(ChoiceStateExecutor)
    })

    it('should create DistributedMapStateExecutor for DistributedMap', () => {
      const state = StateFactory.createState({
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: {
            Mode: 'DISTRIBUTED',
          },
          StartAt: 'Step1',
          States: {
            Step1: { Type: 'Pass', End: true },
          },
        },
      })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(DistributedMapStateExecutor)
    })

    it('should create MapStateExecutor for Map state', () => {
      const state = StateFactory.createState({
        Type: 'Map',
        ItemProcessor: {
          StartAt: 'Step1',
          States: {
            Step1: { Type: 'Pass', End: true },
          },
        },
      })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(MapStateExecutor)
    })

    it('should create ParallelStateExecutor for Parallel state', () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'Step1',
            States: {
              Step1: { Type: 'Pass', End: true },
            },
          },
        ],
      })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(ParallelStateExecutor)
    })

    it('should create PassStateExecutor for Pass state', () => {
      const state = StateFactory.createState({ Type: 'Pass' })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(PassStateExecutor)
    })

    it('should create WaitStateExecutor for Wait state', () => {
      const state = StateFactory.createState({ Type: 'Wait', Seconds: 1 })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(WaitStateExecutor)
    })

    it('should create SucceedStateExecutor for Succeed state', () => {
      const state = StateFactory.createState({ Type: 'Succeed' })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(SucceedStateExecutor)
    })

    it('should create FailStateExecutor for Fail state', () => {
      const state = StateFactory.createState({ Type: 'Fail' })
      const executor = StateExecutorFactory.create(state, mockEngine, stateMachine)
      expect(executor).toBeInstanceOf(FailStateExecutor)
    })
  })
})
