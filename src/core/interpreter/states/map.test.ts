import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from '../../../types/asl'
import type { MapState } from '../../../types/state-classes'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { MapStateExecutor } from './map'

describe('MapStateExecutor', () => {
  describe('constructor', () => {
    it('should create MapStateExecutor instance', () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            ItemsPath: '$.items',
            End: true,
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          },
        },
      }

      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const executor = new MapStateExecutor(mapState)
      expect(executor).toBeInstanceOf(MapStateExecutor)
    })
  })

  describe('execute', () => {
    it('should process empty array', async () => {
      // Create a full state machine definition
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            ItemsPath: '$.items',
            End: true,
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          },
        },
      }

      // Create state machine using StateFactory
      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const context: ExecutionContext = {
        input: { items: [] },
        output: {},
        executionPath: [],
        currentState: 'MapState',
        currentStatePath: [],
        variables: {},
      }

      const executor = new MapStateExecutor(mapState, undefined, stateMachine)
      const result = await executor.execute(context)

      expect(result.output).toEqual([])
      expect(result.nextState).toBeUndefined()
      // Check isEnd is undefined or false when End is true
      expect(result.nextState).toBeUndefined()
    })

    it('should process single item', async () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            ItemsPath: '$.items',
            End: true,
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  Result: { processed: true },
                  End: true,
                },
              },
            },
          },
        },
      }

      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const context: ExecutionContext = {
        input: { items: [{ id: 1 }] },
        output: {},
        executionPath: [],
        currentState: 'MapState',
        currentStatePath: [],
        variables: {},
      }

      const executor = new MapStateExecutor(mapState, undefined, stateMachine)
      const result = await executor.execute(context)

      expect(result.output).toEqual([{ processed: true }])
      expect(result.nextState).toBeUndefined()
    })

    it('should throw error for JSONata mode with Parameters field', () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            QueryLanguage: 'JSONata',
            Parameters: {}, // Invalid in JSONata mode
            End: true,
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          },
        },
      }

      expect(() => StateFactory.createStateMachine(stateMachineDefinition)).toThrow(
        'Parameters field is not supported in JSONata mode. Use Arguments field instead',
      )
    })

    it('should throw error for JSONata mode with ItemsPath field', () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            QueryLanguage: 'JSONata',
            ItemsPath: '$.items', // Invalid in JSONata mode
            End: true,
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          },
        },
      }

      expect(() => StateFactory.createStateMachine(stateMachineDefinition)).toThrow(
        'ItemsPath field is not supported in JSONata mode. Use Items field instead',
      )
    })
  })

  describe('MaxConcurrency', () => {
    it('should respect MaxConcurrency setting', async () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            ItemsPath: '$.items',
            MaxConcurrency: 2,
            End: true,
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          },
        },
      }

      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const context: ExecutionContext = {
        input: { items: [1, 2, 3, 4] },
        output: {},
        executionPath: [],
        currentState: 'MapState',
        currentStatePath: [],
        variables: {},
      }

      const executor = new MapStateExecutor(mapState, undefined, stateMachine)
      const result = await executor.execute(context)

      expect(result.output).toHaveLength(4)
      expect(result.nextState).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle invalid ItemsPath', async () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map' as const,
            ItemsPath: '$.nonexistent',
            End: true,
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          },
        },
      }

      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const context: ExecutionContext = {
        input: { items: [1, 2] },
        output: {},
        executionPath: [],
        currentState: 'MapState',
        currentStatePath: [],
        variables: {},
      }

      const executor = new MapStateExecutor(mapState, undefined, stateMachine)

      // ItemsPathが無効な場合、undefined -> []として扱われる
      const result = await executor.execute(context)
      expect(result.output).toEqual([])
    })
  })

  describe('Dynamic Require Issue', () => {
    it('should execute Map state without dynamic require errors', async () => {
      const mapStateDefinition = StateFactory.createState({
        Type: 'Map' as const,
        ItemsPath: '$.items',
        ItemProcessor: {
          ProcessorConfig: {
            Mode: 'INLINE' as const,
          },
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass' as const,
              End: true,
            },
          },
        },
        End: true,
      }) as MapState

      const input = {
        items: [
          { id: 1, value: 'item1' },
          { id: 2, value: 'item2' },
        ],
      }

      const context: ExecutionContext = {
        input,
        currentState: 'MapState',
        executionPath: [],
        variables: {},
        originalInput: input,
        stateExecutions: [],
      }

      const mockEngine = {
        getMockResponse: async () => null,
      } as unknown as MockEngine

      const mapStateExecutor = new MapStateExecutor(mapStateDefinition, mockEngine)
      const result = await mapStateExecutor.execute(context)

      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      expect(Array.isArray(result.output)).toBe(true)
      expect((result.output as any).length).toBe(2)
    })

    it('should handle ItemSelector with JSONPath expressions', async () => {
      const mapStateDefinition = StateFactory.createState({
        Type: 'Map' as const,
        ItemsPath: '$.items',
        ItemSelector: {
          'itemId.$': '$.id',
          'itemValue.$': '$.value',
          staticField: 'static-value',
        },
        ItemProcessor: {
          ProcessorConfig: {
            Mode: 'INLINE' as const,
          },
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass' as const,
              End: true,
            },
          },
        },
        End: true,
      }) as MapState

      const input = {
        items: [
          { id: 1, value: 'item1' },
          { id: 2, value: 'item2' },
        ],
      }

      const context: ExecutionContext = {
        input,
        currentState: 'MapState',
        executionPath: [],
        variables: {},
        originalInput: input,
        stateExecutions: [],
      }

      const mockEngine = {
        getMockResponse: async () => null,
      } as unknown as MockEngine

      const mapStateExecutor = new MapStateExecutor(mapStateDefinition, mockEngine)
      const result = await mapStateExecutor.execute(context)

      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      expect(Array.isArray(result.output)).toBe(true)
    })
  })

  describe('Map State Execution', () => {
    it('should execute Map state with Pass child state', async () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
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

      const input = {
        items: [
          { id: 1, value: 'item1' },
          { id: 2, value: 'item2' },
        ],
      }

      const context: ExecutionContext = {
        input,
        currentState: 'MapState',
        executionPath: [],
        variables: {},
      }

      const executor = new MapStateExecutor(mapState, undefined, stateMachine)
      const result = await executor.execute(context)

      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      expect(Array.isArray(result.output)).toBe(true)
      expect((result.output as any).length).toBe(2)
    })

    it('should execute Map state with ItemSelector', async () => {
      const stateMachineDefinition = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemSelector: {
              'itemId.$': '$.id',
              'itemValue.$': '$.value',
              status: 'processed',
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            ResultPath: '$.processedItems',
            End: true,
          },
        },
      }

      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const mapState = stateMachine.States.MapState as MapState

      const input = {
        items: [
          { id: 1, value: 'item1' },
          { id: 2, value: 'item2' },
        ],
      }

      const context: ExecutionContext = {
        input,
        currentState: 'MapState',
        executionPath: [],
        variables: {},
      }

      const executor = new MapStateExecutor(mapState, undefined, stateMachine)
      const result = await executor.execute(context)

      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      expect((result.output as any).processedItems).toBeDefined()
      expect(Array.isArray((result.output as any).processedItems)).toBe(true)
      expect((result.output as any).processedItems.length).toBe(2)
      expect((result.output as any).processedItems[0]).toHaveProperty('itemId')
      expect((result.output as any).processedItems[0]).toHaveProperty('itemValue')
      expect((result.output as any).processedItems[0]).toHaveProperty('status')
      expect((result.output as any).processedItems[0].status).toBe('processed')
    })
  })
})
