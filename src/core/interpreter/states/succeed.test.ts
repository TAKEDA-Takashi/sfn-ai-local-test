import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../../types/state-factory'
import { SucceedStateExecutor } from './succeed'

describe('SucceedStateExecutor', () => {
  describe('Standard JSONPath mode', () => {
    it('should execute successfully with default output', async () => {
      const stateData = {
        Type: 'Succeed',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ test: 'data' })
      expect(result.executionPath).toEqual([])
    })

    it('should apply InputPath correctly', async () => {
      const stateData = {
        Type: 'Succeed',
        InputPath: '$.user',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: { user: { name: 'John' }, other: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ name: 'John' })
    })

    it('should apply OutputPath correctly', async () => {
      const stateData = {
        Type: 'Succeed',
        OutputPath: '$.result',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: { result: { status: 'complete' }, metadata: 'info' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ status: 'complete' })
    })

    it('should combine InputPath and OutputPath', async () => {
      const stateData = {
        Type: 'Succeed',
        InputPath: '$.data',
        OutputPath: '$.processed',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: {
          data: {
            processed: { value: 42 },
            raw: 'ignore',
          },
        },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ value: 42 })
    })
  })

  describe('JSONata mode', () => {
    it('should handle Output field in JSONata mode', async () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
        Output: { status: 'success', message: 'Workflow completed' },
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any)

      const context = {
        input: { userId: 'test-123' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ status: 'success', message: 'Workflow completed' })
    })

    it('should NOT evaluate JSONata expression without {% %} wrapper', async () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
        Output: '$states.input.userId & " processed"',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any)

      const context = {
        input: { userId: 'test-123' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      // Without {% %} wrapper, string should be returned as-is
      expect(result.output).toBe('$states.input.userId & " processed"')
    })

    it('should evaluate JSONata expression with {% %} wrapper', async () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
        Output: '{% $states.input.userId & " processed" %}',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any)

      const context = {
        input: { userId: 'test-123' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      // With {% %} wrapper, JSONata expression should be evaluated
      expect(result.output).toBe('test-123 processed')
    })

    it('should throw error when OutputPath is used in JSONata mode', () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
        OutputPath: '$.result',
      }
      // Should throw error during state creation
      expect(() => StateFactory.createState(stateData)).toThrow(
        'OutputPath field is not supported in JSONata mode. Use Output field instead',
      )
    })

    it('should work without Output field in JSONata mode', async () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should handle complex JSONata expressions with context', async () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
        Output:
          '{% { "processedBy": $states.context.StateMachine.Name, "input": $states.input } %}',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any)

      const context = {
        input: { value: 123 },
        currentState: 'SucceedState',
        executionPath: [],
        variables: {},
        // ExecutionContext に直接 StateMachine を設定
        StateMachine: {
          Name: 'MyWorkflow',
          Id: 'arn:aws:states:us-east-1:123456789012:stateMachine:MyWorkflow',
        },
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      // JSONata式が正しく評価されることを確認
      expect(result.output).toEqual({
        processedBy: 'MyWorkflow',
        input: { value: 123 },
      })
    })

    it('should handle object with embedded JSONata expressions in each field', async () => {
      const stateData = {
        Type: 'Succeed',
        QueryLanguage: 'JSONata',
        Output: {
          status: '{% $states.input.completed ? "success" : "pending" %}',
          processedCount: '{% $count($states.input.items) %}',
          totalAmount: '{% $sum($states.input.items.price) %}',
          message: 'Static message',
          timestamp: '{% $now() %}',
        },
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any)

      const context = {
        input: {
          completed: true,
          items: [
            { id: 1, price: 100 },
            { id: 2, price: 200 },
            { id: 3, price: 300 },
          ],
        },
        currentState: 'SucceedState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      // オブジェクトの各フィールドのJSONata式が評価されることを確認
      expect(result.output).toMatchObject({
        status: 'success',
        processedCount: 3,
        totalAmount: 600,
        message: 'Static message', // 静的な文字列はそのまま
      })
      // timestampは動的な値なので、存在確認のみ
      expect(result.output).toHaveProperty('timestamp')
    })
  })

  describe('Edge cases', () => {
    it('should handle null input', async () => {
      const stateData = {
        Type: 'Succeed',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: null,
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toBeNull()
    })

    it('should handle undefined input', async () => {
      const stateData = {
        Type: 'Succeed',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: undefined,
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toBeUndefined()
    })

    it('should handle empty object input', async () => {
      const stateData = {
        Type: 'Succeed',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: {},
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({})
    })

    it('should handle InputPath that returns null', async () => {
      const stateData = {
        Type: 'Succeed',
        InputPath: '$.nonexistent',
      }
      const state = StateFactory.createState(stateData)
      const executor = new SucceedStateExecutor(state as any, {} as any)

      const context = {
        input: { existing: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toBeNull()
    })
  })
})
