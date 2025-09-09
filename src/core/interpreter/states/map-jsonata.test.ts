import { describe, expect, it } from 'vitest'
import type { ExecutionContext, MapState } from '../../../types/asl'
import { StateFactory } from '../../../types/asl'
import { MapStateExecutor } from './map'

describe('Map State JSONata Mode', () => {
  const mockEngine = {
    getMockResponse: (stateName: string, input: any) => {
      // For ProcessItem task with Lambda integration, return the proper Lambda response structure
      if (stateName === 'ProcessItem') {
        // Lambda integration returns a Payload wrapped response
        return {
          ExecutedVersion: '$LATEST',
          StatusCode: 200,
          Payload: input, // The actual result is in Payload
        }
      }
      return { result: 'success' }
    },
    getMockData: async () => [
      { id: 1, value: 'item1' },
      { id: 2, value: 'item2' },
      { id: 3, value: 'item3' },
    ],
  }

  describe('Field restrictions in JSONata mode', () => {
    it('should reject Parameters field in JSONata mode', () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        Parameters: {
          item: '$.value',
        },
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      }

      // 構築時にエラーが投げられることを期待
      expect(() => StateFactory.createState(stateData)).toThrow(
        'Parameters field is not supported in JSONata mode. Use Arguments field instead',
      )
    })

    it('should reject ItemsPath field in JSONata mode', () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemsPath: '$.items',
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      }

      // 構築時にエラーが投げられることを期待
      expect(() => StateFactory.createState(stateData)).toThrow(
        'ItemsPath field is not supported in JSONata mode. Use Items field instead',
      )
    })

    it('should reject ResultPath field in JSONata mode', () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ResultPath: '$.results',
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      }

      // 構築時にエラーが投げられることを期待
      expect(() => StateFactory.createState(stateData)).toThrow(
        'ResultPath field is not supported in JSONata mode. Use Output field instead',
      )
    })

    it('should accept Parameters field in JSONPath mode', async () => {
      const state = StateFactory.createState({
        Type: 'Map',
        ItemsPath: '$.items',
        Parameters: {
          'value.$': '$$.Map.Item.Value',
          'index.$': '$$.Map.Item.Index',
        },
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              Result: { processed: true },
              End: true,
            },
          },
        },
        End: true,
      }) as MapState

      const executor = new MapStateExecutor(state as MapState, mockEngine as any)
      const context: ExecutionContext = {
        input: { items: [1, 2, 3] },
        currentState: 'TestMap',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([{ processed: true }, { processed: true }, { processed: true }])
    })
  })

  describe('Data flow in JSONata mode', () => {
    it('should process array input with ItemSelector', async () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemSelector: '{% {"transformed": $ * 2, "original": $} %}',
        ItemProcessor: {
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass',
              QueryLanguage: 'JSONata',
              Output: '{% {"result": $states.input.transformed + 100} %}',
              End: true,
            },
          },
        },
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new MapStateExecutor(state as MapState, mockEngine as any)
      const context: ExecutionContext = {
        input: [10, 20, 30],
        currentState: 'TestMap',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([{ result: 120 }, { result: 140 }, { result: 160 }])
    })

    it('should handle Assign field with JSONata expressions', async () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        Items: [10, 20, 30],
        Assign: {
          total: '{% $sum($states.result) %}',
          count: '{% $count($states.result) %}',
        },
        ItemProcessor: {
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass',
              QueryLanguage: 'JSONata',
              Output: '{% $ %}',
              End: true,
            },
          },
        },
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new MapStateExecutor(state as MapState, mockEngine as any)
      const context: ExecutionContext = {
        input: {},
        currentState: 'TestMap',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Debug output to understand the actual result structure
      console.log('Map result:', JSON.stringify(result, null, 2))
      console.log('Map output:', JSON.stringify(result.output, null, 2))
      console.log('Map variables:', JSON.stringify(result.variables, null, 2))

      // Expected behavior based on AWS actual test:
      // Map result should be [10, 20, 30] and Assign should calculate total=60, count=3
      expect(result.success).toBe(true)
      expect(result.output).toEqual([10, 20, 30])
      expect(result.variables?.total).toBe(60) // 10 + 20 + 30
      expect(result.variables?.count).toBe(3)
    })

    it('should process with Output field in JSONata mode', async () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        Output: '{% {"processedCount": $count($states.result), "items": $states.result} %}',
        ItemProcessor: {
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass',
              QueryLanguage: 'JSONata',
              Output: '{% {"id": $, "processed": true} %}',
              End: true,
            },
          },
        },
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new MapStateExecutor(state as MapState, mockEngine as any)
      const context: ExecutionContext = {
        input: [1, 2, 3],
        currentState: 'TestMap',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual({
        processedCount: 3,
        items: [
          { id: 1, processed: true },
          { id: 2, processed: true },
          { id: 3, processed: true },
        ],
      })
    })
  })

  describe('Variables access in JSONata mode', () => {
    it('should preserve parent variables scope in ItemProcessor', async () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemProcessor: {
          StartAt: 'ProcessWithVar',
          States: {
            ProcessWithVar: {
              Type: 'Pass',
              QueryLanguage: 'JSONata',
              Output: '{% {"item": $states.input, "multiplier": $globalMultiplier} %}',
              End: true,
            },
          },
        },
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new MapStateExecutor(state as MapState, mockEngine as any)
      const context: ExecutionContext = {
        input: [1, 2, 3],
        currentState: 'TestMap',
        executionPath: [],
        variables: {
          globalMultiplier: 10,
        },
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([
        { item: 1, multiplier: 10 },
        { item: 2, multiplier: 10 },
        { item: 3, multiplier: 10 },
      ])
    })
  })

  describe('MaxConcurrency in JSONata mode', () => {
    it('should handle MaxConcurrencyPath with JSONata', async () => {
      const stateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        MaxConcurrencyPath: '$.concurrency',
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              QueryLanguage: 'JSONata',
              Output: '{% $states.input %}',
              End: true,
            },
          },
        },
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new MapStateExecutor(state as MapState, mockEngine as any)
      const context: ExecutionContext = {
        input: {
          concurrency: 2,
          items: [1, 2, 3, 4],
        },
        currentState: 'TestMap',
        executionPath: [],
        variables: {},
      }

      // Should use concurrency from input path
      const result = await executor.execute(context)
      expect(result.output).toBeDefined()
      expect(Array.isArray(result.output)).toBe(true)
    })
  })
})
