import { beforeEach, describe, expect, it } from 'vitest'
import type { ExecutionContext, PassState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { PassStateExecutor } from './pass'
import { TaskStateExecutor } from './task'

describe('Variables/Assign Feature', () => {
  let context: ExecutionContext

  beforeEach(() => {
    context = {
      input: { userId: 'test-001', balance: 100 },
      currentState: 'TestState',
      executionPath: [],
      variables: {},
      originalInput: { userId: 'test-001', balance: 100 },
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }
  })

  describe('Pass State with Assign', () => {
    it('should assign static values to variables', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          processingStatus: 'initialized',
          transactionCount: 0,
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as PassState)
      await executor.execute(context)

      expect(context.variables.processingStatus).toBe('initialized')
      expect(context.variables.transactionCount).toBe(0)
    })

    it('should assign values from input using JSONPath', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        Parameters: {
          'userId.$': '$.userId',
          'initialBalance.$': '$.balance',
        },
        Assign: {
          'userId.$': '$.userId',
          'originalBalance.$': '$.initialBalance',
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as PassState)
      await executor.execute(context)

      expect(context.variables.userId).toBe('test-001')
      expect(context.variables.originalBalance).toBe(100)
    })

    it('should assign context values like EnteredTime', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          'startTime.$': '$$.State.EnteredTime',
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as PassState)
      await executor.execute(context)

      expect(context.variables.startTime).toBeDefined()
      expect(typeof context.variables.startTime).toBe('string')
    })
  })

  describe('Task State with Assign', () => {
    it('should assign values from task result', async () => {
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        ResultSelector: {
          'discountAmount.$': '$.Payload.discountAmount',
          'eligibleForBonus.$': '$.Payload.eligibleForBonus',
        },
        Assign: {
          'discountAmount.$': '$.discountAmount',
          'bonusEligible.$': '$.eligibleForBonus',
        },
        Next: 'NextState',
      })

      // Mock response
      const mockEngine = {
        getMockResponse: async () => ({
          Payload: {
            discountAmount: 10,
            eligibleForBonus: true,
          },
          StatusCode: 200,
        }),
      } as any

      const executor = new TaskStateExecutor(state as any, mockEngine)
      await executor.execute(context)

      expect(context.variables.discountAmount).toBe(10)
      expect(context.variables.bonusEligible).toBe(true)
    })

    it('should reference existing variables using $ prefix', async () => {
      // Set up existing variables
      context.variables.counter = 5
      context.variables.baseAmount = 100

      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: 'ProcessFunction',
          Payload: {
            'counter.$': '$counter',
            'amount.$': '$baseAmount',
          },
        },
        Next: 'NextState',
      })

      const mockEngine = {
        getMockResponse: (_stateName: string, input: unknown) => {
          // Verify that variables were passed correctly
          expect((input as { Payload: { counter: number; amount: number } }).Payload.counter).toBe(
            5,
          )
          expect((input as { Payload: { counter: number; amount: number } }).Payload.amount).toBe(
            100,
          )
          return Promise.resolve({
            Payload: { result: 'success' },
            StatusCode: 200,
          })
        },
      } as any

      const executor = new TaskStateExecutor(state as any, mockEngine)
      await executor.execute(context)
    })

    it('should perform calculations with States.MathAdd', async () => {
      context.variables.counter = 1
      context.variables.amount = 10

      const state = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          'counter.$': 'States.MathAdd($counter, 1)',
          'total.$': 'States.MathAdd($amount, 5)',
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as PassState)
      await executor.execute(context)

      expect(context.variables.counter).toBe(2)
      expect(context.variables.total).toBe(15)
    })
  })

  describe('Variable evaluation order', () => {
    it('should evaluate all expressions first, then assign', async () => {
      context.variables.x = 3
      context.variables.a = 6

      const state = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          'x.$': '$a', // x will become 6
          'nextX.$': '$x', // nextX should get 3 (original value of x)
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as PassState)
      await executor.execute(context)

      expect(context.variables.x).toBe(6)
      expect(context.variables.nextX).toBe(3)
    })
  })

  describe('Variable scope', () => {
    it('should persist variables across state executions', async () => {
      // First state sets variables
      const state1: PassState = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          userName: 'Alice',
          userAge: 30,
        },
        Next: 'State2',
      }) as PassState

      const executor1 = new PassStateExecutor(state1)
      await executor1.execute(context)

      expect(context.variables.userName).toBe('Alice')
      expect(context.variables.userAge).toBe(30)

      // Second state can access and modify variables
      const state2: PassState = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          'greeting.$': 'States.Format("Hello, {}", $userName)',
          'userAge.$': 'States.MathAdd($userAge, 1)',
        },
        Next: 'State3',
      }) as PassState

      const executor2 = new PassStateExecutor(state2)
      context.currentState = 'State2'
      await executor2.execute(context)

      expect(context.variables.greeting).toBe('Hello, Alice')
      expect(context.variables.userAge).toBe(31)
      expect(context.variables.userName).toBe('Alice') // Original still exists
    })
  })
})
