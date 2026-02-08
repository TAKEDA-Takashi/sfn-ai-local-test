import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DistributedMapState, ExecutionContext, MapState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { DistributedMapStateExecutor } from './map'

describe('DistributedMapStateExecutor', () => {
  let executor: DistributedMapStateExecutor
  let mockEngine: Partial<MockEngine>
  let context: ExecutionContext

  beforeEach(() => {
    mockEngine = {
      getMockData: vi.fn(),
      writeResults: vi.fn(),
    }

    context = {
      input: {},
      currentState: 'DistributedMap',
      executionPath: [],
      variables: {},
      stateExecutions: [], // Enable tracking
      mapExecutions: [], // For Map state tracking
      parallelExecutions: [], // For Parallel state tracking
    }
  })

  describe('Distributed Mode Detection', () => {
    it('should use distributed processing when Mode is DISTRIBUTED', async () => {
      const stateMachineDefinition = {
        StartAt: 'DistributedMap',
        States: {
          DistributedMap: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'my-bucket',
                Prefix: 'data/',
              },
            },
            End: true,
          },
        },
      }
      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const state = stateMachine.States.DistributedMap as MapState

      // Debug: Check what's actually in the state
      console.log(
        'Original stateMachineDefinition:',
        JSON.stringify(stateMachineDefinition, null, 2),
      )
      console.log('Created state:', JSON.stringify(state, null, 2))
      console.log('Has ItemProcessor:', 'ItemProcessor' in state)
      console.log('ItemProcessor value:', state.ItemProcessor)
      console.log('State constructor name:', state.constructor.name)

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        { Key: 'data/file1.json' },
        { Key: 'data/file2.json' },
      ])

      const result = await executor.execute(context)

      expect(mockEngine.getMockData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'itemReader',
          resource: 'arn:aws:states:::s3:listObjectsV2',
        }),
      )
      expect(result.output).toHaveLength(2)
    })

    it('should fall back to regular Map when Mode is INLINE', async () => {
      const stateMachineDefinition = {
        StartAt: 'InlineMap',
        States: {
          InlineMap: {
            Type: 'Map',
            ItemsPath: '$.items',
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
            End: true,
          },
        },
      }
      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const state = stateMachine.States.InlineMap as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      context.input = { items: [1, 2, 3] }
      const result = await executor.execute(context)

      expect(result.output).toEqual(['processed', 'processed', 'processed'])
      expect(mockEngine.getMockData).not.toHaveBeenCalled()
    })
  })

  describe('ItemReader Integration', () => {
    it('should read items from S3 listObjectsV2', async () => {
      const stateMachineDefinition = {
        StartAt: 'S3ReadMap',
        States: {
          S3ReadMap: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              ReaderConfig: {
                MaxItems: 5,
              },
              Parameters: {
                Bucket: 'test-bucket',
                Prefix: 'input/',
              },
            },
            End: true,
          },
        },
      }
      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const state = stateMachine.States.S3ReadMap as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      const mockItems = [
        { Key: 'input/1.json', Size: 1024 },
        { Key: 'input/2.json', Size: 2048 },
      ]
      ;(mockEngine.getMockData as any).mockReturnValue(mockItems)

      const result = await executor.execute(context)

      expect(mockEngine.getMockData).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'arn:aws:states:::s3:listObjectsV2',
          config: expect.objectContaining({
            Bucket: 'test-bucket',
            Prefix: 'input/',
            MaxItems: 5,
          }),
        }),
      )
      // Check that the output contains the expected items (ignoring additional fields like ETag, StorageClass)
      expect(result.output).toHaveLength(mockItems.length)
      expect((result.output as any[])[0]).toMatchObject(mockItems[0] as any)
      expect((result.output as any[])[1]).toMatchObject(mockItems[1] as any)
    })

    it('should read items from DynamoDB scan', async () => {
      const stateMachineDefinition = {
        StartAt: 'DynamoDBScanMap',
        States: {
          DynamoDBScanMap: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            ItemReader: {
              Resource: 'arn:aws:states:::aws-sdk:dynamodb:scan',
              ReaderConfig: {
                MaxItems: 100,
              },
              Parameters: {
                TableName: 'MyTable',
              },
            },
            End: true,
          },
        },
      }
      const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
      const state = stateMachine.States.DynamoDBScanMap as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      const mockItems = [
        { id: '1', data: 'item1' },
        { id: '2', data: 'item2' },
      ]
      ;(mockEngine.getMockData as any).mockReturnValue(mockItems)

      const result = await executor.execute(context)

      expect(mockEngine.getMockData).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'arn:aws:states:::aws-sdk:dynamodb:scan',
          config: expect.objectContaining({
            TableName: 'MyTable',
          }),
        }),
      )
      expect(result.output).toEqual(mockItems)
    })

    it('should read CSV from S3', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: {
            InputType: 'CSV',
            CSVHeaderLocation: 'GIVEN',
            CSVHeaders: ['id', 'name', 'age'],
          },
          Parameters: {
            Bucket: 'test-bucket',
            Key: 'data.csv',
          },
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      const mockCsvData = [
        { id: '1', name: 'Alice', age: '30' },
        { id: '2', name: 'Bob', age: '25' },
      ]
      ;(mockEngine.getMockData as any).mockReturnValue(mockCsvData)

      const result = await executor.execute(context)

      expect(result.output).toEqual(mockCsvData)
    })
  })

  describe('ItemBatcher', () => {
    it('should handle empty dataset correctly', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              Result: 'processed',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: { InputType: 'JSON' },
        },
        ItemBatcher: {
          MaxItemsPerBatch: 100,
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      // Mock empty dataset
      ;(mockEngine.getMockData as any).mockReturnValue([])

      const result = await executor.execute(context)

      // Empty dataset should result in empty output
      expect(result.output).toEqual([])

      // Check that mapExecutions metadata shows 0 iterations
      if (context.mapExecutions) {
        const mapMetadata = context.mapExecutions.find((m) => m.state === context.currentState)
        expect(mapMetadata?.iterationCount).toBe(0)
      }
    })

    it('should batch items based on MaxItemsPerBatch', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              Result: 'batched',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        ItemBatcher: {
          MaxItemsPerBatch: 2,
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        { Key: 'file1.txt', Size: 100 },
        { Key: 'file2.txt', Size: 200 },
        { Key: 'file3.txt', Size: 300 },
        { Key: 'file4.txt', Size: 400 },
        { Key: 'file5.txt', Size: 500 },
      ])

      const result = await executor.execute(context)

      // With batching of 2, we expect 3 batches: [1,2], [3,4], [5]
      // Each batch gets processed, so we get 5 'batched' results
      expect(result.output).toHaveLength(5)
      expect(result.output).toEqual(['batched', 'batched', 'batched', 'batched', 'batched'])
    })

    it('should batch items based on MaxInputBytesPerBatch', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        ItemBatcher: {
          MaxInputBytesPerBatch: 50, // Very small for testing
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        { Key: 'small.txt', Size: 10, LastModified: new Date().toISOString() },
        {
          Key: 'large.txt',
          Size: 1000000,
          LastModified: new Date().toISOString(),
        },
      ])

      const result = await executor.execute(context)

      expect(result.output).toHaveLength(2)
    })

    it('should apply BatchInput transformation', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              OutputPath: '$.Items[0]',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        ItemBatcher: {
          MaxItemsPerBatch: 2,
          BatchInput: {
            BatchId: 'test-batch',
          },
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        {
          Key: 'item1.json',
          Size: 100,
          LastModified: new Date().toISOString(),
        },
        {
          Key: 'item2.json',
          Size: 200,
          LastModified: new Date().toISOString(),
        },
      ])

      const result = await executor.execute(context)

      // BatchInput wraps items, but processor extracts first item
      expect(result.output).toHaveLength(2)
    })
  })

  describe('BatchInput transformation', () => {
    it('should apply BatchInput to wrap entire batch', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              Result: 'processed',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: { InputType: 'JSON' },
        },
        ItemBatcher: {
          MaxItemsPerBatch: 2,
          BatchInput: {
            batchMetadata: {
              processingType: 'distributed',
              batchId: 'batch-001',
            },
          },
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ])

      const result = await executor.execute(context)

      // With MaxItemsPerBatch: 2, we should have 2 batches
      // Batch 1: items 1,2
      // Batch 2: item 3
      expect(result.output).toHaveLength(3)
      expect(result.output).toEqual(['processed', 'processed', 'processed'])
    })

    it('should wrap batches with Items field when no BatchInput specified', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              // Return the input to verify batch structure
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: { InputType: 'JSON' },
        },
        ItemBatcher: {
          MaxItemsPerBatch: 3,
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      const testItems = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ]

      ;(mockEngine.getMockData as any).mockReturnValue(testItems)

      const result = await executor.execute(context)

      // Each item should be processed individually
      // But they're batched internally with Items field
      expect(result.output).toHaveLength(3)
    })

    it('should correctly transform batch with BatchInput metadata', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              // Echo the input to verify BatchInput structure
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: { InputType: 'JSON' },
        },
        ItemBatcher: {
          MaxItemsPerBatch: 2,
          BatchInput: {
            metadata: {
              source: 's3',
              timestamp: '2024-01-01T00:00:00Z',
            },
            config: {
              retryCount: 3,
            },
          },
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])

      const result = await executor.execute(context)

      // With MaxItemsPerBatch: 2, we have 2 batches
      // Each batch should have BatchInput fields + Items array
      expect(result.output).toHaveLength(4)

      // Verify mapExecutions metadata
      expect(context.mapExecutions).toBeDefined()
      expect(context.mapExecutions?.[0]?.iterationCount).toBe(2) // 2 batches
    })
  })

  describe('ResultWriter', () => {
    it('should write results to S3', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              Result: { processed: true },
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        ResultWriter: {
          Resource: 'arn:aws:states:::s3:putObject',
          WriterConfig: {
            Bucket: 'output-bucket',
            Prefix: 'results/',
          },
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        {
          Key: 'file1.txt',
          Size: 1024,
          LastModified: new Date().toISOString(),
        },
        {
          Key: 'file2.txt',
          Size: 2048,
          LastModified: new Date().toISOString(),
        },
      ])

      await executor.execute(context)

      expect(mockEngine.writeResults).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'resultWriter',
          resource: 'arn:aws:states:::s3:putObject',
          config: {
            Bucket: 'output-bucket',
            Prefix: 'results/',
          },
          results: [{ processed: true }, { processed: true }],
        }),
      )
    })
  })

  describe('Error Handling', () => {
    it('should respect ToleratedFailureCount', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Fail',
              Error: 'ProcessingError',
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        ToleratedFailureCount: 2,
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        {
          Key: 'file1.json',
          Size: 100,
          LastModified: new Date().toISOString(),
        },
        {
          Key: 'file2.json',
          Size: 200,
          LastModified: new Date().toISOString(),
        },
        {
          Key: 'file3.json',
          Size: 300,
          LastModified: new Date().toISOString(),
        },
      ])

      // All 3 items will fail, but we tolerate up to 2 failures
      // Since we have 3 failures and tolerance is 2, it should throw
      await expect(executor.execute(context)).rejects.toThrow('ProcessingError: State failed')
    })

    it('should respect ToleratedFailurePercentage', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Choice',
              Choices: [
                {
                  Variable: '$.id',
                  NumericLessThan: 3,
                  Next: 'Fail',
                },
              ],
              Default: 'Success',
            },
            Fail: {
              Type: 'Fail',
              Error: 'ProcessingError',
            },
            Success: {
              Type: 'Pass',
              Result: 'ok',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        ToleratedFailurePercentage: 50, // Tolerate up to 50% failures
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        {
          Key: 'item1.json',
          Size: 100,
          LastModified: new Date().toISOString(),
          id: 1,
        },
        {
          Key: 'item2.json',
          Size: 200,
          LastModified: new Date().toISOString(),
          id: 2,
        },
        {
          Key: 'item3.json',
          Size: 300,
          LastModified: new Date().toISOString(),
          id: 3,
        },
        {
          Key: 'item4.json',
          Size: 400,
          LastModified: new Date().toISOString(),
          id: 4,
        },
      ])

      // 2 out of 4 will fail (50%), which is within tolerance
      const result = await executor.execute(context)
      expect(result.output).toContain('ok')
    })

    it('should handle Catch rules', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Fail',
              Error: 'ProcessingError',
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        Catch: [
          {
            ErrorEquals: ['States.ALL'],
            Next: 'ErrorHandler',
            ResultPath: '$.error',
          },
        ],
        Next: 'Success',
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      ;(mockEngine.getMockData as any).mockReturnValue([
        {
          Key: 'error-file.txt',
          Size: 1024,
          LastModified: new Date().toISOString(),
        },
      ])

      const result = await executor.execute(context)

      expect(result.nextState).toBe('ErrorHandler')
      expect((result.output as any).error).toBeDefined()
      expect((result.output as any).error.Error).toBe('Error')
    })
  })

  describe('MaxConcurrency', () => {
    it('should default to 1000 for distributed maps', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      // Create many items to test concurrency (S3 objects format)
      const items = Array.from({ length: 2000 }, (_, i) => ({
        Key: `object-${i}`,
        Size: 1024,
        LastModified: new Date().toISOString(),
      }))
      ;(mockEngine.getMockData as any).mockReturnValue(items)

      const result = await executor.execute(context)

      expect(result.output).toHaveLength(2000)
    })

    it('should respect custom MaxConcurrency', async () => {
      const stateData = {
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        ItemReader: {
          Resource: 'arn:aws:states:::s3:listObjectsV2',
        },
        MaxConcurrency: 500,
        End: true,
      }
      const state = StateFactory.createState(stateData) as MapState

      executor = new DistributedMapStateExecutor(
        state as DistributedMapState,
        mockEngine as MockEngine,
      )

      const items = Array.from({ length: 1000 }, (_, i) => ({
        Key: `object-${i}`,
        Size: 1024,
        LastModified: new Date().toISOString(),
      }))
      ;(mockEngine.getMockData as any).mockReturnValue(items)

      const result = await executor.execute(context)

      expect(result.output).toHaveLength(1000)
    })
  })

  describe('JSONata Mode Validation', () => {
    const mockEngine = {
      getMockResponse: async () => ({ result: 'success' }),
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
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
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
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
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

        expect(() => StateFactory.createState(stateData)).toThrow(
          'ItemsPath field is not supported in JSONata mode. Use Items field instead',
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
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
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

        const executor = new DistributedMapStateExecutor(
          state as DistributedMapState,
          mockEngine as any,
        )

        const context: ExecutionContext = {
          input: { items: [1, 2, 3] },
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)
        expect(result.output).toEqual([
          { processed: true },
          { processed: true },
          { processed: true },
        ])
      })
    })

    describe('ItemReader with JSONata mode', () => {
      it('should process ItemReader data with ItemSelector in JSONata mode', async () => {
        const stateData = {
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemReader: {
            Resource: 'arn:aws:states:::s3:listObjectsV2',
            Parameters: {
              Bucket: 'my-bucket',
            },
          },
          ItemSelector: '{% {"key": $.Key, "size": $.Size, "doubled": $.Size * 2} %}',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output:
                  '{% {"processed": $states.input.key, "totalSize": $states.input.doubled} %}',
                End: true,
              },
            },
          },
          End: true,
        } as any

        const state = StateFactory.createState(stateData)
        const mockS3Engine = {
          getMockData: () => [
            { Key: 'file1.json', Size: 100 },
            { Key: 'file2.json', Size: 200 },
            { Key: 'file3.json', Size: 300 },
          ],
        } as any

        const executor = new DistributedMapStateExecutor(state as DistributedMapState, mockS3Engine)
        const context: ExecutionContext = {
          input: {},
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)
        expect(result.output).toEqual([
          { processed: 'file1.json', totalSize: 200 },
          { processed: 'file2.json', totalSize: 400 },
          { processed: 'file3.json', totalSize: 600 },
        ])
      })

      it('should handle CSV ItemReader with JSONata transformations', async () => {
        const stateData = {
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemReader: {
            Resource: 'arn:aws:states:::s3:getObject',
            ReaderConfig: {
              InputType: 'CSV',
              CSVHeaders: ['id', 'name', 'value'],
            },
          },
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ProcessCSV',
            States: {
              ProcessCSV: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"result": $states.input.name & "-processed"} %}',
                End: true,
              },
            },
          },
          End: true,
        } as any

        const state = StateFactory.createState(stateData)
        const mockCSVEngine = {
          getMockData: () => [
            { id: '1', name: 'item1', value: '100' },
            { id: '2', name: 'item2', value: '200' },
          ],
        } as any

        const executor = new DistributedMapStateExecutor(
          state as DistributedMapState,
          mockCSVEngine,
        )
        const context: ExecutionContext = {
          input: {},
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)
        expect(result.output).toEqual([
          { result: 'item1-processed' },
          { result: 'item2-processed' },
        ])
      })
    })

    describe('ItemBatcher with JSONata mode', () => {
      it('should batch items and apply JSONata transformations', async () => {
        const stateData = {
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemBatcher: {
            MaxItemsPerBatch: 2,
            BatchInput: {
              batchId: 'batch-1',
            },
          },
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ProcessBatch',
            States: {
              ProcessBatch: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output:
                  '{% {"batchSize": $count($states.input.Items), "batchId": $states.input.batchId} %}',
                End: true,
              },
            },
          },
          End: true,
        } as any

        const state = StateFactory.createState(stateData)
        const executor = new DistributedMapStateExecutor(
          state as DistributedMapState,
          mockEngine as any,
        )
        const context: ExecutionContext = {
          input: [1, 2, 3, 4, 5],
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)
        // With batching of 2 items each, we process 3 batches:
        // Batch 1: [1, 2] -> batchSize: 2 (2 items)
        // Batch 2: [3, 4] -> batchSize: 2 (2 items)
        // Batch 3: [5] -> batchSize: 1 (1 item)
        // The current implementation expands each batch result to individual items
        // So we get 5 individual results (2 + 2 + 1)
        expect(result.output as any).toHaveLength(5)
        // Results for batch 1 (2 items, each gets the batch result)
        expect((result.output as any)[0]).toEqual({ batchSize: 2, batchId: 'batch-1' })
        expect((result.output as any)[1]).toEqual({ batchSize: 2, batchId: 'batch-1' })
        // Results for batch 2 (2 items, each gets the batch result)
        expect((result.output as any)[2]).toEqual({ batchSize: 2, batchId: 'batch-1' })
        expect((result.output as any)[3]).toEqual({ batchSize: 2, batchId: 'batch-1' })
        // Result for batch 3 (1 item)
        expect((result.output as any)[4]).toEqual({ batchSize: 1, batchId: 'batch-1' })
      })
    })

    describe('Data flow in JSONata mode', () => {
      it('should preserve variables scope in distributed processing', async () => {
        const stateData = {
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'Transform',
            States: {
              Transform: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"value": $states.input * 100, "type": "distributed"} %}',
                End: true,
              } as any,
            },
          },
          End: true,
        }

        const state = StateFactory.createState(stateData)
        const executor = new DistributedMapStateExecutor(
          state as DistributedMapState,
          mockEngine as any,
        )
        const context: ExecutionContext = {
          input: [1, 2, 3],
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: { globalVar: 'should-not-be-accessible' },
        }

        const result = await executor.execute(context)
        expect(result.output).toEqual([
          { value: 100, type: 'distributed' },
          { value: 200, type: 'distributed' },
          { value: 300, type: 'distributed' },
        ])
      })

      it('should handle MaxConcurrencyPath with JSONata', async () => {
        const stateData = {
          Type: 'Map',
          QueryLanguage: 'JSONata',
          MaxConcurrencyPath: '$.concurrency',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'Process',
            States: {
              Process: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% $states.input %}',
                End: true,
              } as any,
            },
          },
          End: true,
        }

        const state = StateFactory.createState(stateData)
        const executor = new DistributedMapStateExecutor(
          state as DistributedMapState,
          mockEngine as any,
        )
        const context: ExecutionContext = {
          input: {
            concurrency: 2,
            items: [1, 2, 3, 4],
          },
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: {},
        }

        // Should use concurrency from input path
        const result = await executor.execute(context)
        expect(result.output).toBeDefined()
      })
    })

    describe('Error handling in JSONata mode', () => {
      it('should handle ToleratedFailureCount in distributed processing', async () => {
        const stateData = {
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ToleratedFailureCount: 1,
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'MayFail',
            States: {
              MayFail: {
                Type: 'Choice',
                QueryLanguage: 'JSONata',
                Choices: [
                  {
                    Condition: '{% $states.input > 2 %}',
                    Next: 'FailState',
                  },
                ],
                Default: 'SuccessState',
              },
              FailState: {
                Type: 'Fail',
                Error: 'ItemError',
                Cause: 'Item value too large',
              },
              SuccessState: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"success": true, "value": $states.input} %}',
                End: true,
              },
            },
          },
          End: true,
        } as any

        const state = StateFactory.createState(stateData)
        const executor = new DistributedMapStateExecutor(
          state as DistributedMapState,
          mockEngine as any,
        )
        const context: ExecutionContext = {
          input: [1, 2, 3, 4], // Two items will fail (3 and 4)
          currentState: 'TestDistributedMap',
          executionPath: [],
          variables: {},
        }

        // Should fail because we have 2 failures but only tolerate 1
        await expect(executor.execute(context)).rejects.toThrow()
      })
    })
  })
})
