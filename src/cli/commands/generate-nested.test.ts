import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/state-factory'

describe('Nested State conversion in ItemProcessor and Branches', () => {
  it('should convert ItemProcessor States to State classes for DistributedMap', () => {
    const rawData = {
      Type: 'Map',
      ItemProcessor: {
        ProcessorConfig: {
          Mode: 'DISTRIBUTED',
          ExecutionType: 'STANDARD',
        },
        StartAt: 'ProcessItem',
        States: {
          ProcessItem: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            End: true,
          },
          CheckItem: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.value',
                NumericGreaterThan: 10,
                Next: 'ProcessItem',
              },
            ],
            Default: 'ProcessItem',
          },
        },
      },
      ItemReader: {
        Resource: 'arn:aws:states:::s3:getObject',
        ReaderConfig: {
          InputType: 'JSONL',
        },
      },
    }

    const states = StateFactory.createStates({ TestMap: rawData })
    const mapState = states.TestMap

    expect(mapState).toBeDefined()
    expect(mapState?.isMap()).toBe(true)
    expect(mapState?.isDistributedMap()).toBe(true)

    const itemProcessor = (mapState as any)?.ItemProcessor
    expect(itemProcessor).toBeDefined()
    expect(itemProcessor.States).toBeDefined()

    // Before our fix, these would fail because States weren't converted
    const processItem = itemProcessor.States.ProcessItem
    expect(processItem).toBeDefined()
    expect(typeof processItem.isTask).toBe('function')
    expect(processItem.isTask()).toBe(true)

    const checkItem = itemProcessor.States.CheckItem
    expect(checkItem).toBeDefined()
    expect(typeof checkItem.isChoice).toBe('function')
    expect(checkItem.isChoice()).toBe(true)
  })

  it('should handle deeply nested Map states', () => {
    const rawData = {
      Type: 'Map',
      ItemProcessor: {
        StartAt: 'NestedMap',
        States: {
          NestedMap: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'DeepMap',
              States: {
                DeepMap: {
                  Type: 'Map',
                  ItemProcessor: {
                    StartAt: 'InnerTask',
                    States: {
                      InnerTask: {
                        Type: 'Task',
                        Resource: 'arn:aws:states:::lambda:invoke',
                        End: true,
                      },
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      },
    }

    const states = StateFactory.createStates({ TestNestedMap: rawData })
    const mapState = states.TestNestedMap

    expect(mapState).toBeDefined()
    expect(mapState?.isMap()).toBe(true)

    // Level 1: First ItemProcessor
    const level1 = (mapState as any)?.ItemProcessor
    const nestedMap = level1?.States?.NestedMap
    expect(nestedMap).toBeDefined()
    expect(typeof nestedMap.isMap).toBe('function')
    expect(nestedMap.isMap()).toBe(true)

    // Level 2: Nested ItemProcessor
    const level2 = nestedMap?.ItemProcessor as any
    const deepMap = level2?.States?.DeepMap
    expect(deepMap).toBeDefined()
    expect(typeof deepMap.isMap).toBe('function')
    expect(deepMap.isMap()).toBe(true)

    // Level 3: Deeply nested ItemProcessor
    const level3 = deepMap?.ItemProcessor as any
    const innerTask = level3?.States?.InnerTask
    expect(innerTask).toBeDefined()
    expect(typeof innerTask.isTask).toBe('function')
    expect(innerTask.isTask()).toBe(true)
  })

  it('should handle Parallel state with branches containing Map states', () => {
    const rawData = {
      Type: 'Parallel',
      Branches: [
        {
          StartAt: 'BranchMap',
          States: {
            BranchMap: {
              Type: 'Map',
              ItemProcessor: {
                StartAt: 'MapTask',
                States: {
                  MapTask: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
                    End: true,
                  },
                },
              },
              End: true,
            },
          },
        },
      ],
    }

    const states = StateFactory.createStates({ TestParallel: rawData })
    const parallelState = states.TestParallel

    expect(parallelState).toBeDefined()
    expect(parallelState?.isParallel()).toBe(true)

    const branches = (parallelState as any)?.Branches as any[]
    expect(branches).toBeDefined()
    expect(branches.length).toBe(1)

    // Branch States should be State class instances
    const branchMap = branches[0].States.BranchMap
    expect(branchMap).toBeDefined()
    expect(typeof branchMap.isMap).toBe('function')
    expect(branchMap.isMap()).toBe(true)

    // ItemProcessor inside the Map in the branch
    const itemProcessor = branchMap.ItemProcessor as any
    const mapTask = itemProcessor?.States?.MapTask
    expect(mapTask).toBeDefined()
    expect(typeof mapTask.isTask).toBe('function')
    expect(mapTask.isTask()).toBe(true)
  })
})
