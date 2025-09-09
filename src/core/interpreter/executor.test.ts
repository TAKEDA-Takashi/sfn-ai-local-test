import { describe, expect, it, vi } from 'vitest'
import { StateFactory } from '../../types/asl'
import { StateMachineExecutor } from './executor'
import { DistributedMapStateExecutor, MapStateExecutor } from './states/map'
import { StateExecutorFactory } from './states/state-executor-factory'

// Test utility type to access private fields
// interface StateMachineExecutorWithPrivates extends StateMachineExecutor {
//   stateExecutors: Map<string, unknown>
// }

describe('StateMachineExecutor', () => {
  describe('State Executor Selection', () => {
    it('should use DistributedMapStateExecutor for DISTRIBUTED Map states', () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      // Get the Map state
      const mapState = stateMachine.States.MapState

      // Create executor for the Map state
      const mapExecutor = StateExecutorFactory.create(mapState)

      // Should be DistributedMapStateExecutor because Mode is DISTRIBUTED
      expect(mapExecutor).toBeInstanceOf(DistributedMapStateExecutor)
    })

    it('should use MapStateExecutor for INLINE Map states', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            ItemsPath: '$.items',
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)

      // Get the Map state
      const mapState = stateMachine.States.MapState

      // Create executor for the Map state
      const mapExecutor = StateExecutorFactory.create(mapState)

      // Should be MapStateExecutor because Mode is INLINE
      expect(mapExecutor).toBeInstanceOf(MapStateExecutor)
      expect(mapExecutor).not.toBeInstanceOf(DistributedMapStateExecutor)

      // Execute to verify it works
      const result = await executor.execute({ items: ['a', 'b'] })
      expect(result.success).toBe(true)
      expect(result.output).toEqual(['processed', 'processed'])
    })

    it('should handle both regular and distributed Map states', async () => {
      // Regular Map state (without ProcessorMode, defaults to INLINE)
      const regularMapStateMachine = StateFactory.createStateMachine({
        StartAt: 'RegularMap',
        States: {
          RegularMap: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      // Distributed Map state
      const distributedMapStateMachine = StateFactory.createStateMachine({
        StartAt: 'DistributedMap',
        States: {
          DistributedMap: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              ReaderConfig: {
                InputType: 'JSON',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
                ExecutionType: 'EXPRESS',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const regularExecutor = new StateMachineExecutor(regularMapStateMachine)

      // Get the Map states
      const regularMapState = regularMapStateMachine.States.RegularMap
      const distributedMapState = distributedMapStateMachine.States.DistributedMap

      // Create executors for the Map states
      const regularMapExecutor = StateExecutorFactory.create(regularMapState)
      const distributedMapExecutor = StateExecutorFactory.create(distributedMapState)

      // Regular Map should use MapStateExecutor
      expect(regularMapExecutor).toBeInstanceOf(MapStateExecutor)
      expect(regularMapExecutor).not.toBeInstanceOf(DistributedMapStateExecutor)

      // Distributed Map should use DistributedMapStateExecutor
      expect(distributedMapExecutor).toBeInstanceOf(DistributedMapStateExecutor)

      // Test execution with regular Map
      const regularResult = await regularExecutor.execute({
        items: ['a', 'b', 'c'],
      })
      expect(regularResult.success).toBe(true)
      expect(regularResult.output).toEqual(['processed', 'processed', 'processed'])
    })
  })

  describe('ExecutionContext Input Handling', () => {
    it('should update currentState when ExecutionContext is passed with empty currentState', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'FirstState',
        States: {
          FirstState: {
            Type: 'Pass',
            Result: 'done',
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const contextInput = {
        currentState: '', // Empty currentState
        executionPath: [],
        variables: {},
        input: { test: 'data' },
      }

      const result = await executor.execute(contextInput)
      expect(result.success).toBe(true)
      expect(result.executionPath).toContain('FirstState')
    })
  })

  describe('Error Handling', () => {
    it('should throw error for non-existent state', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'NonExistent',
        States: {
          ExistingState: {
            Type: 'Pass',
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      expect(result.success).toBe(false)
      expect(result.error).toContain('State "NonExistent" not found')
    })

    it('should handle max steps exceeded', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'InfiniteLoop',
        States: {
          InfiniteLoop: {
            Type: 'Pass',
            Next: 'InfiniteLoop', // Infinite loop
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({}, { maxSteps: 5 })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Execution exceeded maximum steps (5)')
    })

    it('should log verbose state execution when verbose option is enabled', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'TestState',
        States: {
          TestState: {
            Type: 'Pass',
            Result: 'test',
            End: true,
          },
        },
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const executor = new StateMachineExecutor(stateMachine)
      await executor.execute({}, { verbose: true })

      expect(consoleSpy).toHaveBeenCalledWith('Executing state: TestState (Pass)')
      expect(consoleSpy).toHaveBeenCalledWith(
        'State execution result:',
        expect.objectContaining({
          hasError: false,
        }),
      )
      consoleSpy.mockRestore()
    })
  })

  describe('Verbose Logging', () => {
    it('should log next state when verbose option is enabled', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'FirstState',
        States: {
          FirstState: {
            Type: 'Pass',
            Next: 'SecondState',
          },
          SecondState: {
            Type: 'Pass',
            End: true,
          },
        },
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const executor = new StateMachineExecutor(stateMachine)
      await executor.execute({}, { verbose: true })

      expect(consoleSpy).toHaveBeenCalledWith('Next state: SecondState')
      expect(consoleSpy).toHaveBeenCalledWith('Next state: (none)')
      consoleSpy.mockRestore()
    })
  })

  describe('Distributed Map Features', () => {
    it('should use DistributedMapStateExecutor for Map with ItemReader', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapWithReader',
        States: {
          MapWithReader: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'my-bucket',
              },
            },
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)

      // Execute should complete (DistributedMap processes default items)
      const result = await executor.execute({})
      // DistributedMap processes items (mocked to return 10 items by default)
      expect(result.success).toBe(true)
      expect(Array.isArray(result.output)).toBe(true)
      expect((result.output as unknown[]).every((item) => item === 'processed')).toBe(true)
    })

    it('should use DistributedMapStateExecutor for Map with ItemBatcher', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapWithBatcher',
        States: {
          MapWithBatcher: {
            Type: 'Map',
            ItemBatcher: {
              MaxBatchSize: 10,
            },
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})
      // DistributedMap processes items
      expect(result.success).toBe(true)
      expect(Array.isArray(result.output)).toBe(true)
      expect((result.output as unknown[])[0]).toBe('processed')
    })

    it('should use DistributedMapStateExecutor for Map with ResultWriter', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MapWithWriter',
        States: {
          MapWithWriter: {
            Type: 'Map',
            ResultWriter: {
              Resource: 'arn:aws:states:::s3:putObject',
              Parameters: {
                Bucket: 'output-bucket',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'processed',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})
      // DistributedMap with ResultWriter returns metadata
      expect(result.success).toBe(true)
      expect(typeof result.output).toBe('object')
      expect(Array.isArray(result.output)).toBe(false)
      const output = result.output as Record<string, unknown>
      expect(output.ProcessedItemCount).toBe(1)
      expect(output.ResultWriterDetails).toBeDefined()
      expect((output.ResultWriterDetails as Record<string, unknown>).Bucket).toBe('mock-bucket')
    })
  })

  describe('Normal Completion', () => {
    it('should return success when execution completes without explicit End state', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'OnlyState',
        States: {
          OnlyState: {
            Type: 'Pass',
            Result: 'completed',
            // No End property, no Next property
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({ input: 'test' })

      expect(result.success).toBe(true)
      expect(result.output).toBe('completed')
      expect(result.executionPath).toEqual(['OnlyState'])
    })
  })

  describe('Map Execution Metadata', () => {
    it('should track mapExecutions metadata for Map states', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'done',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({
        items: [1, 2, 3, 4, 5],
      })

      expect(result.success).toBe(true)
      expect(result.mapExecutions).toBeDefined()
      expect(result.mapExecutions).toHaveLength(1)
      expect(result.mapExecutions?.[0]).toMatchObject({
        type: 'Map',
        state: 'TestMap',
        iterationCount: 5,
      })
    })

    it('should track empty dataset iterations as 0', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'EmptyMap',
        States: {
          EmptyMap: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Result: 'done',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({
        items: [], // Empty array
      })

      expect(result.success).toBe(true)
      expect(result.mapExecutions).toBeDefined()
      expect(result.mapExecutions).toHaveLength(1)
      expect(result.mapExecutions?.[0]).toMatchObject({
        type: 'Map',
        state: 'EmptyMap',
        iterationCount: 0, // Should be 0 for empty dataset
      })
    })
  })
})
