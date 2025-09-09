import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/state-factory'
import { StateHierarchyAnalyzer } from './state-hierarchy-analyzer'

describe('StateHierarchyAnalyzer', () => {
  const analyzer = new StateHierarchyAnalyzer()

  it('should analyze simple state machine', () => {
    const stateMachineDefinition = {
      StartAt: 'State1',
      States: {
        State1: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
          Next: 'State2',
        },
        State2: { Type: 'Succeed' },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const hierarchy = analyzer.analyzeHierarchy(stateMachine)

    expect(hierarchy.topLevelStates).toEqual(['State1', 'State2'])
    expect(hierarchy.nestedStructures).toEqual({})
    expect(hierarchy.allStates).toEqual(['State1', 'State2'])
  })

  it('should analyze Parallel state with branches', () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'ParallelProcess',
      States: {
        ParallelProcess: {
          Type: 'Parallel',
          Branches: [
            {
              StartAt: 'ValidateOrder',
              States: {
                ValidateOrder: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidateOrder',
                  End: true,
                },
              },
            },
            {
              StartAt: 'CalculatePrice',
              States: {
                CalculatePrice: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:CalculatePrice',
                  Next: 'ApplyDiscount',
                },
                ApplyDiscount: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ApplyDiscount',
                  End: true,
                },
              },
            },
          ],
          End: true,
        },
      },
    })

    const hierarchy = analyzer.analyzeHierarchy(stateMachine)

    expect(hierarchy.topLevelStates).toEqual(['ParallelProcess'])
    expect(hierarchy.nestedStructures.ParallelProcess?.type).toBe('Parallel')
    expect(hierarchy.nestedStructures.ParallelProcess?.branches).toHaveLength(2)
    expect(hierarchy.nestedStructures.ParallelProcess?.branches?.[0]?.states).toEqual([
      'ValidateOrder',
    ])
    expect(hierarchy.nestedStructures.ParallelProcess?.branches?.[1]?.states).toEqual([
      'CalculatePrice',
      'ApplyDiscount',
    ])
    expect(hierarchy.allStates).toContain('ParallelProcess.Branch[0].ValidateOrder')
    expect(hierarchy.allStates).toContain('ParallelProcess.Branch[1].CalculatePrice')
  })

  it('should analyze Map state with ItemProcessor', () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'ProcessItems',
      States: {
        ProcessItems: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'ValidateItem',
            States: {
              ValidateItem: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidateItem',
                Next: 'ProcessItem',
              },
              ProcessItem: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                End: true,
              },
            },
          },
          End: true,
        },
      },
    })

    const hierarchy = analyzer.analyzeHierarchy(stateMachine)

    expect(hierarchy.topLevelStates).toEqual(['ProcessItems'])
    expect(hierarchy.nestedStructures.ProcessItems?.type).toBe('Map')
    expect(hierarchy.nestedStructures.ProcessItems?.itemProcessor?.states).toEqual([
      'ValidateItem',
      'ProcessItem',
    ])
    expect(hierarchy.allStates).toContain('ProcessItems.ItemProcessor.ValidateItem')
    expect(hierarchy.allStates).toContain('ProcessItems.ItemProcessor.ProcessItem')
  })

  it('should handle Iterator format in Map state', () => {
    const stateMachineDefinition = {
      StartAt: 'ProcessItems',
      States: {
        ProcessItems: {
          Type: 'Map',
          Iterator: {
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                End: true,
              },
            },
          },
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const hierarchy = analyzer.analyzeHierarchy(stateMachine)

    expect(hierarchy.nestedStructures.ProcessItems?.type).toBe('Map')
    expect(hierarchy.nestedStructures.ProcessItems?.itemProcessor?.states).toEqual(['ProcessItem'])
  })

  it('should analyze Distributed Map state', () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'ProcessLargeDataset',
      States: {
        ProcessLargeDataset: {
          Type: 'Map',
          ItemReader: {
            Resource: 'arn:aws:states:::s3:getObject',
            Parameters: {
              Bucket: 'my-bucket',
              Key: 'data.json',
            },
          },
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ProcessBatch',
            States: {
              ProcessBatch: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessBatch',
                Next: 'LogSuccess',
              },
              LogSuccess: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:LogSuccess',
                End: true,
              },
            },
          },
          ResultWriter: {
            Resource: 'arn:aws:states:::s3:putObject',
            Parameters: {
              Bucket: 'output-bucket',
            },
          },
          End: true,
        },
      },
    })

    const hierarchy = analyzer.analyzeHierarchy(stateMachine)

    expect(hierarchy.nestedStructures.ProcessLargeDataset?.type).toBe('DistributedMap')
    expect(hierarchy.nestedStructures.ProcessLargeDataset?.itemReader).toBeDefined()
    expect(hierarchy.nestedStructures.ProcessLargeDataset?.itemProcessor?.states).toEqual([
      'ProcessBatch',
      'LogSuccess',
    ])
    expect(hierarchy.nestedStructures.ProcessLargeDataset?.resultWriter).toBeDefined()
  })

  it('should get mockable states correctly', () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'PrepareData',
      States: {
        PrepareData: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:PrepareData',
          Next: 'ProcessInParallel',
        },
        ProcessInParallel: {
          Type: 'Parallel',
          Branches: [
            {
              StartAt: 'Branch1Task',
              States: {
                Branch1Task: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Branch1Task',
                  End: true,
                },
              },
            },
          ],
          Next: 'ProcessItems',
        },
        ProcessItems: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                End: true,
              },
            },
          },
          End: true,
        },
      },
    })

    const hierarchy = analyzer.analyzeHierarchy(stateMachine)
    const mockableStates = analyzer.getMockableStates(hierarchy)

    expect(mockableStates).toContain('PrepareData')
    expect(mockableStates).toContain('ProcessInParallel')
    expect(mockableStates).toContain('ProcessItems')
    expect(mockableStates).toContain('ProcessItems.ItemProcessor.ProcessItem')
    // Parallel branch states ARE directly mockable (without parent prefix)
    expect(mockableStates).toContain('Branch1Task')
  })

  it('should generate structure explanation', () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'ParallelProcess',
      States: {
        ParallelProcess: {
          Type: 'Parallel',
          Branches: [
            {
              StartAt: 'Task1',
              States: {
                Task1: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Task1',
                  End: true,
                },
              },
            },
          ],
          End: true,
        },
      },
    })

    const hierarchy = analyzer.analyzeHierarchy(stateMachine)
    const explanation = analyzer.generateStructureExplanation(hierarchy)

    expect(explanation).toContain('State Machine Structure Analysis')
    expect(explanation).toContain('ParallelProcess (Parallel State)')
    expect(explanation).toContain('Branch 0: Task1')
    // The guidance has been updated - Parallel branch states are now individually mockable
    expect(explanation).toContain('Important')
  })

  describe('generateStructureExplanation', () => {
    it('should generate explanation for Map state with ItemProcessor', () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: { Type: 'Pass', End: true },
              },
            },
            End: true,
          },
        },
      })

      const hierarchy = analyzer.analyzeHierarchy(stateMachine)
      const explanation = analyzer.generateStructureExplanation(hierarchy)

      expect(explanation).toContain('### MapState (Map State)')
      expect(explanation).toContain('ItemProcessor contains: Process')
      expect(explanation).toContain('1. Mock the entire Map state for simple cases')
      expect(explanation).toContain(
        '2. Mock individual processor states for complex conditional logic',
      )
    })

    it('should generate explanation for DistributedMap with all components', () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'DistMapState',
        States: {
          DistMapState: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'test-bucket',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
                ExecutionType: 'STANDARD',
              },
              StartAt: 'Process',
              States: {
                Process: { Type: 'Pass', End: true },
              },
            },
            ResultWriter: {
              Resource: 'arn:aws:states:::s3:putObject',
              Parameters: {
                Bucket: 'result-bucket',
                Prefix: 'results/',
              },
            },
            End: true,
          },
        },
      })

      const hierarchy = analyzer.analyzeHierarchy(stateMachine)
      const explanation = analyzer.generateStructureExplanation(hierarchy)

      expect(explanation).toContain('### DistMapState (Distributed Map State)')
      expect(explanation).toContain('ItemReader: arn:aws:states:::s3:listObjectsV2')
      expect(explanation).toContain('ItemProcessor contains: Process')
      expect(explanation).toContain('ResultWriter: arn:aws:states:::s3:putObject')
      expect(explanation).toContain('Mock at the parent level for ItemReader/ResultWriter')
    })

    it('should generate explanation for DistributedMap without ItemReader', () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'DistMapState',
        States: {
          DistMapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: { Type: 'Pass', End: true },
              },
            },
            End: true,
          },
        },
      })

      const hierarchy = analyzer.analyzeHierarchy(stateMachine)
      const explanation = analyzer.generateStructureExplanation(hierarchy)

      expect(explanation).toContain('### DistMapState (Distributed Map State)')
      expect(explanation).not.toContain('ItemReader:')
      expect(explanation).not.toContain('ResultWriter:')
      expect(explanation).toContain('ItemProcessor contains: Process')
    })

    it('should generate explanation for DistributedMap with empty ItemProcessor', () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'DistMapState',
        States: {
          DistMapState: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'test-bucket',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: { Type: 'Pass', End: true },
              },
            },
            End: true,
          },
        },
      })

      const hierarchy = analyzer.analyzeHierarchy(stateMachine)
      const explanation = analyzer.generateStructureExplanation(hierarchy)

      expect(explanation).toContain('### DistMapState (Distributed Map State)')
      expect(explanation).toContain('ItemReader: arn:aws:states:::s3:listObjectsV2')
      expect(explanation).toContain('ItemProcessor contains: Process')
    })

    it('should handle Map with minimal ItemProcessor', () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'SimpleProcess',
              States: {
                SimpleProcess: { Type: 'Succeed' },
              },
            },
            End: true,
          },
        },
      })

      const hierarchy = analyzer.analyzeHierarchy(stateMachine)
      const explanation = analyzer.generateStructureExplanation(hierarchy)

      expect(explanation).toContain('### MapState (Map State)')
      expect(explanation).toContain('ItemProcessor contains: SimpleProcess')
    })
  })
})
