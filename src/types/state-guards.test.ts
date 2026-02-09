import { describe, expect, it } from 'vitest'
import type { State } from './asl'
import { StateFactory } from './state-factory'
import {
  isChoice,
  isDistributedMap,
  isFail,
  isInlineMap,
  isJSONataState,
  isJSONPathState,
  isMap,
  isParallel,
  isPass,
  isSucceed,
  isTask,
  isWait,
} from './state-guards'

// テスト用Stateオブジェクト生成ヘルパー
function createTask(): State {
  return StateFactory.createState({ Type: 'Task', Resource: 'arn:aws:lambda:test', End: true })
}

function createPass(): State {
  return StateFactory.createState({ Type: 'Pass', End: true })
}

function createChoice(): State {
  return StateFactory.createState({
    Type: 'Choice',
    Choices: [{ Variable: '$.x', NumericEquals: 1, Next: 'A' }],
    Default: 'B',
  })
}

function createWait(): State {
  return StateFactory.createState({ Type: 'Wait', Seconds: 10, End: true })
}

function createSucceed(): State {
  return StateFactory.createState({ Type: 'Succeed' })
}

function createFail(): State {
  return StateFactory.createState({ Type: 'Fail', Error: 'E', Cause: 'C' })
}

function createInlineMap(): State {
  return StateFactory.createState({
    Type: 'Map',
    ItemProcessor: {
      StartAt: 'P',
      States: { P: { Type: 'Pass', End: true } },
    },
    End: true,
  })
}

function createDistributedMap(): State {
  return StateFactory.createState({
    Type: 'Map',
    ItemProcessor: {
      ProcessorConfig: { Mode: 'DISTRIBUTED' },
      StartAt: 'P',
      States: { P: { Type: 'Pass', End: true } },
    },
    End: true,
  })
}

function createParallel(): State {
  return StateFactory.createState({
    Type: 'Parallel',
    Branches: [{ StartAt: 'B', States: { B: { Type: 'Pass', End: true } } }],
    End: true,
  })
}

const ALL_STATES: Array<{ name: string; state: State }> = [
  { name: 'Task', state: createTask() },
  { name: 'Pass', state: createPass() },
  { name: 'Choice', state: createChoice() },
  { name: 'Wait', state: createWait() },
  { name: 'Succeed', state: createSucceed() },
  { name: 'Fail', state: createFail() },
  { name: 'InlineMap', state: createInlineMap() },
  { name: 'DistributedMap', state: createDistributedMap() },
  { name: 'Parallel', state: createParallel() },
]

describe('State Type Guards', () => {
  describe('isTask', () => {
    it('should return true for Task state', () => {
      expect(isTask(createTask())).toBe(true)
    })

    it('should return false for non-Task states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Task') continue
        expect(isTask(state)).toBe(false)
      }
    })
  })

  describe('isPass', () => {
    it('should return true for Pass state', () => {
      expect(isPass(createPass())).toBe(true)
    })

    it('should return false for non-Pass states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Pass') continue
        expect(isPass(state)).toBe(false)
      }
    })
  })

  describe('isChoice', () => {
    it('should return true for Choice state', () => {
      expect(isChoice(createChoice())).toBe(true)
    })

    it('should return false for non-Choice states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Choice') continue
        expect(isChoice(state)).toBe(false)
      }
    })
  })

  describe('isWait', () => {
    it('should return true for Wait state', () => {
      expect(isWait(createWait())).toBe(true)
    })

    it('should return false for non-Wait states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Wait') continue
        expect(isWait(state)).toBe(false)
      }
    })
  })

  describe('isSucceed', () => {
    it('should return true for Succeed state', () => {
      expect(isSucceed(createSucceed())).toBe(true)
    })

    it('should return false for non-Succeed states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Succeed') continue
        expect(isSucceed(state)).toBe(false)
      }
    })
  })

  describe('isFail', () => {
    it('should return true for Fail state', () => {
      expect(isFail(createFail())).toBe(true)
    })

    it('should return false for non-Fail states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Fail') continue
        expect(isFail(state)).toBe(false)
      }
    })
  })

  describe('isMap', () => {
    it('should return true for InlineMap state', () => {
      expect(isMap(createInlineMap())).toBe(true)
    })

    it('should return true for DistributedMap state', () => {
      expect(isMap(createDistributedMap())).toBe(true)
    })

    it('should return false for non-Map states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'InlineMap' || name === 'DistributedMap') continue
        expect(isMap(state)).toBe(false)
      }
    })
  })

  describe('isParallel', () => {
    it('should return true for Parallel state', () => {
      expect(isParallel(createParallel())).toBe(true)
    })

    it('should return false for non-Parallel states', () => {
      for (const { name, state } of ALL_STATES) {
        if (name === 'Parallel') continue
        expect(isParallel(state)).toBe(false)
      }
    })
  })

  describe('isDistributedMap', () => {
    it('should return true for DistributedMap (ProcessorMode DISTRIBUTED)', () => {
      expect(isDistributedMap(createDistributedMap())).toBe(true)
    })

    it('should return false for InlineMap (ProcessorMode undefined)', () => {
      expect(isDistributedMap(createInlineMap())).toBe(false)
    })

    it('should return false for non-Map states', () => {
      expect(isDistributedMap(createTask())).toBe(false)
      expect(isDistributedMap(createParallel())).toBe(false)
    })
  })

  describe('isInlineMap', () => {
    it('should return true for InlineMap (ProcessorMode undefined)', () => {
      expect(isInlineMap(createInlineMap())).toBe(true)
    })

    it('should return false for DistributedMap', () => {
      expect(isInlineMap(createDistributedMap())).toBe(false)
    })

    it('should return false for non-Map states', () => {
      expect(isInlineMap(createTask())).toBe(false)
      expect(isInlineMap(createParallel())).toBe(false)
    })
  })

  describe('isJSONPathState', () => {
    it('should return true when QueryLanguage is undefined (default JSONPath)', () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        End: true,
      })
      expect(isJSONPathState(state)).toBe(true)
    })

    it('should return true when QueryLanguage is explicitly JSONPath', () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONPath',
        End: true,
      })
      expect(isJSONPathState(state)).toBe(true)
    })

    it('should return false when QueryLanguage is JSONata', () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        End: true,
      })
      expect(isJSONPathState(state)).toBe(false)
    })
  })

  describe('isJSONataState', () => {
    it('should return true when QueryLanguage is JSONata', () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        End: true,
      })
      expect(isJSONataState(state)).toBe(true)
    })

    it('should return false when QueryLanguage is undefined (default JSONPath)', () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        End: true,
      })
      expect(isJSONataState(state)).toBe(false)
    })

    it('should return false when QueryLanguage is explicitly JSONPath', () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONPath',
        End: true,
      })
      expect(isJSONataState(state)).toBe(false)
    })
  })
})
