import { describe, expect, it, vi } from 'vitest'
import type { ChoiceState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { ChoiceStateExecutor } from './choice'

describe('ChoiceStateExecutor with Mock', () => {
  describe('Basic Choice Mocking', () => {
    it('should use mock nextState when provided', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.status',
            StringEquals: 'ready',
            Next: 'ProcessReady',
          },
          {
            Variable: '$.status',
            StringEquals: 'waiting',
            Next: 'WaitMore',
          },
        ],
        Default: 'HandleError',
      }) as ChoiceState

      const mockEngine = {
        getMockResponse: vi.fn().mockResolvedValue({
          Next: 'ForceToComplete',
        }),
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'StatusCheck',
        input: { status: 'waiting' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      // Mock overrides the normal choice evaluation
      expect(result.nextState).toBe('ForceToComplete')
      expect(mockEngine.getMockResponse).toHaveBeenCalledWith('StatusCheck', {
        status: 'waiting',
      })
    })

    it('should fall back to normal evaluation when mock has no nextState', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.count',
            NumericGreaterThan: 10,
            Next: 'ProcessLarge',
          },
        ],
        Default: 'ProcessSmall',
      }) as ChoiceState

      const mockEngine = {
        getMockResponse: vi.fn().mockResolvedValue({
          someOtherField: 'value',
        }),
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'CountCheck',
        input: { count: 5 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      // Falls back to normal evaluation
      expect(result.nextState).toBe('ProcessSmall')
    })

    it('should use normal evaluation when mock throws error', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.ready',
            BooleanEquals: true,
            Next: 'Continue',
          },
        ],
        Default: 'Wait',
      }) as ChoiceState

      const mockEngine = {
        getMockResponse: vi.fn().mockRejectedValue(new Error('No mock found')),
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ReadyCheck',
        input: { ready: true },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      // Falls back to normal evaluation
      expect(result.nextState).toBe('Continue')
    })
  })

  describe('Stateful Mock for Loop Control', () => {
    it('should handle retry loop with stateful mock', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.retryCount',
            NumericLessThan: 3,
            Next: 'RetryOperation',
          },
        ],
        Default: 'GiveUp',
      }) as ChoiceState

      let callCount = 0
      const mockEngine = {
        getMockResponse: vi.fn().mockImplementation((_stateName, _input) => {
          callCount++
          // First 2 calls: continue retry
          // 3rd call: force exit
          if (callCount <= 2) {
            return Promise.resolve({ Next: 'RetryOperation' })
          } else {
            return Promise.resolve({ Next: 'ForceSuccess' })
          }
        }),
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // First execution - retry
      let result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'RetryCheck',
        input: { retryCount: 0 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('RetryOperation')

      // Second execution - retry
      result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'RetryCheck',
        input: { retryCount: 1 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('RetryOperation')

      // Third execution - force exit
      result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'RetryCheck',
        input: { retryCount: 2 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('ForceSuccess')
    })

    it('should handle wait loop with timestamp comparison mock', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.currentTime',
            TimestampLessThan: '$.targetTime' as any,
            Next: 'WaitMore',
          },
        ],
        Default: 'Proceed',
      }) as ChoiceState

      // Mock to avoid infinite loop with dynamic timestamps
      const mockEngine = {
        getMockResponse: vi
          .fn()
          .mockResolvedValueOnce({ Next: 'WaitMore' })
          .mockResolvedValueOnce({ Next: 'WaitMore' })
          .mockResolvedValueOnce({ Next: 'Proceed' }), // Force exit on 3rd call
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)

      const input = {
        currentTime: '2024-01-01T10:00:00Z',
        targetTime: '2024-01-01T11:00:00Z',
      }

      // Simulate loop iterations
      for (let i = 0; i < 3; i++) {
        const result = await executor.execute({
          executionPath: [],
          variables: {},
          originalInput: input,
          stateExecutions: [],
          currentState: 'TimeCheck',
          input,
          Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
        })

        if (i < 2) {
          expect(result.nextState).toBe('WaitMore')
        } else {
          expect(result.nextState).toBe('Proceed')
        }
      }

      expect(mockEngine.getMockResponse).toHaveBeenCalledTimes(3)
    })

    it('should handle conditional exit from loop', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.status',
            StringEquals: 'running',
            Next: 'CheckAgain',
          },
          {
            Variable: '$.status',
            StringEquals: 'completed',
            Next: 'ProcessResult',
          },
        ],
        Default: 'HandleError',
      }) as ChoiceState

      const mockResponses = [
        { Next: 'CheckAgain' }, // Loop 1
        { Next: 'CheckAgain' }, // Loop 2
        { Next: 'ProcessResult' }, // Exit loop
      ]

      let responseIndex = 0
      const mockEngine = {
        getMockResponse: vi.fn().mockImplementation(() => {
          return Promise.resolve(mockResponses[responseIndex++])
        }),
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Test multiple iterations
      const results = []
      for (let i = 0; i < 3; i++) {
        const result = await executor.execute({
          executionPath: [],
          variables: {},
          originalInput: {},
          stateExecutions: [],
          currentState: 'StatusChoice',
          input: { status: 'running', iteration: i },
          Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
        })
        results.push(result.nextState)
      }

      expect(results).toEqual(['CheckAgain', 'CheckAgain', 'ProcessResult'])
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle mock with conditional response based on input', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.value',
            NumericGreaterThan: 100,
            Next: 'HandleLarge',
          },
        ],
        Default: 'HandleSmall',
      }) as ChoiceState

      const mockEngine = {
        getMockResponse: vi.fn().mockImplementation((_stateName, input) => {
          // Mock can make decisions based on input
          const typedInput = input as Record<string, unknown>
          if (typedInput.forceComplete) {
            return Promise.resolve({ Next: 'ForceComplete' })
          }
          if ((typedInput.value as number) > 50) {
            return Promise.resolve({ Next: 'CustomHandling' })
          }
          throw new Error('No mock for this input')
        }),
      } as any

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Test forced completion
      let result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ValueCheck',
        input: { value: 200, forceComplete: true },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('ForceComplete')

      // Test custom handling
      result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ValueCheck',
        input: { value: 75 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('CustomHandling')

      // Test fallback to normal evaluation
      result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ValueCheck',
        input: { value: 25 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('HandleSmall')
    })
  })
})
