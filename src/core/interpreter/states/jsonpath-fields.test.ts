import { describe, expect, it } from 'vitest'
import type { PassState, TaskState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { PassStateExecutor } from './pass'
import { TaskStateExecutor } from './task'

describe('JSONPath Fields Support', () => {
  describe('InputPath', () => {
    it('should filter input with InputPath', async () => {
      const stateData = {
        Type: 'Pass' as const,
        InputPath: '$.data',
        Result: 'processed',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { data: { value: 'test' }, other: 'ignored' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      // InputPath should filter to only $.data
      expect(result.output).toEqual('processed')
    })

    it('should handle null InputPath (discard input)', async () => {
      const stateData = {
        Type: 'Pass' as const,
        InputPath: null,
        Result: { fixed: 'output' },
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { data: 'original' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({ fixed: 'output' })
    })
  })

  describe('Parameters', () => {
    it('should transform input with Parameters', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Parameters: {
          'transformed.$': '$.value',
          'doubled.$': 'States.MathAdd($.value, $.value)',
          fixed: 'constant',
        },
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { value: 5 },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({
        transformed: 5,
        doubled: 10,
        fixed: 'constant',
      })
    })

    it('should handle nested Parameters', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Parameters: {
          user: {
            'name.$': '$.name',
            'age.$': '$.age',
          },
        },
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { name: 'John', age: 30, extra: 'ignored' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({
        user: { name: 'John', age: 30 },
      })
    })
  })

  describe('ResultSelector', () => {
    it('should transform task result with ResultSelector', async () => {
      // This test requires a mock engine
      const mockEngine = {
        getMockResponse: async () => ({
          statusCode: 200,
          body: { data: 'response' },
          headers: { 'content-type': 'application/json' },
        }),
      }

      const state = StateFactory.createState({
        Type: 'Task' as const,
        Resource: 'arn:aws:lambda:::function:test',
        ResultSelector: {
          'status.$': '$.statusCode',
          'data.$': '$.body.data',
        },
        End: true,
      }) as TaskState

      const executor = new TaskStateExecutor(state, mockEngine as any)
      const result = await executor.execute({
        input: {},
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({
        status: 200,
        data: 'response',
      })
    })
  })

  describe('ResultPath', () => {
    it('should place result at specified path', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Result: { computed: 'value' },
        ResultPath: '$.result',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { original: 'data' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({
        original: 'data',
        result: { computed: 'value' },
      })
    })

    it('should replace input with null ResultPath', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Result: { computed: 'value' },
        ResultPath: null,
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { original: 'data' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      // null ResultPath should discard the result and pass through original input
      expect(result.output).toEqual({ original: 'data' })
    })

    it('should handle $ ResultPath (replace entire input)', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Result: { new: 'output' },
        ResultPath: '$',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: { original: 'data' },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({ new: 'output' })
    })
  })

  describe('OutputPath', () => {
    it('should filter output with OutputPath', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Result: {
          needed: 'data',
          extra: 'ignored',
        },
        OutputPath: '$.needed',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: {},
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual('data')
    })

    it('should handle null OutputPath (discard output)', async () => {
      const stateData = {
        Type: 'Pass' as const,
        Result: { data: 'value' },
        OutputPath: null,
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: {},
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual(null)
    })
  })

  describe('Field Processing Order', () => {
    it('should apply fields in correct order: InputPath -> Parameters -> ResultSelector -> ResultPath -> OutputPath', async () => {
      const stateData = {
        Type: 'Pass' as const,
        InputPath: '$.data',
        Parameters: {
          'transformed.$': '$.value',
        },
        Result: { intermediate: 'result' },
        ResultPath: '$.result',
        OutputPath: '$.result',
        End: true,
      }

      const state = StateFactory.createState(stateData)
      const executor = new PassStateExecutor(state as PassState)
      const result = await executor.execute({
        input: {
          data: { value: 'test' },
          other: 'ignored',
        },
        currentState: 'TestState',
        executionPath: [],
        variables: {},
      })

      expect(result.output).toEqual({ intermediate: 'result' })
    })
  })
})
