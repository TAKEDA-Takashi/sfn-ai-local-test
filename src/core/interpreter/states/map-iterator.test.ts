import { describe, expect, it } from 'vitest'
import type { ExecutionContext, MapState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MapStateExecutor } from './map'

describe('MapStateExecutor - Iterator support', () => {
  it('should support Iterator field (legacy) as alias for ItemProcessor', async () => {
    const stateMachineDefinition = {
      StartAt: 'MapState',
      States: {
        MapState: {
          Type: 'Map',
          ItemsPath: '$.items',
          Iterator: {
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                Result: { processed: true },
                End: true,
              },
            },
          },
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const mapState = stateMachine.States.MapState as MapState

    const executor = new MapStateExecutor(mapState)
    const context: ExecutionContext = {
      input: {
        items: [1, 2, 3],
      },
      currentState: 'MapState',
      executionPath: [],
      variables: {},
    }

    const result = await executor.execute(context)

    expect(result.output).toEqual([{ processed: true }, { processed: true }, { processed: true }])
  })

  it.skip('should handle Iterator with multiple states', async () => {
    const stateMachineDefinition = {
      StartAt: 'MapState',
      States: {
        MapState: {
          Type: 'Map',
          ItemsPath: '$.items',
          Iterator: {
            StartAt: 'Transform',
            States: {
              Transform: {
                Type: 'Pass',
                Parameters: {
                  'value.$': '$',
                  doubled: 0, // Will be calculated in next state
                },
                Next: 'Calculate',
              },
              Calculate: {
                Type: 'Pass',
                Parameters: {
                  'value.$': '$.value',
                  'doubled.$': 'States.MathMultiply($.value, 2)',
                },
                End: true,
              },
            },
          },
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const mapState = stateMachine.States.MapState as MapState

    const executor = new MapStateExecutor(mapState)
    const context: ExecutionContext = {
      input: {
        items: [10, 20, 30],
      },
      currentState: 'MapState',
      executionPath: [],
      variables: {},
    }

    const result = await executor.execute(context)

    expect(result.output).toEqual([
      { value: 10, doubled: 20 },
      { value: 20, doubled: 40 },
      { value: 30, doubled: 60 },
    ])
  })

  it('should handle empty array with Iterator', async () => {
    const stateMachineDefinition = {
      StartAt: 'MapState',
      States: {
        MapState: {
          Type: 'Map',
          ItemsPath: '$.items',
          Iterator: {
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                Result: { processed: true },
                End: true,
              },
            },
          },
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const mapState = stateMachine.States.MapState as MapState

    const executor = new MapStateExecutor(mapState)
    const context: ExecutionContext = {
      input: {
        items: [],
      },
      currentState: 'MapState',
      executionPath: [],
      variables: {},
    }

    const result = await executor.execute(context)
    expect(result.output).toEqual([])
  })

  describe('Iterator internal execution tracking', () => {
    it('should actually execute Iterator internal states and track stateExecutions', async () => {
      // Test to verify that Iterator internal states are actually executed
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemsPath: '$.items',
            Iterator: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
                  Parameters: {
                    'itemId.$': '$.itemId',
                    processed: true,
                    timestamp: 'test-timestamp',
                  },
                  End: true,
                },
              },
            },
            Next: 'NextState',
          },
          NextState: {
            Type: 'Pass',
            End: true,
          },
        },
      }

      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const executor = new MapStateExecutor(mapState)
      const context: ExecutionContext = {
        input: {
          items: [{ itemId: 'item-1' }, { itemId: 'item-2' }],
        },
        currentState: 'MapState',
        executionPath: [],
        stateExecutions: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Verify basic Map execution
      expect(result.output).toBeDefined()
      expect(result.nextState).toBe('NextState')

      // Critical test: Verify that Iterator internal states were actually executed
      // Check if ProcessItem state executions are recorded
      const processItemExecutions = context.stateExecutions?.filter(
        (exec: any) => exec.statePath.includes('ProcessItem') || exec.state === 'ProcessItem',
      )

      expect(processItemExecutions, 'ProcessItem state executions should be recorded').toBeDefined()
      expect(
        processItemExecutions?.length,
        'Should have ProcessItem executions for each item',
      ).toBe(2)

      // Check if execution paths contain ProcessItem
      expect(context.mapExecutions).toBeDefined()
      expect(context.mapExecutions).toHaveLength(1)

      const mapExecution = context.mapExecutions?.[0]
      expect(mapExecution?.iterationPaths).toBeDefined()
      expect(mapExecution?.iterationPaths).toHaveLength(2)

      // Each iteration path should contain ProcessItem
      for (let i = 0; i < (mapExecution?.iterationPaths as any)?.length; i++) {
        expect(
          (mapExecution?.iterationPaths as any)?.[i],
          `Iteration ${i} should contain ProcessItem`,
        ).toEqual(['ProcessItem'])
      }

      // Verify that the output contains processed items
      expect(Array.isArray(result.output)).toBe(true)
      const processedItems = result.output as unknown[]
      expect(processedItems).toHaveLength(2)
      expect(processedItems[0]).toHaveProperty('processed', true)
      expect(processedItems[0]).toHaveProperty('timestamp', 'test-timestamp')
      expect(processedItems[1]).toHaveProperty('processed', true)
      expect(processedItems[1]).toHaveProperty('timestamp', 'test-timestamp')
    })

    it('should execute ItemProcessor internal states and track stateExecutions', async () => {
      // Test to verify that ItemProcessor internal states are actually executed
      const mapState = StateFactory.createState({
        Type: 'Map',
        ItemsPath: '$.items',
        ItemProcessor: {
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass',
              Parameters: {
                'itemId.$': '$.itemId',
                processed: true,
                timestamp: 'test-timestamp',
              },
              End: true,
            },
          },
        },
        Next: 'NextState',
      }) as MapState

      const executor = new MapStateExecutor(mapState)
      const context: ExecutionContext = {
        input: {
          items: [{ itemId: 'item-1' }, { itemId: 'item-2' }],
        },
        currentState: 'MapState',
        executionPath: [],
        stateExecutions: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Verify basic Map execution
      expect(result.output).toBeDefined()
      expect(result.nextState).toBe('NextState')

      // Critical test: Verify that ItemProcessor internal states were actually executed
      // Check if ProcessItem state executions are recorded
      const processItemExecutions = context.stateExecutions?.filter(
        (exec: any) => exec.statePath.includes('ProcessItem') || exec.state === 'ProcessItem',
      )

      expect(processItemExecutions, 'ProcessItem state executions should be recorded').toBeDefined()
      expect(
        processItemExecutions?.length,
        'Should have ProcessItem executions for each item',
      ).toBe(2)

      // Check if execution paths contain ProcessItem
      expect(context.mapExecutions).toBeDefined()
      expect(context.mapExecutions).toHaveLength(1)

      const mapExecution = context.mapExecutions?.[0]
      expect(mapExecution?.iterationPaths).toBeDefined()
      expect(mapExecution?.iterationPaths).toHaveLength(2)

      // Each iteration path should contain ProcessItem
      for (let i = 0; i < (mapExecution?.iterationPaths as any)?.length; i++) {
        expect(
          (mapExecution?.iterationPaths as any)?.[i],
          `Iteration ${i} should contain ProcessItem`,
        ).toEqual(['ProcessItem'])
      }

      // Verify that the output contains processed items
      expect(Array.isArray(result.output)).toBe(true)
      const processedItems = result.output as unknown[]
      expect(processedItems).toHaveLength(2)
      expect(processedItems[0]).toHaveProperty('processed', true)
      expect(processedItems[0]).toHaveProperty('timestamp', 'test-timestamp')
      expect(processedItems[1]).toHaveProperty('processed', true)
      expect(processedItems[1]).toHaveProperty('timestamp', 'test-timestamp')
    })
  })
})
