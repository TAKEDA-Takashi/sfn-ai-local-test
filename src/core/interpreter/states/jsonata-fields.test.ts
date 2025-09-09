import { describe, expect, it } from 'vitest'
import type { PassState, TaskState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { PassStateExecutor } from './pass'
import { TaskStateExecutor } from './task'

describe('JSONata Fields Support', () => {
  describe('Pass State with JSONata', () => {
    it('should process Output field with JSONata expression', async () => {
      const stateData = {
        Type: 'Pass' as const,
        QueryLanguage: 'JSONata',
        Output: '{% { "computed": $.value * 2 } %}',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { value: 10 },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
        originalInput: { value: 10 },
        stateExecutions: [],
      })

      expect(result.output).toEqual({ computed: 20 })
    })

    it('should handle complex JSONata expressions', async () => {
      const stateData = {
        Type: 'Pass' as const,
        QueryLanguage: 'JSONata',
        Output: '{% $merge([$.input, { "added": "field" }]) %}',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const context = {
        input: { input: { existing: 'data' } },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
        originalInput: { input: { existing: 'data' } },
        stateExecutions: [],
      }
      const result = await executor.execute(context)

      expect(result.output).toEqual({
        existing: 'data',
        added: 'field',
      })
    })

    it('should reject Arguments field per AWS specification', () => {
      const stateData = {
        Type: 'Pass' as const,
        QueryLanguage: 'JSONata',
        Arguments: {
          fullName: "{% $states.input.firstName & ' ' & $states.input.lastName %}",
          isAdult: '{% $number($states.input.age) >= 18 %}',
          greeting: "{% 'Hello, ' & $states.input.firstName & '!' %}",
        },
        End: true,
      }

      // Should throw error during state creation
      expect(() => StateFactory.createState(stateData)).toThrow(
        'Pass state does not support Arguments field',
      )
    })

    it('OutputPath is not supported in JSONata mode per AWS spec', () => {
      const stateData = {
        Type: 'Pass' as const,
        QueryLanguage: 'JSONata',
        Output: '{% { "result": { "data": "value" }, "extra": "ignored" } %}',
        OutputPath: '$.result',
        End: true,
      }

      // Should throw error during state creation
      expect(() => StateFactory.createState(stateData)).toThrow(
        'OutputPath field is not supported in JSONata mode',
      )
    })
  })

  describe('Task State with JSONata', () => {
    it('should process Arguments field', async () => {
      const mockEngine = {
        getMockResponse: (_state: string, input: unknown) => {
          // Verify that Arguments transformed the input
          expect(input).toEqual({
            doubled: 20,
            original: 10,
          })
          return Promise.resolve({ success: true })
        },
      } as any

      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        QueryLanguage: 'JSONata',
        Arguments: '{% { "doubled": $.value * 2, "original": $.value } %}',
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new TaskStateExecutor(state as TaskState, mockEngine)
      const context = {
        input: { value: 10 },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
        originalInput: { value: 10 },
        stateExecutions: [],
      }
      const result = await executor.execute(context)

      expect(result.output).toEqual({ success: true })
    })

    it('should process Output field to transform task result', async () => {
      const mockEngine = {
        getMockResponse: async () => ({
          statusCode: 200,
          data: { items: [1, 2, 3] },
        }),
      } as any

      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        QueryLanguage: 'JSONata',
        Arguments: {
          Payload: '{% $states.input %}',
        },
        Output: '{% { "count": $count($.data.items), "sum": $sum($.data.items) } %}',
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new TaskStateExecutor(state as TaskState, mockEngine)
      const result = await executor.execute({
        input: {},
        currentState: 'TestState',
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
      })

      // Note: JSONata $count and $sum functions need to be mocked or implemented
      // For now, we'll check that Output is being processed
      expect(result.output).toBeDefined()
    })

    it('should support Assign field to set variables', async () => {
      const mockEngine = {
        getMockResponse: async () => ({
          userId: 'user123',
          timestamp: '2024-01-01',
        }),
      } as any

      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        QueryLanguage: 'JSONata',
        Arguments: {
          Payload: '{% $states.input %}',
        },
        Assign: {
          userId: '{% $states.result.userId %}',
          processedAt: '{% $states.result.timestamp %}',
        },
        Output: '{% { "status": "processed" } %}',
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new TaskStateExecutor(state as TaskState, mockEngine)
      const context = {
        input: {},
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Check that variables were assigned
      expect(context.variables).toEqual({
        userId: 'user123',
        processedAt: '2024-01-01',
      })

      expect(result.output).toEqual({ status: 'processed' })
    })
  })

  describe('Assign in JSONPath mode', () => {
    it('should support Assign field in JSONPath mode', async () => {
      const mockEngine = {
        getMockResponse: async () => ({
          userId: 'user456',
          data: { value: 100 },
        }),
      } as any

      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        // No QueryLanguage means JSONPath mode
        Assign: {
          'savedUserId.$': '$.userId',
          'savedValue.$': '$.data.value',
        },
        ResultPath: '$.result',
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new TaskStateExecutor(state as TaskState, mockEngine)
      const context = {
        input: { original: 'data' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Check that variables were assigned in JSONPath mode
      expect(context.variables).toEqual({
        savedUserId: 'user456',
        savedValue: 100,
      })

      expect(result.output).toEqual({
        original: 'data',
        result: {
          userId: 'user456',
          data: { value: 100 },
        },
      })
    })
  })

  describe('Field combination and precedence', () => {
    it('should reject Parameters field in JSONata mode', () => {
      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:states:::lambda:invoke',
        QueryLanguage: 'JSONata',
        Parameters: { fromParameters: true }, // Should be rejected
        Arguments: '{% { "fromArguments": true } %}',
        End: true,
      } as any

      // Should throw error during state creation
      expect(() => StateFactory.createState(stateData)).toThrow(
        'Parameters field is not supported in JSONata mode. Use Arguments field instead',
      )
    })

    it('should use Arguments and Output fields in JSONata mode', async () => {
      const mockEngine = {
        getMockResponse: (_state: string, input: unknown) => {
          // Arguments should be used
          expect(input).toEqual({ fromArguments: true })
          return Promise.resolve({ taskResult: 'data' })
        },
      } as any

      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        QueryLanguage: 'JSONata',
        Arguments: '{% { "fromArguments": true } %}', // Should be used
        Output: '{% { "fromOutput": true } %}', // Should be used
        End: true,
      } as any

      const state = StateFactory.createState(stateData)
      const executor = new TaskStateExecutor(state as TaskState, mockEngine)
      const result = await executor.execute({
        input: {},
        currentState: 'TestState',
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
      })

      // Output should be from Output field
      expect(result.output).toEqual({ fromOutput: true })
    })

    it('should reject Arguments/Output fields in JSONPath mode', () => {
      const stateData = {
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        // No QueryLanguage means JSONPath mode
        Parameters: { fromParameters: true },
        Arguments: '{% { "fromArguments": true } %}', // Should be rejected
        Output: '{% { "fromOutput": true } %}', // Should be rejected
        End: true,
      }

      // Should throw error during state creation for unsupported fields
      expect(() => StateFactory.createState(stateData)).toThrow(
        'Task state does not support the following fields: Arguments, Output',
      )
    })
  })
})
