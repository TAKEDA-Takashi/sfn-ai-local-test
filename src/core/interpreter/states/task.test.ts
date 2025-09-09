import { beforeEach, describe, expect, it } from 'vitest'
import type { ExecutionContext, TaskState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { TaskStateExecutor } from './task'

describe('TaskStateExecutor', () => {
  let mockEngine: MockEngine

  beforeEach(() => {
    const mockConfig = {
      version: '1.0',
      name: 'test-mock',
      mocks: [],
    }
    mockEngine = new MockEngine(mockConfig)
  })

  describe('Lambda Integration', () => {
    describe('Optimized Lambda Integration (arn:aws:states:::lambda:invoke)', () => {
      it('should preserve Payload wrapping without ResultSelector', async () => {
        const state = StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'TestFunction',
            Payload: { input: 'test' },
          },
          ResultPath: '$.lambdaResult',
        }) as TaskState

        const mockResponse = {
          Payload: {
            statusCode: 200,
            body: 'success',
          },
          StatusCode: 200,
        }

        mockEngine.setMockOverrides([
          {
            state: 'TestState',
            type: 'fixed',
            response: mockResponse,
          },
        ])

        const executor = new TaskStateExecutor(state, mockEngine)
        const context: ExecutionContext = {
          input: { originalData: 'data' },
          currentState: 'TestState',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)

        // Lambda統合では、Payloadラッピングが保持されるべき
        expect(result.output).toEqual({
          originalData: 'data',
          lambdaResult: {
            Payload: {
              statusCode: 200,
              body: 'success',
            },
            StatusCode: 200,
          },
        })
      })

      it('should apply ResultSelector correctly for Lambda integration', async () => {
        const state = StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'TestFunction',
            Payload: { input: 'test' },
          },
          ResultSelector: {
            'extractedData.$': '$.Payload.body',
            'status.$': '$.StatusCode',
          },
          ResultPath: '$.lambdaResult',
        }) as TaskState

        const mockResponse = {
          Payload: {
            statusCode: 200,
            body: 'success data',
          },
          StatusCode: 200,
        }

        mockEngine.setMockOverrides([
          {
            state: 'TestState',
            type: 'fixed',
            response: mockResponse,
          },
        ])

        const executor = new TaskStateExecutor(state, mockEngine)
        const context: ExecutionContext = {
          input: { originalData: 'data' },
          currentState: 'TestState',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)

        // ResultSelectorが適用され、Payloadの中身が抽出される
        expect(result.output).toEqual({
          originalData: 'data',
          lambdaResult: {
            extractedData: 'success data',
            status: 200,
          },
        })
      })

      it('should handle ResultSelector with .$ suffix correctly', async () => {
        const state = StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'TestFunction',
            Payload: { input: 'test' },
          },
          ResultSelector: {
            'data.$': '$.Payload.items[0]',
            'count.$': '$.Payload.itemCount',
          },
          ResultPath: '$',
        }) as TaskState

        const mockResponse = {
          Payload: {
            items: ['first', 'second', 'third'],
            itemCount: 3,
          },
          StatusCode: 200,
        }

        mockEngine.setMockOverrides([
          {
            state: 'TestState',
            type: 'fixed',
            response: mockResponse,
          },
        ])

        const executor = new TaskStateExecutor(state, mockEngine)
        const context: ExecutionContext = {
          input: { originalData: 'data' },
          currentState: 'TestState',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)

        expect(result.output).toEqual({
          data: 'first',
          count: 3,
        })
      })
    })

    describe('Direct Lambda ARN', () => {
      it('should not wrap result in Payload for direct Lambda ARN', async () => {
        const state = StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
          ResultPath: '$.lambdaResult',
        }) as TaskState

        const mockResponse = {
          statusCode: 200,
          body: 'direct response',
        }

        mockEngine.setMockOverrides([
          {
            state: 'TestState',
            type: 'fixed',
            response: mockResponse,
          },
        ])

        const executor = new TaskStateExecutor(state, mockEngine)
        const context: ExecutionContext = {
          input: { originalData: 'data' },
          currentState: 'TestState',
          executionPath: [],
          variables: {},
        }

        const result = await executor.execute(context)

        // 直接ARNではPayloadラッピングなし
        expect(result.output).toEqual({
          originalData: 'data',
          lambdaResult: {
            statusCode: 200,
            body: 'direct response',
          },
        })
      })
    })
  })

  describe('Other AWS Service Integrations', () => {
    it('should handle DynamoDB GetItem integration', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::dynamodb:getItem',
        Parameters: {
          TableName: 'MyTable',
          Key: {
            id: { S: 'test-id' },
          },
        },
        ResultPath: '$.dbResult',
      }) as TaskState

      const mockResponse = {
        Item: {
          id: { S: 'test-id' },
          name: { S: 'Test Item' },
        },
      }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { requestId: '123' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      expect(result.output).toEqual({
        requestId: '123',
        dbResult: {
          Item: {
            id: { S: 'test-id' },
            name: { S: 'Test Item' },
          },
        },
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle task failures with Catch', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: 'TestFunction',
        },
        Catch: [
          {
            ErrorEquals: ['States.TaskFailed'],
            Next: 'ErrorHandler',
            ResultPath: '$.error',
          },
        ],
      }) as TaskState

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'error',
          error: {
            type: 'States.TaskFailed',
            cause: 'Function execution failed',
          },
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { data: 'test' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      expect(result.nextState).toBe('ErrorHandler')
      expect(result.output).toEqual({
        data: 'test',
        error: {
          Error: 'States.TaskFailed',
          Cause: 'Function execution failed',
        },
      })
    })

    it('should retry task on failure', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: 'TestFunction',
        },
        Retry: [
          {
            ErrorEquals: ['States.TaskFailed'],
            MaxAttempts: 2,
            IntervalSeconds: 1,
          },
        ],
      }) as TaskState

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'stateful',
          responses: [
            { error: { type: 'States.TaskFailed', cause: 'First failure' } },
            { Payload: { success: true }, StatusCode: 200 },
          ],
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { data: 'test' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // 2回目で成功 - Lambda統合なのでPayloadラッピングが保持される
      expect(result.output).toEqual({
        Payload: { success: true },
        StatusCode: 200,
      })
    })
  })

  describe('Parameters Processing', () => {
    it('should process Parameters with JSONPath', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: 'TestFunction',
          'Payload.$': '$',
          StaticValue: 'static',
          'ExtractedValue.$': '$.userId',
        },
        ResultPath: '$.result',
      }) as TaskState

      const mockResponse = {
        Payload: { processed: true },
        StatusCode: 200,
      }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { userId: 'user-123', data: 'test' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      // Parameters処理の検証のため、executeTask内部での呼び出しを確認
      const result = await executor.execute(context)

      expect(result.output).toEqual({
        userId: 'user-123',
        data: 'test',
        result: mockResponse,
      })
    })
  })

  describe('JSONata Support', () => {
    it('should process Task state Output field with $states.result.Payload', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Arguments: {
          FunctionName: 'TestFunction',
          Payload: {
            value: '{% $states.input.value %}',
          },
        },
        Output: '{% $states.result.Payload %}' as any,
        End: true,
      }) as TaskState

      const mockResponse = {
        Payload: {
          processedValue: 1500,
          status: 'success',
        },
        StatusCode: 200,
      }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { value: 1500 },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Output field should extract only the Payload content
      expect(result.output).toEqual({
        processedValue: 1500,
        status: 'success',
      })
      expect(result.output).not.toHaveProperty('StatusCode')
    })

    it('should process Arguments field with JSONata expressions', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Arguments: {
          FunctionName: 'TestFunction',
          Payload: {
            fullName: '{% $states.input.firstName & " " & $states.input.lastName %}',
            age: '{% $number($states.input.age) %}',
            isAdult: '{% $number($states.input.age) >= 18 %}',
          },
        },
        Output: '{% $states.result.Payload %}' as any,
        End: true,
      }) as TaskState

      const mockResponse = {
        Payload: {
          processed: true,
          fullName: 'John Doe',
          age: 25,
          isAdult: true,
        },
        StatusCode: 200,
      }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { firstName: 'John', lastName: 'Doe', age: '25' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Output field extracts Payload
      expect(result.output).toEqual({
        processed: true,
        fullName: 'John Doe',
        age: 25,
        isAdult: true,
      })
    })

    it('should process Task state with JSONata Arguments correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Arguments: {
          FunctionName: 'ProcessDataFunction',
          Payload: '{% $states.input %}',
        },
        End: true,
      }) as TaskState

      const mockResponse = {
        Payload: { success: true },
        StatusCode: 200,
      }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { data: 'test-data' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Without Output field, result is returned as-is
      expect(result.output).toEqual({
        Payload: { success: true },
        StatusCode: 200,
      })
    })
  })

  describe('ResultPath variations', () => {
    it('should handle ResultPath null (discard result)', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
        ResultPath: null as any,
      }) as TaskState

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: { result: 'ignored' },
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { originalData: 'preserved' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      expect(result.output).toEqual({ originalData: 'preserved' })
    })

    it('should handle ResultPath $ (replace entire input)', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
        ResultPath: '$',
      }) as TaskState

      const mockResponse = { newData: 'replaced' }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { originalData: 'discarded' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      expect(result.output).toEqual({ newData: 'replaced' })
    })

    it('should handle nested ResultPath', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
        ResultPath: '$.deeply.nested.result',
      }) as TaskState

      const mockResponse = { data: 'nested' }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { existing: 'data' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      expect(result.output).toEqual({
        existing: 'data',
        deeply: {
          nested: {
            result: { data: 'nested' },
          },
        },
      })
    })
  })

  describe('Lambda Integration with JSONata Output', () => {
    it('should process JSONata Output field to extract Payload from Lambda invoke response', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Arguments: {
          FunctionName: 'TestFunction',
          Payload: {
            userId: '{% $states.input.userId %}',
            action: '{% $states.input.action %}',
          },
        },
        Output: '{% $states.result.Payload %}',
        Next: 'NextState',
      }) as TaskState

      // Mock returns what Lambda invoke actually returns (WITH Payload wrapping)
      const mockResponse = {
        ExecutedVersion: '$LATEST',
        Payload: {
          processedData: 'test-result',
          status: 'success',
          code: 200,
        },
        StatusCode: 200,
      }

      mockEngine.setMockOverrides([
        {
          state: 'TestState',
          type: 'fixed',
          response: mockResponse,
        },
      ])

      const executor = new TaskStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: {
          userId: 'user123',
          action: 'process',
        },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // The Output field should extract only the Payload content
      expect(result.output).toEqual({
        processedData: 'test-result',
        status: 'success',
        code: 200,
      })
    })
  })
})
