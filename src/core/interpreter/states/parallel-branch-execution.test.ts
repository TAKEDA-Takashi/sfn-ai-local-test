import { beforeEach, describe, expect, it } from 'vitest'
import type { ExecutionContext, ParallelState, State } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { ParallelStateExecutor } from './parallel'

describe('ParallelStateExecutor - Branch Execution Integration', () => {
  let mockEngine: MockEngine

  beforeEach(() => {
    mockEngine = new MockEngine({
      version: '1.0',
      mocks: [
        {
          state: 'CheckUserTask',
          type: 'fixed',
          response: {
            Payload: { userId: 'test-user', status: 'validated' },
            StatusCode: 200,
            ExecutedVersion: '$LATEST',
          },
        },
        {
          state: 'SaveUserResultTask',
          type: 'fixed',
          response: {
            Payload: { saved: true, resultId: 'result-123' },
            StatusCode: 200,
            ExecutedVersion: '$LATEST',
          },
        },
        {
          state: 'ProcessDataTask',
          type: 'fixed',
          response: {
            Payload: { processed: true, dataCount: 42 },
            StatusCode: 200,
            ExecutedVersion: '$LATEST',
          },
        },
        {
          state: 'LogDataTask',
          type: 'fixed',
          response: {
            Payload: { logged: true, logId: 'log-456' },
            StatusCode: 200,
            ExecutedVersion: '$LATEST',
          },
        },
        {
          state: 'FinalTask',
          type: 'fixed',
          response: {
            Payload: { completed: true, finalResult: 'success' },
            StatusCode: 200,
            ExecutedVersion: '$LATEST',
          },
        },
      ],
    })
  })

  describe('JSONPath mode', () => {
    it('should execute all child states in parallel branches and record stateExecutions', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'CheckUserTask',
            States: {
              CheckUserTask: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'CheckUserFunction',
                  'Payload.$': '$',
                },
                Next: 'SaveUserResultTask',
              },
              SaveUserResultTask: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'SaveUserResultFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'ProcessDataTask',
            States: {
              ProcessDataTask: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ProcessDataFunction',
                  'Payload.$': '$',
                },
                Next: 'LogDataTask',
              },
              LogDataTask: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'LogDataFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'FinalTask',
      }) as State as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)

      const context: ExecutionContext = {
        input: { testData: 'integration-test' },
        currentState: 'ProcessInParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [], // Enable stateExecutions tracking
      }

      const result = await executor.execute(context)

      // Should have 4 child states recorded in context
      expect(context.stateExecutions).toHaveLength(4)
      const executedStates = context.stateExecutions?.map((exec) => exec.state) || []

      // Verify all child states were executed
      expect(executedStates).toContain('CheckUserTask')
      expect(executedStates).toContain('SaveUserResultTask')
      expect(executedStates).toContain('ProcessDataTask')
      expect(executedStates).toContain('LogDataTask')

      // Verify branch assignments are correct
      const checkUserExec = context.stateExecutions?.find((exec) => exec.state === 'CheckUserTask')
      expect(checkUserExec?.iterationIndex).toBe(0) // First branch

      const processDataExec = context.stateExecutions?.find(
        (exec) => exec.state === 'ProcessDataTask',
      )
      expect(processDataExec?.iterationIndex).toBe(1) // Second branch

      expect(result.output).toBeDefined()
      expect(result.nextState).toBe('FinalTask')
      expect(result.success).toBe(true)
    })
  })

  describe('JSONata mode', () => {
    it('should execute all child states in parallel branches with JSONata mode', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Arguments: '{ "testMode": "jsonata", "input": $ }',
        Branches: [
          {
            StartAt: 'CheckUserTask',
            States: {
              CheckUserTask: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::lambda:invoke',
                Arguments: '{ "FunctionName": "CheckUserFunction", "Payload": $ }',
                End: true,
              },
            },
          },
          {
            StartAt: 'ProcessDataTask',
            States: {
              ProcessDataTask: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::lambda:invoke',
                Arguments: '{ "FunctionName": "ProcessDataFunction", "Payload": $ }',
                End: true,
              },
            },
          },
        ],
        Next: 'FinalTask',
      }) as State as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)

      const context: ExecutionContext = {
        input: { testData: 'jsonata-integration-test' },
        currentState: 'ProcessInParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [], // Enable stateExecutions tracking
      }

      const result = await executor.execute(context)

      // Should have 2 child states recorded in context
      expect(context.stateExecutions).toHaveLength(2)
      const executedStates = context.stateExecutions?.map((exec) => exec.state) || []

      // Verify all child states were executed
      expect(executedStates).toContain('CheckUserTask')
      expect(executedStates).toContain('ProcessDataTask')

      expect(result.output).toBeDefined()
      expect(result.nextState).toBe('FinalTask')
      expect(result.success).toBe(true)
    })
  })
})
