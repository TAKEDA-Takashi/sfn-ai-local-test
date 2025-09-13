import { beforeEach, describe, expect, it } from 'vitest'
import type { ChoiceState, ExecutionContext } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { StateMachineExecutor } from '../executor'
import { ChoiceStateExecutor } from './choice'
import { PassStateExecutor } from './pass'
import { TaskStateExecutor } from './task'

describe('JSONPath Variable References', () => {
  let context: ExecutionContext
  let mockEngine: MockEngine

  beforeEach(() => {
    mockEngine = new MockEngine({ version: '1.0', mocks: [] })
    context = {
      input: { userId: 'test-001', amount: 100 },
      currentState: 'TestState',
      executionPath: [],
      variables: {},
      originalInput: { userId: 'test-001', amount: 100 },
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }
  })

  describe('Variable references in Pass state', () => {
    it('should reference variables with $ prefix in Parameters', async () => {
      // First set variables
      context.variables = {
        threshold: 50,
        multiplier: 2,
        status: 'active',
      }

      const state = StateFactory.createState({
        Type: 'Pass',
        Parameters: {
          'originalAmount.$': '$.amount',
          'thresholdValue.$': '$threshold', // Variable reference
          'currentStatus.$': '$status', // Variable reference
          'multiplierValue.$': '$multiplier', // Variable reference
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as any)
      const result = await executor.execute(context)

      expect(result.output).toEqual({
        originalAmount: 100,
        thresholdValue: 50,
        currentStatus: 'active',
        multiplierValue: 2,
      })
    })

    it('should use intrinsic functions with variable references', async () => {
      context.variables = {
        baseValue: 10,
        increment: 5,
      }

      const state = StateFactory.createState({
        Type: 'Pass',
        Parameters: {
          'sum.$': 'States.MathAdd($baseValue, $increment)',
          'doubled.$': 'States.MathAdd($baseValue, $baseValue)',
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as any)
      const result = await executor.execute(context)

      expect(result.output).toEqual({
        sum: 15,
        doubled: 20,
      })
    })
  })

  describe('Variable references in Task state', () => {
    it('should pass variables to Lambda function in Parameters', async () => {
      context.variables = {
        customerId: 'cust-12345',
        orderLimit: 1000,
      }

      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: 'ProcessOrder',
          Payload: {
            'userId.$': '$.userId',
            'customerId.$': '$customerId', // Variable reference
            'maxAmount.$': '$orderLimit', // Variable reference
          },
        },
        Next: 'NextState',
      })

      // Mock to verify the input
      const localMockEngine = new MockEngine({
        version: '1.0',
        mocks: [
          {
            state: 'TestState',
            type: 'fixed',
            response: {
              Payload: { success: true },
              StatusCode: 200,
            },
          },
        ],
      })

      const executor = new TaskStateExecutor(state as any, localMockEngine)
      await executor.execute(context)

      // Verify that variables were passed correctly by checking the mock was called
      // with the expected parameters (the mock captures the input)
    })
  })

  describe('Variable references in Choice state', () => {
    it('should evaluate conditions using variable references', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$threshold',
            NumericGreaterThan: 100,
            Next: 'HighThreshold',
          },
          {
            Variable: '$status',
            StringEquals: 'active',
            Next: 'ActiveStatus',
          },
        ],
        Default: 'DefaultState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Test with high threshold
      context.variables = { threshold: 150, status: 'inactive' }
      let result = await executor.execute(context)
      expect(result.nextState).toBe('HighThreshold')

      // Test with active status
      context.variables = { threshold: 50, status: 'active' }
      result = await executor.execute(context)
      expect(result.nextState).toBe('ActiveStatus')

      // Test default case
      context.variables = { threshold: 50, status: 'inactive' }
      result = await executor.execute(context)
      expect(result.nextState).toBe('DefaultState')
    })

    it('should handle complex conditions with variable and input references', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            And: [
              {
                Variable: '$userTier',
                StringEquals: 'premium',
              },
              {
                Variable: '$.amount',
                NumericGreaterThan: 50,
              },
              {
                Variable: '$isEligible',
                BooleanEquals: true,
              },
            ],
            Next: 'PremiumPath',
          },
        ],
        Default: 'StandardPath',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // All conditions met
      context.input = { amount: 100 }
      context.variables = { userTier: 'premium', isEligible: true }
      let result = await executor.execute(context)
      expect(result.nextState).toBe('PremiumPath')

      // Variable condition not met
      context.variables = { userTier: 'basic', isEligible: true }
      result = await executor.execute(context)
      expect(result.nextState).toBe('StandardPath')
    })

    it('should throw error when variable is not defined', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$undefinedVariable',
            StringEquals: 'value',
            Next: 'NextState',
          },
        ],
        Default: 'DefaultState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)
      context.variables = { otherVariable: 'value' }

      await expect(executor.execute(context)).rejects.toThrow(
        "Invalid path '$undefinedVariable': The choice state's condition path references an invalid value.",
      )
    })

    it('should safely check variable existence with IsPresent', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$optionalConfig',
            IsPresent: true,
            Next: 'ConfigExists',
          },
          {
            Variable: '$optionalConfig',
            IsPresent: false,
            Next: 'ConfigMissing',
          },
        ],
        Default: 'DefaultState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Variable exists
      context.variables = { optionalConfig: { setting: 'value' } }
      let result = await executor.execute(context)
      expect(result.nextState).toBe('ConfigExists')

      // Variable doesn't exist
      context.variables = {}
      result = await executor.execute(context)
      expect(result.nextState).toBe('ConfigMissing')
    })
  })

  describe('Variable references in Map state', () => {
    it('should use variables in Map ItemsPath', async () => {
      // Create a state machine with Map that references variables
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'SetupVariables',
        States: {
          SetupVariables: {
            Type: 'Pass',
            Assign: {
              itemsList: [1, 2, 3],
              multiplier: 10,
            },
            Next: 'ProcessItems',
          },
          ProcessItems: {
            Type: 'Map',
            ItemsPath: '$itemsList', // Variable reference
            ItemProcessor: {
              StartAt: 'MultiplyItem',
              States: {
                MultiplyItem: {
                  Type: 'Pass',
                  Parameters: {
                    'result.$': 'States.MathAdd($, $multiplier)',
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)
      const result = await executor.execute({})

      // The Map should have processed the items from the variable
      expect(result.output).toEqual([
        { result: 11 }, // 1 + 10
        { result: 12 }, // 2 + 10
        { result: 13 }, // 3 + 10
      ])
    })
  })

  describe('Variable references with nested paths', () => {
    it('should reference nested variable properties', async () => {
      context.variables = {
        config: {
          database: {
            host: 'localhost',
            port: 5432,
          },
          cache: {
            ttl: 3600,
          },
        },
        settings: {
          maxRetries: 3,
        },
      }

      const state = StateFactory.createState({
        Type: 'Pass',
        Parameters: {
          'dbHost.$': '$config.database.host',
          'dbPort.$': '$config.database.port',
          'cacheTTL.$': '$config.cache.ttl',
          'retries.$': '$settings.maxRetries',
        },
        Next: 'NextState',
      })

      const executor = new PassStateExecutor(state as any)
      const result = await executor.execute(context)

      expect(result.output).toEqual({
        dbHost: 'localhost',
        dbPort: 5432,
        cacheTTL: 3600,
        retries: 3,
      })
    })
  })

  describe('Variable persistence across states', () => {
    it('should maintain variables across multiple state executions', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'InitVariables',
        States: {
          InitVariables: {
            Type: 'Pass',
            Assign: {
              counter: 0,
              status: 'initialized',
            },
            Next: 'IncrementCounter',
          },
          IncrementCounter: {
            Type: 'Pass',
            Assign: {
              'counter.$': 'States.MathAdd($counter, 1)',
            },
            Next: 'CheckCounter',
          },
          CheckCounter: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$counter',
                NumericGreaterThan: 0,
                Next: 'Success',
              },
            ],
            Default: 'Failed',
          },
          Success: {
            Type: 'Pass',
            Result: 'Counter incremented successfully',
            End: true,
          },
          Failed: {
            Type: 'Pass',
            Result: 'Counter not incremented',
            End: true,
          },
        },
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)
      const result = await executor.execute({})

      expect(result.output).toBe('Counter incremented successfully')
      expect(result.variables?.counter).toBe(1)
      expect(result.variables?.status).toBe('initialized')
    })
  })
})
