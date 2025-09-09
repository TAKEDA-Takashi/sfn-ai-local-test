import { describe, expect, it } from 'vitest'
import type { ItemProcessor } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { ItemProcessorRunner } from './item-processor-runner'

describe('ItemProcessorRunner', () => {
  describe('execute', () => {
    it('should execute a simple Pass state ItemProcessor', async () => {
      const itemProcessorDefinition = {
        StartAt: 'ProcessItem',
        States: {
          ProcessItem: {
            Type: 'Pass',
            Result: 'processed',
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const result = await runner.execute({ value: 'test' })

      expect(result.success).toBe(true)
      expect(result.output).toBe('processed')
      expect(result.executionPath).toEqual(['ProcessItem'])
    })

    it('should execute ItemProcessor with multiple states', async () => {
      const itemProcessorDefinition = {
        StartAt: 'ValidateItem',
        States: {
          ValidateItem: {
            Type: 'Pass',
            Next: 'TransformItem',
          },
          TransformItem: {
            Type: 'Pass',
            Result: 'transformed',
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const result = await runner.execute({ id: 1 })

      expect(result.success).toBe(true)
      expect(result.output).toBe('transformed')
      expect(result.executionPath).toEqual(['ValidateItem', 'TransformItem'])
    })

    it('should handle ItemProcessor with Parameters', async () => {
      const itemProcessorDefinition = {
        StartAt: 'EnrichItem',
        States: {
          EnrichItem: {
            Type: 'Pass',
            Parameters: {
              'original.$': '$',
              processed: true,
              'timestamp.$': '$$.State.EnteredTime',
            },
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const input = { id: 1, name: 'item1' }
      const result = await runner.execute(input)

      expect(result.success).toBe(true)
      expect(result.output).toMatchObject({
        original: input,
        processed: true,
      })
    })

    it('should handle ItemProcessor failure', async () => {
      const itemProcessorDefinition = {
        StartAt: 'FailingState',
        States: {
          FailingState: {
            Type: 'Fail',
            Error: 'ProcessingError',
            Cause: 'Item processing failed',
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const result = await runner.execute({ id: 1 })

      expect(result.success).toBe(false)
      expect(result.error).toBe('ProcessingError: Item processing failed')
      expect(result.executionPath).toEqual(['FailingState'])
    })

    it('should preserve execution context for nested states', async () => {
      const itemProcessorDefinition = {
        StartAt: 'FirstState',
        States: {
          FirstState: {
            Type: 'Pass',
            Parameters: {
              value: 'first',
            },
            Next: 'SecondState',
          },
          SecondState: {
            Type: 'Pass',
            InputPath: '$.value',
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const result = await runner.execute({ input: 'test' })

      expect(result.success).toBe(true)
      expect(result.output).toBe('first')
    })

    it('should work with mock engine', async () => {
      const itemProcessorDefinition = {
        StartAt: 'CallService',
        States: {
          CallService: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const mockEngine = {
        getMockResponse: (_state: unknown, input: unknown) => {
          return Promise.resolve({ processedBy: 'mock', input })
        },
      } as any

      const runner = new ItemProcessorRunner(itemProcessor, mockEngine)
      const result = await runner.execute({ id: 1 })

      expect(result.success).toBe(true)
      expect(result.output).toMatchObject({
        processedBy: 'mock',
        input: { id: 1 },
      })
    })
  })

  describe('executeWithContext', () => {
    it('should preserve variables context for INLINE mode', async () => {
      const itemProcessorDefinition = {
        StartAt: 'ProcessItem',
        States: {
          ProcessItem: {
            Type: 'Pass',
            Result: 'processed',
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const context = {
        input: { value: 'test' },
        variables: { counter: 1 },
        originalInput: { value: 'test' },
      }

      const result = await runner.executeWithContext(context)

      expect(result.success).toBe(true)
      expect(result.variables).toBeDefined()
      expect(result.variables?.counter).toBe(1)
    })

    it('should have isolated variables for DISTRIBUTED mode', async () => {
      const itemProcessorDefinition = {
        StartAt: 'ProcessItem',
        States: {
          ProcessItem: {
            Type: 'Pass',
            Result: 'processed',
            End: true,
          },
        },
      }
      const itemProcessor = StateFactory.createStateMachine(
        itemProcessorDefinition,
      ) as ItemProcessor

      const runner = new ItemProcessorRunner(itemProcessor)
      const context = {
        input: { value: 'test' },
        variables: undefined, // No variables for distributed mode
        originalInput: { value: 'test' },
      }

      const result = await runner.executeWithContext(context)

      expect(result.success).toBe(true)
      expect(result.variables).toEqual({})
    })
  })
})
