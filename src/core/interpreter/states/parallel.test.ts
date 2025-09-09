import { beforeEach, describe, expect, it } from 'vitest'
import type { ExecutionContext, ParallelState, State } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { ParallelStateExecutor } from './parallel'

describe('ParallelStateExecutor', () => {
  let mockEngine: MockEngine

  beforeEach(() => {
    mockEngine = new MockEngine({
      version: '1.0',
      mocks: [
        {
          state: 'ValidateOrder',
          type: 'fixed',
          response: {
            Payload: { valid: true, message: 'Order valid' },
            StatusCode: 200,
          },
        },
        {
          state: 'CalculatePrice',
          type: 'fixed',
          response: {
            Payload: { totalPrice: 1000 },
            StatusCode: 200,
          },
        },
        {
          state: 'ApplyDiscount',
          type: 'fixed',
          response: {
            Payload: { discountedPrice: 900 },
            StatusCode: 200,
          },
        },
        {
          state: 'CheckInventory',
          type: 'fixed',
          response: {
            Payload: { available: true },
            StatusCode: 200,
          },
        },
      ],
    })
  })

  describe('stateExecutions recording', () => {
    it('should record all nested state executions in stateExecutions array', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'ValidateOrder',
            States: {
              ValidateOrder: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ValidateOrderFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'CalculatePrice',
            States: {
              CalculatePrice: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'CalculatePriceFunction',
                  'Payload.$': '$',
                },
                Next: 'ApplyDiscount',
              },
              ApplyDiscount: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ApplyDiscountFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'CheckInventory',
            States: {
              CheckInventory: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'CheckInventoryFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'AggregateResults',
      }) as State as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)

      const context: ExecutionContext = {
        input: { orderId: 'test-001', items: [] },
        currentState: 'ProcessInParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [],
        parallelExecutions: [],
      }

      const result = await executor.execute(context)

      // Check that all nested states were recorded in stateExecutions
      expect(context.stateExecutions).toHaveLength(4) // ValidateOrder, CalculatePrice, ApplyDiscount, CheckInventory

      // Verify each state has proper path including the Parallel branch
      const stateNames = context.stateExecutions?.map((exec) => exec.state)
      expect(stateNames).toContain('ValidateOrder')
      expect(stateNames).toContain('CalculatePrice')
      expect(stateNames).toContain('ApplyDiscount')
      expect(stateNames).toContain('CheckInventory')

      // Check that each state execution has the proper parent and branch info
      const validateOrderExec = context.stateExecutions?.find(
        (exec) => exec.state === 'ValidateOrder',
      )
      expect(validateOrderExec?.parentState).toBe('ProcessInParallel')
      expect(validateOrderExec?.iterationIndex).toBe(0) // First branch

      const applyDiscountExec = context.stateExecutions?.find(
        (exec) => exec.state === 'ApplyDiscount',
      )
      expect(applyDiscountExec?.parentState).toBe('ProcessInParallel')
      expect(applyDiscountExec?.iterationIndex).toBe(1) // Second branch

      const checkInventoryExec = context.stateExecutions?.find(
        (exec) => exec.state === 'CheckInventory',
      )
      expect(checkInventoryExec?.parentState).toBe('ProcessInParallel')
      expect(checkInventoryExec?.iterationIndex).toBe(2) // Third branch

      // Verify the execution was successful
      expect(result.output).toBeDefined()
      expect(result.nextState).toBe('AggregateResults')
    })
  })

  describe('branch index correspondence', () => {
    it('should maintain correct branch index order as defined in ASL', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'ValidateOrder',
            States: {
              ValidateOrder: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ValidateOrderFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'CalculatePrice',
            States: {
              CalculatePrice: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'CalculatePriceFunction',
                  'Payload.$': '$',
                },
                Next: 'ApplyDiscount',
              },
              ApplyDiscount: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ApplyDiscountFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'CheckInventory',
            States: {
              CheckInventory: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'CheckInventoryFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'AggregateResults',
      }) as State as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)

      const context: ExecutionContext = {
        input: { orderId: 'test-001', items: [] },
        currentState: 'ProcessInParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [], // This enables parallelExecutions tracking
        parallelExecutions: [],
      }

      const result = await executor.execute(context)

      // Check that parallelExecutions was populated
      expect(context.parallelExecutions).toHaveLength(1)

      const parallelExecution = context.parallelExecutions?.[0]
      expect(parallelExecution?.type).toBe('Parallel')
      expect(parallelExecution?.state).toBe('ProcessInParallel')
      expect(parallelExecution?.branchCount).toBe(3)

      // Critical test: branch paths should correspond to definition order
      expect(parallelExecution?.branchPaths).toHaveLength(3)
      expect((parallelExecution?.branchPaths as any)?.[0]).toEqual(['ValidateOrder'])
      expect((parallelExecution?.branchPaths as any)?.[1]).toEqual([
        'CalculatePrice',
        'ApplyDiscount',
      ])
      expect((parallelExecution?.branchPaths as any)?.[2]).toEqual(['CheckInventory'])

      // Verify the execution was successful
      expect(result.output).toBeDefined()
      expect(result.nextState).toBe('AggregateResults')
    })

    it('should handle single-state branches correctly', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'ValidateOrder',
            States: {
              ValidateOrder: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ValidateOrderFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'CheckInventory',
            States: {
              CheckInventory: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'CheckInventoryFunction',
                  'Payload.$': '$',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'NextState',
      }) as State as ParallelState

      const executor = new ParallelStateExecutor(parallelState, mockEngine)

      const context: ExecutionContext = {
        input: { orderId: 'test-002' },
        currentState: 'ProcessInParallel',
        executionPath: [],
        variables: {},
        stateExecutions: [], // This enables parallelExecutions tracking
        parallelExecutions: [],
      }

      await executor.execute(context)

      const parallelExecution = context.parallelExecutions?.[0]
      expect((parallelExecution?.branchPaths as any)?.[0]).toEqual(['ValidateOrder'])
      expect((parallelExecution?.branchPaths as any)?.[1]).toEqual(['CheckInventory'])
    })
  })

  describe('error handling', () => {
    it.skip('should handle branch execution errors', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'ValidateOrder',
            States: {
              ValidateOrder: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'ValidateOrderFunction',
                  'Payload.$': '$',
                },
                End: true,
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
      }) as State as ParallelState

      // Create a mock engine that will cause an error
      const errorMockEngine = new MockEngine({
        version: '1.0',
        mocks: [
          {
            state: 'ValidateOrder',
            type: 'error',
            error: {
              type: 'States.TaskFailed',
              cause: 'Validation failed',
            },
          },
        ],
      })

      const executor = new ParallelStateExecutor(parallelState, errorMockEngine as any)

      const context: ExecutionContext = {
        input: { orderId: 'error-test' },
        currentState: 'ProcessInParallel',
        executionPath: [],
        variables: {},
      }

      const result = await executor.execute(context)

      // Should be handled by Catch
      expect(result.nextState).toBe('ErrorHandler')
      expect(result.error).toBe('Branch execution failed: Validation failed')
    })
  })
})
