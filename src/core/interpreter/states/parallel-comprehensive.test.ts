import { beforeEach, describe, expect, it } from 'vitest'
import type { ExecutionContext, ParallelState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { ParallelStateExecutor } from './parallel'

describe('ParallelStateExecutor - Comprehensive Tests', () => {
  let mockEngine: MockEngine

  beforeEach(() => {
    mockEngine = new MockEngine({
      version: '1.0',
      mocks: [
        // JSONata mode mocks
        {
          state: 'ProcessA',
          type: 'fixed',
          response: {
            result: 'A-processed',
            status: 'success',
          },
        },
        {
          state: 'ProcessB',
          type: 'fixed',
          response: {
            result: 'B-processed',
            status: 'success',
          },
        },
        {
          state: 'ProcessC',
          type: 'fixed',
          response: {
            result: 'C-processed',
            status: 'success',
          },
        },
        // JSONPath mode mocks with Lambda invoke
        {
          state: 'LambdaA',
          type: 'fixed',
          response: {
            ExecutedVersion: '$LATEST',
            Payload: {
              result: 'LambdaA-result',
              data: 'processed-A',
            },
            StatusCode: 200,
          },
        },
        {
          state: 'LambdaB',
          type: 'fixed',
          response: {
            ExecutedVersion: '$LATEST',
            Payload: {
              result: 'LambdaB-result',
              data: 'processed-B',
            },
            StatusCode: 200,
          },
        },
        // S3 PutObject mocks
        {
          state: 'SaveResultA',
          type: 'fixed',
          response: {
            ETag: 'etag-a',
            VersionId: 'v1',
          },
        },
        {
          state: 'SaveResultB',
          type: 'fixed',
          response: {
            ETag: 'etag-b',
            VersionId: 'v1',
          },
        },
      ],
    })
  })

  describe('JSONata mode with multiple branches', () => {
    it('should execute all branches in JSONata mode with Arguments', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Arguments: '{% {"sharedData": $states.input.value * 10} %}',
        Branches: [
          {
            StartAt: 'ProcessA',
            States: {
              ProcessA: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::aws-sdk:someservice:action',
                Arguments: '{% {"input": $states.input.sharedData} %}',
                Output: '{% $states.result %}',
                End: true,
              },
            },
          },
          {
            StartAt: 'ProcessB',
            States: {
              ProcessB: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::aws-sdk:someservice:action',
                Arguments: '{% {"input": $states.input.sharedData * 2} %}',
                Output: '{% $states.result %}',
                End: true,
              },
            },
          },
          {
            StartAt: 'ProcessC',
            States: {
              ProcessC: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::aws-sdk:someservice:action',
                Arguments: '{% {"input": $states.input.sharedData * 3} %}',
                Output: '{% $states.result %}',
                End: true,
              },
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)
      const context: ExecutionContext = {
        input: { value: 5 },
        currentState: 'TestParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [],
        parallelExecutions: [],
      }

      const result = await executor.execute(context)

      // All branches should execute and return results
      expect(result.output).toHaveLength(3)
      expect(result.output).toEqual([
        { result: 'A-processed', status: 'success' },
        { result: 'B-processed', status: 'success' },
        { result: 'C-processed', status: 'success' },
      ])

      // Check parallel execution metadata
      expect(context.parallelExecutions).toHaveLength(1)
      const parallelExec = context.parallelExecutions?.[0]
      expect(parallelExec?.branchCount).toBe(3)
      expect(parallelExec?.branchPaths).toHaveLength(3)
      expect((parallelExec?.branchPaths as any)?.[0]).toEqual(['ProcessA'])
      expect((parallelExec?.branchPaths as any)?.[1]).toEqual(['ProcessB'])
      expect((parallelExec?.branchPaths as any)?.[2]).toEqual(['ProcessC'])

      // Check state executions were recorded
      expect(context.stateExecutions).toHaveLength(3)
    })

    it('should handle mixed task types in JSONata mode', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Branches: [
          {
            StartAt: 'LambdaA',
            States: {
              LambdaA: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::lambda:invoke',
                Arguments: '{% {"FunctionName": "FuncA", "Payload": $states.input} %}',
                Output: '{% $states.result.Payload %}',
                Next: 'SaveResultA',
              },
              SaveResultA: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::aws-sdk:s3:putObject',
                Arguments:
                  '{% {"Bucket": "test-bucket", "Key": "result-a.json", "Body": $states.input} %}',
                End: true,
              },
            },
          },
          {
            StartAt: 'LambdaB',
            States: {
              LambdaB: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::lambda:invoke',
                Arguments: '{% {"FunctionName": "FuncB", "Payload": $states.input} %}',
                Output: '{% $states.result.Payload %}',
                Next: 'SaveResultB',
              },
              SaveResultB: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::aws-sdk:s3:putObject',
                Arguments:
                  '{% {"Bucket": "test-bucket", "Key": "result-b.json", "Body": $states.input} %}',
                End: true,
              },
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)
      const context: ExecutionContext = {
        input: { data: 'test-data' },
        currentState: 'MixedParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [],
        parallelExecutions: [],
      }

      const result = await executor.execute(context)

      // Both branches should complete with S3 putObject results
      expect(result.output).toHaveLength(2)
      expect(result.output).toEqual([
        { ETag: 'etag-a', VersionId: 'v1' },
        { ETag: 'etag-b', VersionId: 'v1' },
      ])

      // Check parallel execution metadata
      expect(context.parallelExecutions).toHaveLength(1)
      const parallelExec = context.parallelExecutions?.[0]
      expect(parallelExec?.branchCount).toBe(2)
      expect((parallelExec?.branchPaths as any)?.[0]).toEqual(['LambdaA', 'SaveResultA'])
      expect((parallelExec?.branchPaths as any)?.[1]).toEqual(['LambdaB', 'SaveResultB'])

      // Check all state executions were recorded
      expect(context.stateExecutions).toHaveLength(4)
    })
  })

  describe('JSONPath mode with multiple branches', () => {
    it('should execute all branches in JSONPath mode with Parameters', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Parameters: {
          'shared.$': '$.value',
        },
        Branches: [
          {
            StartAt: 'LambdaA',
            States: {
              LambdaA: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'FuncA',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'LambdaB',
            States: {
              LambdaB: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'FuncB',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
        ],
        ResultPath: '$.parallelResults',
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)
      const context: ExecutionContext = {
        input: { value: 100, other: 'data' },
        currentState: 'JSONPathParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [],
        parallelExecutions: [],
      }

      const result = await executor.execute(context)

      // Results should be placed at ResultPath
      expect(result.output).toEqual({
        value: 100,
        other: 'data',
        parallelResults: [
          {
            ExecutedVersion: '$LATEST',
            Payload: { result: 'LambdaA-result', data: 'processed-A' },
            StatusCode: 200,
          },
          {
            ExecutedVersion: '$LATEST',
            Payload: { result: 'LambdaB-result', data: 'processed-B' },
            StatusCode: 200,
          },
        ],
      })

      // Check parallel execution metadata
      expect(context.parallelExecutions).toHaveLength(1)
      const parallelExec = context.parallelExecutions?.[0]
      expect(parallelExec?.branchCount).toBe(2)
      expect((parallelExec?.branchPaths as any)?.[0]).toEqual(['LambdaA'])
      expect((parallelExec?.branchPaths as any)?.[1]).toEqual(['LambdaB'])
    })

    it('should validate that branches array is not empty', () => {
      // Empty branches array should throw an error during state creation
      expect(() => {
        StateFactory.createState({
          Type: 'Parallel',
          Branches: [],
          End: true,
        })
      }).toThrow('Parallel state requires non-empty Branches array')
    })
  })

  describe('Error handling in parallel branches', () => {
    it('should fail if any branch fails', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'ProcessA',
            States: {
              ProcessA: {
                Type: 'Task',
                Resource: 'arn:aws:states:::aws-sdk:someservice:action',
                End: true,
              },
            },
          },
          {
            StartAt: 'FailingTask',
            States: {
              FailingTask: {
                Type: 'Fail',
                Error: 'TestError',
                Cause: 'Intentional failure',
              },
            },
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'data' },
        currentState: 'FailingParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Branch execution failed')
    })

    it('should handle Catch in Parallel state', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'FailingTask',
            States: {
              FailingTask: {
                Type: 'Fail',
                Error: 'TestError',
                Cause: 'Intentional failure',
              },
            },
          },
        ],
        Catch: [
          {
            ErrorEquals: ['States.ALL'],
            Next: 'ErrorHandler',
          },
        ],
        End: true,
      }) as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'data' },
        currentState: 'CatchingParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)
      expect(result.nextState).toBe('ErrorHandler')
      expect(result.success).toBe(false)
    })
  })
})
