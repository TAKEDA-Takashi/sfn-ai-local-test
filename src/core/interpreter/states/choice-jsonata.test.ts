import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from '../../../types/asl'
import type { ChoiceState } from '../../../types/state-classes'
import { StateFactory } from '../../../types/state-factory'
import { ChoiceStateExecutor } from './choice'

describe('Choice State - JSONata Mode', () => {
  const mockEngine = {
    getMockResponse: async () => ({ result: 'success' }),
  } as any

  describe('JSONata mode Choice with variables', () => {
    it('should evaluate JSONata conditions using variables', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 %}',
            Next: 'HighValueState',
          },
          {
            Condition: '{% $orderTotal > 100 %}',
            Next: 'MediumValueState',
          },
        ],
        Default: 'LowValueState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'data' },
        currentState: 'TestChoice',
        executionPath: [],
        variables: {
          orderTotal: 1300,
          customerName: 'John Doe',
        },
      }

      const result = await executor.execute(context)

      // Variables with orderTotal = 1300 should match first condition (> 1000)
      expect(result.nextState).toBe('HighValueState')
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should evaluate to medium value when orderTotal is between 100 and 1000', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 %}',
            Next: 'HighValueState',
          },
          {
            Condition: '{% $orderTotal > 100 %}',
            Next: 'MediumValueState',
          },
        ],
        Default: 'LowValueState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'data' },
        currentState: 'TestChoice',
        executionPath: [],
        variables: {
          orderTotal: 500,
          customerName: 'Jane Smith',
        },
      }

      const result = await executor.execute(context)

      // Variables with orderTotal = 500 should match second condition (> 100)
      expect(result.nextState).toBe('MediumValueState')
    })

    it('should evaluate to low value when orderTotal is less than 100', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 %}',
            Next: 'HighValueState',
          },
          {
            Condition: '{% $orderTotal > 100 %}',
            Next: 'MediumValueState',
          },
        ],
        Default: 'LowValueState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { test: 'data' },
        currentState: 'TestChoice',
        executionPath: [],
        variables: {
          orderTotal: 50,
          customerName: 'Bob Wilson',
        },
      }

      const result = await executor.execute(context)

      // Variables with orderTotal = 50 should use default
      expect(result.nextState).toBe('LowValueState')
    })

    it('should be able to reference both variables and $states.input', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 and $states.input.priority = "high" %}',
            Next: 'UrgentHighValueState',
          },
          {
            Condition: '{% $orderTotal > 1000 %}',
            Next: 'HighValueState',
          },
        ],
        Default: 'OtherState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { priority: 'high', product: 'laptop' },
        currentState: 'TestChoice',
        executionPath: [],
        variables: {
          orderTotal: 1500,
        },
      }

      const result = await executor.execute(context)

      // Should match first condition (both variable and input conditions)
      expect(result.nextState).toBe('UrgentHighValueState')
    })
  })

  describe('Choice state receiving task output but needing variables', () => {
    it('should use variables for condition evaluation, not task output', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 %}', // Should use variable, not input
            Next: 'HighValueState',
          },
        ],
        Default: 'LowValueState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Simulating scenario:
      // - Task output is {orderId, status, orderTotal: 1300, priority}
      // - Variables contain {orderTotal: 1300, itemCount: 2, customerFullName: "John Doe"}
      // - Choice should use variable $orderTotal (1300), not input.orderTotal (1300)
      // - But this tests the principle
      const context: ExecutionContext = {
        input: {
          orderId: 'order-12345',
          status: 'processed',
          orderTotal: 1300, // Task output value
          priority: 'high',
        },
        currentState: 'CheckOrderValue',
        executionPath: [],
        variables: {
          orderTotal: 1300, // Variable value (should be used)
          itemCount: 2,
          customerFullName: 'John Doe',
        },
      }

      const result = await executor.execute(context)

      // Should match high value condition using variable $orderTotal = 1300
      expect(result.nextState).toBe('HighValueState')
    })

    it('should distinguish between variable and input when values differ', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 %}', // Variable condition
            Next: 'HighVariableState',
          },
          {
            Condition: '{% $states.input.orderTotal > 1000 %}', // Input condition
            Next: 'HighInputState',
          },
        ],
        Default: 'LowValueState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Test case: variable says high, input says low
      const context: ExecutionContext = {
        input: {
          orderId: 'order-12345',
          orderTotal: 50, // Low value in input
        },
        currentState: 'CheckOrderValue',
        executionPath: [],
        variables: {
          orderTotal: 1500, // High value in variable
        },
      }

      const result = await executor.execute(context)

      // Should match the FIRST condition: variable $orderTotal = 1500 > 1000
      expect(result.nextState).toBe('HighVariableState')
    })

    it('should handle case where variable is low but input is high', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $orderTotal > 1000 %}', // Variable condition (will be false)
            Next: 'HighVariableState',
          },
          {
            Condition: '{% $states.input.orderTotal > 1000 %}', // Input condition (will be true)
            Next: 'HighInputState',
          },
        ],
        Default: 'LowValueState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state, mockEngine)

      // Test case: variable says low, input says high
      const context: ExecutionContext = {
        input: {
          orderId: 'order-12345',
          orderTotal: 1500, // High value in input
        },
        currentState: 'CheckOrderValue',
        executionPath: [],
        variables: {
          orderTotal: 50, // Low value in variable
        },
      }

      const result = await executor.execute(context)

      // Should match the SECOND condition: input.orderTotal = 1500 > 1000
      expect(result.nextState).toBe('HighInputState')
    })
  })
})
