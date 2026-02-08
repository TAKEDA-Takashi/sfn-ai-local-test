import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { findStateByName, getAllStateNames } from './state-traversal'

const createStateMachine = (json: any) => StateFactory.createStateMachine(json as JsonObject)

describe('findStateByName', () => {
  it('should find a top-level state', () => {
    const sm = createStateMachine({
      StartAt: 'TaskA',
      States: {
        TaskA: { Type: 'Task', Resource: 'arn:aws:lambda:us-east-1:123:function:fn', End: true },
      },
    })
    const found = findStateByName(sm, 'TaskA')
    expect(found).not.toBeNull()
    expect(found?.Type).toBe('Task')
  })

  it('should find a state inside Map ItemProcessor', () => {
    const sm = createStateMachine({
      StartAt: 'MapState',
      States: {
        MapState: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'NestedTask',
            States: {
              NestedTask: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123:function:fn',
                End: true,
              },
            },
          },
          End: true,
        },
      },
    })
    const found = findStateByName(sm, 'NestedTask')
    expect(found).not.toBeNull()
    expect(found?.Type).toBe('Task')
  })

  it('should find a state inside Parallel branches', () => {
    const sm = createStateMachine({
      StartAt: 'ParallelState',
      States: {
        ParallelState: {
          Type: 'Parallel',
          Branches: [
            {
              StartAt: 'Branch1Task',
              States: { Branch1Task: { Type: 'Pass', End: true } },
            },
            {
              StartAt: 'Branch2Task',
              States: { Branch2Task: { Type: 'Pass', End: true } },
            },
          ],
          End: true,
        },
      },
    })
    expect(findStateByName(sm, 'Branch1Task')).not.toBeNull()
    expect(findStateByName(sm, 'Branch2Task')).not.toBeNull()
  })

  it('should return null for non-existent state', () => {
    const sm = createStateMachine({
      StartAt: 'TaskA',
      States: {
        TaskA: { Type: 'Pass', End: true },
      },
    })
    expect(findStateByName(sm, 'NonExistent')).toBeNull()
  })

  it('should find deeply nested states', () => {
    const sm = createStateMachine({
      StartAt: 'OuterMap',
      States: {
        OuterMap: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'InnerParallel',
            States: {
              InnerParallel: {
                Type: 'Parallel',
                Branches: [
                  {
                    StartAt: 'DeepTask',
                    States: { DeepTask: { Type: 'Pass', End: true } },
                  },
                ],
                End: true,
              },
            },
          },
          End: true,
        },
      },
    })
    expect(findStateByName(sm, 'DeepTask')).not.toBeNull()
  })
})

describe('getAllStateNames', () => {
  it('should return top-level state names', () => {
    const sm = createStateMachine({
      StartAt: 'A',
      States: {
        A: { Type: 'Pass', Next: 'B' },
        B: { Type: 'Pass', End: true },
      },
    })
    expect(getAllStateNames(sm)).toEqual(expect.arrayContaining(['A', 'B']))
    expect(getAllStateNames(sm)).toHaveLength(2)
  })

  it('should include nested state names from Map ItemProcessor', () => {
    const sm = createStateMachine({
      StartAt: 'MapState',
      States: {
        MapState: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'Inner',
            States: { Inner: { Type: 'Pass', End: true } },
          },
          End: true,
        },
      },
    })
    const names = getAllStateNames(sm)
    expect(names).toContain('MapState')
    expect(names).toContain('Inner')
  })

  it('should include nested state names from Parallel branches', () => {
    const sm = createStateMachine({
      StartAt: 'ParallelState',
      States: {
        ParallelState: {
          Type: 'Parallel',
          Branches: [
            { StartAt: 'B1', States: { B1: { Type: 'Pass', End: true } } },
            { StartAt: 'B2', States: { B2: { Type: 'Pass', End: true } } },
          ],
          End: true,
        },
      },
    })
    const names = getAllStateNames(sm)
    expect(names).toContain('ParallelState')
    expect(names).toContain('B1')
    expect(names).toContain('B2')
  })

  it('should include deeply nested state names', () => {
    const sm = createStateMachine({
      StartAt: 'OuterMap',
      States: {
        OuterMap: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'InnerParallel',
            States: {
              InnerParallel: {
                Type: 'Parallel',
                Branches: [
                  {
                    StartAt: 'DeepTask',
                    States: { DeepTask: { Type: 'Pass', End: true } },
                  },
                ],
                End: true,
              },
            },
          },
          End: true,
        },
      },
    })
    const names = getAllStateNames(sm)
    expect(names).toContain('OuterMap')
    expect(names).toContain('InnerParallel')
    expect(names).toContain('DeepTask')
  })
})
