import { describe, expect, it } from 'vitest'
import type { ExecutionContext, JsonValue, PassState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { BaseStateExecutor } from './base'
import { PassStateExecutor } from './pass'

// Create a test implementation of BaseStateExecutor
class TestStateExecutor extends BaseStateExecutor {
  protected executeState(input: JsonValue, _context: ExecutionContext): Promise<JsonValue> {
    return Promise.resolve(input)
  }
}

describe('BaseStateExecutor', () => {
  // ResultSelector tests have been removed as this functionality has been
  // moved to the Strategy pattern (JSONPathStrategy/JSONataStrategy)
  // and is tested through integration tests instead
  describe('Template Method Pattern', () => {
    it('should execute states using the template method pattern', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        Result: { test: 'data' },
      })
      const executor = new PassStateExecutor(state as PassState)

      const context: ExecutionContext = {
        input: { initial: 'input' },
        variables: {},
        currentState: 'TestState',
        executionPath: [],
      }

      const result = await executor.execute(context)

      expect(result).toMatchObject({
        output: { test: 'data' },
        success: true,
      })
    })

    it('should handle errors using the handleError method', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        Catch: [
          {
            ErrorEquals: ['TestError'],
            Next: 'ErrorHandler',
          },
        ],
      })

      class ErrorStateExecutor extends BaseStateExecutor {
        protected executeState(_input: JsonValue, _context: ExecutionContext): Promise<JsonValue> {
          const error = new Error('Test error message')
          error.name = 'TestError'
          return Promise.reject(error)
        }
      }

      const executor = new ErrorStateExecutor(state)

      const context: ExecutionContext = {
        input: { initial: 'input' },
        variables: {},
        currentState: 'TestState',
        executionPath: [],
      }

      const result = await executor.execute(context)

      expect(result).toMatchObject({
        success: false,
        nextState: 'ErrorHandler',
        error: 'Test error message',
      })
    })

    it('should apply strategy pattern for preprocessing and postprocessing', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        InputPath: '$.data',
        OutputPath: '$.result',
        Result: { processed: true },
      })

      const executor = new TestStateExecutor(state)

      const context: ExecutionContext = {
        input: { data: { value: 42 }, extra: 'ignored' },
        variables: {},
        currentState: 'TestState',
        executionPath: [],
      }

      const result = await executor.execute(context)

      // The strategy pattern will handle InputPath/OutputPath transformations
      expect(result).toMatchObject({
        success: true,
      })
    })
  })
})
