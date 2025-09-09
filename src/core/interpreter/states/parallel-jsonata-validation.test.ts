import { describe, expect, it } from 'vitest'
import type { ExecutionContext, ParallelState } from '../../../types/asl'
import { StateFactory } from '../../../types/asl'
import { ParallelStateExecutor } from './parallel'

describe('Parallel State JSONata Mode Validation', () => {
  const mockEngine = {
    getMockResponse: async () => ({ result: 'success' }),
  } as any

  describe('Field restrictions in JSONata mode', () => {
    it('should reject Parameters field in JSONata mode', () => {
      // Should throw error during state creation
      expect(() =>
        StateFactory.createState({
          Type: 'Parallel',
          QueryLanguage: 'JSONata',
          Parameters: {
            input: '$.value',
          },
          Branches: [
            {
              StartAt: 'Branch1',
              States: {
                Branch1: StateFactory.createState({
                  Type: 'Pass',
                  End: true,
                }) as any,
              },
            },
          ],
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should accept Arguments field in JSONata mode', async () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Arguments: '{% {"processedInput": $states.input.value * 2} %}',
        Branches: [
          {
            StartAt: 'Branch1',
            States: {
              Branch1: StateFactory.createState({
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"branch": 1, "value": $states.input.processedInput} %}',
                End: true,
              }) as any,
            },
          },
          {
            StartAt: 'Branch2',
            States: {
              Branch2: StateFactory.createState({
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"branch": 2, "value": $states.input.processedInput * 2} %}',
                End: true,
              }) as any,
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(state as any, mockEngine)
      const context: ExecutionContext = {
        input: { value: 10 },
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([
        { branch: 1, value: 20 },
        { branch: 2, value: 40 },
      ])
    })

    it('should accept Parameters field in JSONPath mode', async () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        Parameters: {
          'sharedInput.$': '$.value',
        },
        Branches: [
          {
            StartAt: 'Branch1',
            States: {
              Branch1: StateFactory.createState({
                Type: 'Pass',
                Result: { branch: 1 },
                End: true,
              }) as any,
            },
          },
          {
            StartAt: 'Branch2',
            States: {
              Branch2: StateFactory.createState({
                Type: 'Pass',
                Result: { branch: 2 },
                End: true,
              }) as any,
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(state as any, mockEngine)
      const context: ExecutionContext = {
        input: { value: 10 },
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([{ branch: 1 }, { branch: 2 }])
    })
  })

  describe('Data flow in JSONata mode', () => {
    it('should pass same transformed input to all branches with Arguments', async () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Arguments: '{% {"shared": $states.input.value + 100} %}',
        Branches: [
          {
            StartAt: 'Process1',
            States: {
              Process1: StateFactory.createState({
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"result": $states.input.shared * 1} %}',
                End: true,
              }) as any,
            },
          },
          {
            StartAt: 'Process2',
            States: {
              Process2: StateFactory.createState({
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"result": $states.input.shared * 2} %}',
                End: true,
              }) as any,
            },
          },
          {
            StartAt: 'Process3',
            States: {
              Process3: StateFactory.createState({
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"result": $states.input.shared * 3} %}',
                End: true,
              }) as any,
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(state as any, mockEngine)
      const context: ExecutionContext = {
        input: { value: 50 },
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([
        { result: 150 }, // (50 + 100) * 1
        { result: 300 }, // (50 + 100) * 2
        { result: 450 }, // (50 + 100) * 3
      ])
    })

    it('should handle different state types in branches', async () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Branches: [
          {
            StartAt: 'Wait',
            States: {
              Wait: StateFactory.createState({
                Type: 'Wait',
                Seconds: 0,
                Next: 'Done',
              }) as any,
              Done: StateFactory.createState({
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"branch": "wait", "input": $states.input} %}',
                End: true,
              }) as any,
            },
          },
          {
            StartAt: 'Choice',
            States: {
              Choice: {
                Type: 'Choice',
                QueryLanguage: 'JSONata',
                Choices: [
                  {
                    Condition: '{% $states.input.value > 5 %}',
                    Next: 'HighValue',
                  },
                ],
                Default: 'LowValue',
              } as any,
              HighValue: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"branch": "choice-high", "value": $states.input.value} %}' as any,
                End: true,
              } as any,
              LowValue: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% {"branch": "choice-low", "value": $states.input.value} %}' as any,
                End: true,
              } as any,
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(state as any, mockEngine)
      const context: ExecutionContext = {
        input: { value: 10 },
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([
        { branch: 'wait', input: { value: 10 } },
        { branch: 'choice-high', value: 10 },
      ])
    })

    it('should handle empty Arguments field (pass input as-is)', async () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Branches: [
          {
            StartAt: 'Echo',
            States: {
              Echo: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Output: '{% $states.input %}' as any,
                End: true,
              } as any,
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(state as any, mockEngine)
      const context: ExecutionContext = {
        input: { original: 'data' },
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.output).toEqual([{ original: 'data' }])
    })
  })

  describe('Error handling', () => {
    it('should handle branch execution failures', async () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Branches: [
          {
            StartAt: 'Fail',
            States: {
              Fail: StateFactory.createState({
                Type: 'Fail',
                Error: 'BranchError',
                Cause: 'Test failure',
              }) as any,
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(state as any, mockEngine)
      const context: ExecutionContext = {
        input: {},
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Branch execution failed')
    })
  })
})
