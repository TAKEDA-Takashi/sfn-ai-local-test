import { describe, expect, it } from 'vitest'
import type { FailState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { FailStateExecutor } from './fail'

describe('FailStateExecutor', () => {
  describe('Standard JSONPath mode', () => {
    it('should return failure result with default message and type', async () => {
      const stateData = {
        Type: 'Fail',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('States.Failed: State failed')
      expect(result.output).toEqual({ test: 'data' })
      expect(result.executionPath).toEqual([])
    })

    it('should return failure result with custom message and type', async () => {
      const stateData = {
        Type: 'Fail',
        Cause: 'Custom error message',
        Error: 'CustomError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('CustomError: Custom error message')
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should apply InputPath before failing', async () => {
      const stateData = {
        Type: 'Fail',
        InputPath: '$.errorInfo',
        Cause: 'Processing failed',
        Error: 'ProcessingError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: {
          errorInfo: { details: 'specific error' },
          otherData: 'ignored',
        },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('ProcessingError: Processing failed')
      expect(result.output).toEqual({ details: 'specific error' })
    })

    it('should handle null input gracefully', async () => {
      const stateData = {
        Type: 'Fail',
        Cause: 'Null input error',
        Error: 'NullInputError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: null,
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('NullInputError: Null input error')
      expect(result.output).toBe(null)
    })

    it('should handle undefined cause and error', async () => {
      const stateData = {
        Type: 'Fail',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('States.Failed: State failed')
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should handle empty string cause and error', async () => {
      const stateData = {
        Type: 'Fail',
        Cause: '',
        Error: '',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('States.Failed: ')
      expect(result.output).toEqual({ test: 'data' })
    })
  })

  describe('JSONata mode', () => {
    it('should handle JSONata expressions in Cause', async () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        Cause: 'Simple error message',
        Error: 'DynamicError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { errorMessage: 'Dynamic failure' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('DynamicError: Simple error message')
      expect(result.output).toEqual({ errorMessage: 'Dynamic failure' })
    })

    it('should handle Error field in JSONata mode', async () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        Cause: 'Test error',
        Error: 'CustomDynamicError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { errorType: 'CustomDynamicError' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('CustomDynamicError: Test error')
      expect(result.output).toEqual({ errorType: 'CustomDynamicError' })
    })

    it('should use literal strings when no JSONata expressions present', async () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        Cause: 'Literal error message',
        Error: 'LiteralError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('LiteralError: Literal error message')
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should handle complex error fields in JSONata mode', async () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        Cause: 'Complex error message',
        Error: 'ComplexError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { severity: 'Critical' },
        context: { executionName: 'TestExecution' },
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('ComplexError: Complex error message')
      expect(result.output).toEqual({ severity: 'Critical' })
    })

    it('should throw error when InputPath is used in JSONata mode', () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        InputPath: '$.data',
        Cause: 'Test error',
      }
      // Should throw error during state creation
      expect(() => StateFactory.createState(stateData)).toThrow(
        'InputPath field is not supported in JSONata mode. Use Assign field instead',
      )
    })

    it('should throw error when OutputPath is used in JSONata mode', () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        OutputPath: '$.result',
        Cause: 'Test error',
      }
      // Should throw error during state creation
      expect(() => StateFactory.createState(stateData)).toThrow(
        'OutputPath field is not supported in JSONata mode. Use Output field instead',
      )
    })

    it('should work without InputPath or OutputPath in JSONata mode', async () => {
      const stateData = {
        Type: 'Fail',
        QueryLanguage: 'JSONata',
        Cause: 'JSONata mode error',
        Error: 'JSONataError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('JSONataError: JSONata mode error')
      expect(result.output).toEqual({ test: 'data' })
    })
  })

  describe('Edge cases', () => {
    it('should handle very long error messages', async () => {
      const longMessage = 'A'.repeat(10000)
      const stateData = {
        Type: 'Fail',
        Cause: longMessage,
        Error: 'LongMessageError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe(`LongMessageError: ${longMessage}`)
      expect(result.error?.length).toBe(longMessage.length + 'LongMessageError: '.length)
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should handle special characters in error message', async () => {
      const specialMessage =
        'Error with \n newlines \t tabs and "quotes" and \'apostrophes\' and unicode: 🔥'
      const stateData = {
        Type: 'Fail',
        Cause: specialMessage,
        Error: 'SpecialCharError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe(`SpecialCharError: ${specialMessage}`)
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should handle numeric values as cause and error', async () => {
      const stateData = {
        Type: 'Fail',
        Cause: '404',
        Error: '500',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { test: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('500: 404')
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should handle complex input with InputPath', async () => {
      const stateData = {
        Type: 'Fail',
        InputPath: '$.errors[0].details',
        Cause: 'Processing complex input failed',
        Error: 'ComplexInputError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: {
          errors: [
            { details: { severity: 'high', code: 'E001' } },
            { details: { severity: 'low', code: 'E002' } },
          ],
          metadata: 'ignored',
        },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('ComplexInputError: Processing complex input failed')
      expect(result.output).toEqual({ severity: 'high', code: 'E001' })
    })

    it('should handle InputPath that returns null', async () => {
      const stateData = {
        Type: 'Fail',
        InputPath: '$.nonexistent',
        Cause: 'Null path error',
        Error: 'NullPathError',
      }
      const state = StateFactory.createState(stateData)
      const executor = new FailStateExecutor(state as FailState)

      const context = {
        input: { existing: 'data' },
        context: {},
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('NullPathError: Null path error')
      expect(result.output).toBe(null)
    })
  })
})
