import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { StateMachineExecutor } from '../executor'

describe('JSONPath Variable Scope in Map and Parallel States', () => {
  const createMockEngine = (itemReaderData?: any[]) =>
    ({
      getMockResponse: (_stateName: string) => {
        return Promise.resolve(null)
      },
      getMockData: (params: any) => {
        // Mock data for ItemReader
        if (params.type === 'itemReader' && itemReaderData) {
          return itemReaderData
        }
        return null
      },
    }) as unknown as MockEngine

  const mockEngine = createMockEngine()

  describe('Map State Variable Scope (JSONPath)', () => {
    describe('INLINE Map mode', () => {
      it('should allow iterations to read parent scope variables', async () => {
        const stateMachine = StateFactory.createStateMachine({
          StartAt: 'SetupVariables',
          States: {
            SetupVariables: {
              Type: 'Pass',
              Assign: {
                parentVar: 'parent-value',
                multiplier: 10,
                items: [1, 2, 3],
              },
              Next: 'ProcessMap',
            },
            ProcessMap: {
              Type: 'Map',
              ItemsPath: '$items',
              ItemProcessor: {
                ProcessorConfig: {
                  Mode: 'INLINE',
                },
                StartAt: 'ProcessItem',
                States: {
                  ProcessItem: {
                    Type: 'Pass',
                    Parameters: {
                      'item.$': '$',
                      'parentValue.$': '$parentVar',
                      'calculated.$': 'States.MathAdd($, $multiplier)',
                    },
                    End: true,
                  },
                },
              },
              End: true,
            },
          },
        })

        const executor = new StateMachineExecutor(stateMachine, mockEngine)
        const result = await executor.execute({})

        // Each iteration should be able to read parent variables
        expect(result.output).toEqual([
          { item: 1, parentValue: 'parent-value', calculated: 11 },
          { item: 2, parentValue: 'parent-value', calculated: 12 },
          { item: 3, parentValue: 'parent-value', calculated: 13 },
        ])
        // Parent variables should remain unchanged
        expect(result.variables?.parentVar).toBe('parent-value')
        expect(result.variables?.multiplier).toBe(10)
      })

      it('should isolate variable assignments between Map iterations', async () => {
        const stateMachine = StateFactory.createStateMachine({
          StartAt: 'SetupVariables',
          States: {
            SetupVariables: {
              Type: 'Pass',
              Assign: {
                sharedVar: 'initial-value',
                items: ['a', 'b', 'c'],
              },
              Next: 'ProcessMap',
            },
            ProcessMap: {
              Type: 'Map',
              ItemsPath: '$items',
              ItemProcessor: {
                ProcessorConfig: {
                  Mode: 'INLINE',
                },
                StartAt: 'ModifyVariable',
                States: {
                  ModifyVariable: {
                    Type: 'Pass',
                    // Try to modify parent variable (should not affect parent)
                    Assign: {
                      sharedVar: 'modified-by-iteration',
                      iterationVar: '$.value',
                    },
                    Parameters: {
                      'input.$': '$',
                      'varValue.$': '$sharedVar',
                    },
                    End: true,
                  },
                },
              },
              Next: 'CheckVariables',
            },
            CheckVariables: {
              Type: 'Pass',
              Parameters: {
                'sharedVar.$': '$sharedVar',
                'iterationVar.$': '$iterationVar',
              },
              End: true,
            },
          },
        })

        const executor = new StateMachineExecutor(stateMachine, mockEngine)
        const result = await executor.execute({})

        // Parent scope variables should remain unchanged after Map execution
        expect(result.output).toEqual({
          sharedVar: 'initial-value',
          iterationVar: null, // Should not exist in parent scope
        })
        expect(result.variables?.sharedVar).toBe('initial-value')
        expect(result.variables?.iterationVar).toBeUndefined()
      })

      it('should maintain separate variable scope for each Map iteration', async () => {
        const stateMachine = StateFactory.createStateMachine({
          StartAt: 'SetupVariables',
          States: {
            SetupVariables: {
              Type: 'Pass',
              Assign: {
                counter: 0,
                items: [1, 2, 3],
              },
              Next: 'ProcessMap',
            },
            ProcessMap: {
              Type: 'Map',
              ItemsPath: '$items',
              ItemProcessor: {
                ProcessorConfig: {
                  Mode: 'INLINE',
                },
                StartAt: 'IncrementCounter',
                States: {
                  IncrementCounter: {
                    Type: 'Pass',
                    // Each iteration tries to increment counter
                    Assign: {
                      'counter.$': 'States.MathAdd($counter, 1)',
                      'localValue.$': '$',
                    },
                    Next: 'CaptureValues',
                  },
                  CaptureValues: {
                    Type: 'Pass',
                    // Now the variables have been updated by the previous state
                    Parameters: {
                      'item.$': '$localValue',
                      'counterInIteration.$': '$counter',
                    },
                    End: true,
                  },
                },
              },
              Next: 'FinalCheck',
            },
            FinalCheck: {
              Type: 'Pass',
              Parameters: {
                'counter.$': '$counter',
                'result.$': '$',
              },
              End: true,
            },
          },
        })

        const executor = new StateMachineExecutor(stateMachine, mockEngine)
        const result = await executor.execute({})

        // The FinalCheck state wraps the Map output
        const finalOutput = result.output as any
        console.log('Final output:', JSON.stringify(finalOutput, null, 2))
        const mapOutput = finalOutput.result

        // Check if mapOutput exists
        expect(mapOutput).toBeDefined()
        expect(Array.isArray(mapOutput)).toBe(true)
        expect(mapOutput.length).toBe(3)

        // Each iteration should start with the original counter value
        expect(mapOutput[0].counterInIteration).toBe(1) // 0 + 1
        expect(mapOutput[1].counterInIteration).toBe(1) // 0 + 1 (not 2!)
        expect(mapOutput[2].counterInIteration).toBe(1) // 0 + 1 (not 3!)

        // Parent counter should remain unchanged
        expect(finalOutput.counter).toBe(0)
      })
    })

    describe('DISTRIBUTED Map mode', () => {
      it('should NOT allow iterations to access parent scope variables', async () => {
        const stateMachine = StateFactory.createStateMachine({
          StartAt: 'SetupVariables',
          States: {
            SetupVariables: {
              Type: 'Pass',
              Assign: {
                parentVar: 'should-not-be-accessible',
                items: [1],
              },
              Next: 'ProcessDistributedMap',
            },
            ProcessDistributedMap: {
              Type: 'Map',
              ItemReader: {
                Resource: 'arn:aws:states:::s3:listObjectsV2',
                ReaderConfig: {
                  InputType: 'JSON',
                },
              },
              ItemProcessor: {
                ProcessorConfig: {
                  Mode: 'DISTRIBUTED',
                  ExecutionType: 'STANDARD',
                },
                StartAt: 'TryAccessParentVar',
                States: {
                  TryAccessParentVar: {
                    Type: 'Pass',
                    Parameters: {
                      'item.$': '$',
                      // This should return null or undefined in distributed mode
                      'parentValue.$': '$parentVar',
                    },
                    End: true,
                  },
                },
              },
              End: true,
            },
          },
        })

        const distributedMockEngine = createMockEngine([1])
        const executor = new StateMachineExecutor(stateMachine, distributedMockEngine)
        const result = await executor.execute({})

        // In distributed mode, parent variables should not be accessible
        expect(result.output).toEqual([{ item: 1, parentValue: null }])
      })

      it('should have completely isolated variable scope in distributed mode', async () => {
        const stateMachine = StateFactory.createStateMachine({
          StartAt: 'SetupVariables',
          States: {
            SetupVariables: {
              Type: 'Pass',
              Assign: {
                outerVar: 'outer-value',
                items: ['item1'],
              },
              Next: 'ProcessDistributedMap',
            },
            ProcessDistributedMap: {
              Type: 'Map',
              ItemsPath: '$items',
              ItemProcessor: {
                ProcessorConfig: {
                  Mode: 'DISTRIBUTED',
                  ExecutionType: 'EXPRESS',
                },
                StartAt: 'SetDistributedVar',
                States: {
                  SetDistributedVar: {
                    Type: 'Pass',
                    Assign: {
                      distributedVar: 'distributed-value',
                      outerVar: 'trying-to-modify-outer',
                    },
                    Parameters: {
                      'result.$': '$distributedVar',
                    },
                    End: true,
                  },
                },
              },
              Next: 'CheckOuterScope',
            },
            CheckOuterScope: {
              Type: 'Pass',
              Parameters: {
                'outerVar.$': '$outerVar',
                'distributedVar.$': '$distributedVar',
              },
              End: true,
            },
          },
        })

        const executor = new StateMachineExecutor(stateMachine, mockEngine)
        const result = await executor.execute({})

        // Outer variables should remain unchanged
        expect(result.output).toEqual({
          outerVar: 'outer-value',
          distributedVar: null, // Should not exist in outer scope
        })
        expect(result.variables?.outerVar).toBe('outer-value')
        expect(result.variables?.distributedVar).toBeUndefined()
      })
    })
  })

  describe('Parallel State Variable Scope (JSONPath)', () => {
    it('should allow branches to read parent scope variables', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'SetupVariables',
        States: {
          SetupVariables: {
            Type: 'Pass',
            Assign: {
              sharedData: 'shared-value',
              branchMultiplier: 2,
            },
            Next: 'ParallelProcess',
          },
          ParallelProcess: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Branch1',
                States: {
                  Branch1: {
                    Type: 'Pass',
                    Parameters: {
                      branch: 1,
                      'sharedData.$': '$sharedData',
                      'calculated.$': 'States.MathAdd(10, $branchMultiplier)',
                    },
                    End: true,
                  },
                },
              },
              {
                StartAt: 'Branch2',
                States: {
                  Branch2: {
                    Type: 'Pass',
                    Parameters: {
                      branch: 2,
                      'sharedData.$': '$sharedData',
                      'calculated.$': 'States.MathAdd(20, $branchMultiplier)',
                    },
                    End: true,
                  },
                },
              },
            ],
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)
      const result = await executor.execute({})

      // Each branch should be able to read parent variables
      expect(result.output).toEqual([
        { branch: 1, sharedData: 'shared-value', calculated: 12 },
        { branch: 2, sharedData: 'shared-value', calculated: 22 },
      ])
    })

    it('should isolate variable assignments between parallel branches', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'SetupVariables',
        States: {
          SetupVariables: {
            Type: 'Pass',
            Assign: {
              sharedVar: 'initial-value',
            },
            Next: 'ParallelProcess',
          },
          ParallelProcess: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Branch1Modify',
                States: {
                  Branch1Modify: {
                    Type: 'Pass',
                    Assign: {
                      sharedVar: 'modified-by-branch1',
                      branch1Var: 'branch1-specific',
                    },
                    Parameters: {
                      branch: 1,
                      'varValue.$': '$sharedVar',
                    },
                    End: true,
                  },
                },
              },
              {
                StartAt: 'Branch2Modify',
                States: {
                  Branch2Modify: {
                    Type: 'Pass',
                    Assign: {
                      sharedVar: 'modified-by-branch2',
                      branch2Var: 'branch2-specific',
                    },
                    Parameters: {
                      branch: 2,
                      'varValue.$': '$sharedVar',
                    },
                    End: true,
                  },
                },
              },
            ],
            Next: 'CheckVariables',
          },
          CheckVariables: {
            Type: 'Pass',
            Parameters: {
              'sharedVar.$': '$sharedVar',
              'branch1Var.$': '$branch1Var',
              'branch2Var.$': '$branch2Var',
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)
      const result = await executor.execute({})

      // Parent scope variables should remain unchanged
      expect(result.output).toEqual({
        sharedVar: 'initial-value',
        branch1Var: null,
        branch2Var: null,
      })
      expect(result.variables?.sharedVar).toBe('initial-value')
      expect(result.variables?.branch1Var).toBeUndefined()
      expect(result.variables?.branch2Var).toBeUndefined()
    })
  })
})
