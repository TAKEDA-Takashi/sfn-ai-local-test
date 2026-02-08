import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/state-factory'
import { isChoice, isDistributedMap, isMap, isParallel, isTask } from '../../types/state-guards'

describe('Nested State conversion in ItemProcessor and Branches', () => {
  it('should convert ItemProcessor States for DistributedMap', () => {
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
    const mapState = states.TestMap!

    expect(mapState).toBeDefined()
    expect(isMap(mapState)).toBe(true)
    expect(isDistributedMap(mapState)).toBe(true)

    if (isMap(mapState)) {
      const itemProcessor = mapState.ItemProcessor
      expect(itemProcessor).toBeDefined()
      expect(itemProcessor.States).toBeDefined()

      const processItem = itemProcessor.States.ProcessItem!
      expect(processItem).toBeDefined()
      expect(isTask(processItem)).toBe(true)

      const checkItem = itemProcessor.States.CheckItem!
      expect(checkItem).toBeDefined()
      expect(isChoice(checkItem)).toBe(true)
    }
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
    const mapState = states.TestNestedMap!

    expect(mapState).toBeDefined()
    expect(isMap(mapState)).toBe(true)

    if (isMap(mapState)) {
      // Level 1: First ItemProcessor
      const nestedMap = mapState.ItemProcessor.States.NestedMap!
      expect(nestedMap).toBeDefined()
      expect(isMap(nestedMap)).toBe(true)

      if (isMap(nestedMap)) {
        // Level 2: Nested ItemProcessor
        const deepMap = nestedMap.ItemProcessor.States.DeepMap!
        expect(deepMap).toBeDefined()
        expect(isMap(deepMap)).toBe(true)

        if (isMap(deepMap)) {
          // Level 3: Deeply nested ItemProcessor
          const innerTask = deepMap.ItemProcessor.States.InnerTask!
          expect(innerTask).toBeDefined()
          expect(isTask(innerTask)).toBe(true)
        }
      }
    }
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
    const parallelState = states.TestParallel!

    expect(parallelState).toBeDefined()
    expect(isParallel(parallelState)).toBe(true)

    if (isParallel(parallelState)) {
      const branches = parallelState.Branches
      expect(branches).toBeDefined()
      expect(branches.length).toBe(1)

      const branchMap = branches[0]!.States.BranchMap!
      expect(branchMap).toBeDefined()
      expect(isMap(branchMap)).toBe(true)

      if (isMap(branchMap)) {
        // ItemProcessor inside the Map in the branch
        const mapTask = branchMap.ItemProcessor.States.MapTask!
        expect(mapTask).toBeDefined()
        expect(isTask(mapTask)).toBe(true)
      }
    }
  })
})
