import { describe, expect, it } from 'vitest'
import type { ExecutionContext, TaskState } from '../../../types/asl'
import { StateFactory } from '../../../types/asl'
import { TaskStateExecutor } from './task'

describe('Task State JSONata Mode Validation', () => {
  const mockEngine = {
    getMockResponse: async () => ({ result: 'success' }),
  } as any

  describe('Parameters field restriction', () => {
    it('should reject Parameters field in JSONata mode', () => {
      // Should throw error during state creation
      expect(() =>
        StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          QueryLanguage: 'JSONata',
          Parameters: {
            FunctionName: 'test',
            Payload: { test: 'data' },
          },
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should accept Parameters field in JSONPath mode', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:lambda:region:account:function:name',
        Parameters: {
          FunctionName: 'test',
          Payload: { test: 'data' },
        },
        End: true,
      }) as TaskState

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'input' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual({ result: 'success' })
    })
  })

  describe('Arguments field requirement', () => {
    it('should require Arguments field for AWS service integrations in JSONata mode', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          QueryLanguage: 'JSONata',
          End: true,
        }),
      ).toThrow('Arguments field is required for resource ARN: arn:aws:states:::lambda:invoke')
    })

    it('should accept Arguments field in JSONata mode', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Arguments: {
          FunctionName: 'test',
          Payload: '{% $states.input %}',
        },
        End: true,
      }) as TaskState

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'input' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual({ result: 'success' })
    })

    it('should not require Arguments for direct Lambda ARN in JSONata mode', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:lambda:region:account:function:name',
        QueryLanguage: 'JSONata',
        End: true,
      }) as TaskState

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'input' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual({ result: 'success' })
    })
  })

  describe('Mixed mode validation', () => {
    it('should handle Arguments with JSONata expressions correctly', async () => {
      const mockEngineWithValidation = {
        getMockResponse: (_state: string, input: unknown) => {
          // Verify Arguments transformation worked
          expect(input).toEqual({
            FunctionName: 'test-function',
            Payload: {
              doubled: 20,
              original: 10,
            },
          })
          return Promise.resolve({ Payload: { success: true } })
        },
      } as any

      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Arguments: {
          FunctionName: 'test-function',
          Payload: '{% {"doubled": $states.input.value * 2, "original": $states.input.value} %}',
        },
        Output: '{% $states.result.Payload %}' as any,
        End: true,
      }) as TaskState

      const executor = new TaskStateExecutor(state, mockEngineWithValidation)
      const context: ExecutionContext = {
        input: { value: 10 },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual({ success: true })
    })
  })
})
