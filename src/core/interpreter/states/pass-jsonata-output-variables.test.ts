import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from '../../../types/asl'
import type { PassState } from '../../../types/state-classes'
import { StateFactory } from '../../../types/state-factory'
import { PassStateExecutor } from './pass'

describe('Pass State JSONata Output with Variables', () => {
  const mockEngine = {
    getMockResponse: async () => ({ result: 'success' }),
  } as any

  describe('JSONata mode Output field with variables', () => {
    it('should evaluate JSONata expressions using variables in Output field', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Output:
          '{% { "finalAmount": $round($orderTotal * 0.85, 2), "discount": 0.15, "savings": $round($orderTotal * 0.15, 2) } %}',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { someData: 'test' },
        currentState: 'TestPass',
        executionPath: [],
        variables: {
          orderTotal: 1300,
        },
      }

      const result = await executor.execute(context)

      // Variables should be evaluated in Output
      expect(result.output).toEqual({
        finalAmount: 1105, // 1300 * 0.85
        discount: 0.15,
        savings: 195, // 1300 * 0.15
      })
    })

    it('should handle complex JSONata expressions with multiple variables', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Output:
          '{% { "orderId": $orderNumber, "totalAmount": $orderTotal, "itemCount": $itemCount, "averageItemPrice": $round($orderTotal / $itemCount) } %}',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { someData: 'test' },
        currentState: 'TestPass',
        executionPath: [],
        variables: {
          orderNumber: 'ORD-12345',
          orderTotal: 1300,
          itemCount: 2,
        },
      }

      const result = await executor.execute(context)

      // Variables should be used in JSONata evaluation
      expect(result.output).toEqual({
        orderId: 'ORD-12345',
        totalAmount: 1300,
        itemCount: 2,
        averageItemPrice: 650, // 1300 / 2
      })
    })

    it('should handle JSONata expressions with both variables and input', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Output:
          '{% { "orderId": $states.input.orderId, "status": "high-value", "finalAmount": $round($orderTotal * 0.85, 2), "customerName": $customerFullName } %}',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: { orderId: 'order-12345', priority: 'high' },
        currentState: 'TestPass',
        executionPath: [],
        variables: {
          orderTotal: 1000,
          customerFullName: 'Alice Johnson',
        },
      }

      const result = await executor.execute(context)

      // Should combine input and variables
      expect(result.output).toEqual({
        orderId: 'order-12345',
        status: 'high-value',
        finalAmount: 850, // 1000 * 0.85
        customerName: 'Alice Johnson',
      })
    })
  })
})
