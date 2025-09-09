import { describe, expect, it } from 'vitest'
import type { ExecutionContext, PassState } from '../../../types/asl'
import { StateFactory } from '../../../types/asl'
import { PassStateExecutor } from './pass'

describe('Pass State JSONata Assign Field Evaluation', () => {
  const mockEngine = {
    getMockResponse: async () => ({ result: 'success' }),
  } as any

  describe('JSONata mode Assign field evaluation', () => {
    it('should evaluate JSONata expressions in Assign field', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Assign: {
          orderTotal: '{% $sum($states.input.items.(price * quantity)) %}',
          itemCount: '{% $count($states.input.items) %}',
          customerFullName:
            '{% $states.input.customer.firstName & " " & $states.input.customer.lastName %}',
        },
        Next: 'NextState',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: {
          customer: {
            firstName: 'John',
            lastName: 'Doe',
          },
          items: [
            { price: 100, quantity: 2 }, // 200
            { price: 50, quantity: 3 }, // 150
          ],
        },
        currentState: 'TestPass',
        executionPath: [],
        variables: {},
      }

      await executor.execute(context)

      // Variables should be evaluated, not stored as strings
      expect(context.variables.orderTotal).toBe(350) // 200 + 150
      expect(context.variables.itemCount).toBe(2)
      expect(context.variables.customerFullName).toBe('John Doe')

      // Should not be JSONata expression strings
      expect(context.variables.orderTotal).not.toContain('{%')
      expect(context.variables.itemCount).not.toContain('{%')
      expect(context.variables.customerFullName).not.toContain('{%')
    })

    it('should handle complex JSONata expressions with array operations', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Assign: {
          averagePrice: '{% $average($states.input.items.price) %}',
          maxPrice: '{% $max($states.input.items.price) %}',
          minPrice: '{% $min($states.input.items.price) %}',
          priceRange: '{% $max($states.input.items.price) - $min($states.input.items.price) %}',
        },
        Next: 'NextState',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: {
          items: [{ price: 100 }, { price: 50 }, { price: 75 }, { price: 125 }],
        },
        currentState: 'TestPass',
        executionPath: [],
        variables: {},
      }

      await executor.execute(context)

      expect(context.variables.averagePrice).toBe(87.5) // (100 + 50 + 75 + 125) / 4
      expect(context.variables.maxPrice).toBe(125)
      expect(context.variables.minPrice).toBe(50)
      expect(context.variables.priceRange).toBe(75) // 125 - 50
    })

    it('should handle JSONata expressions with conditional logic', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Assign: {
          discount: '{% $states.input.total > 100 ? 0.1 : 0 %}',
          finalPrice: '{% $states.input.total * (1 - ($states.input.total > 100 ? 0.1 : 0)) %}',
          hasDiscount: '{% $states.input.total > 100 %}',
        },
        Next: 'NextState',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: {
          total: 150,
        },
        currentState: 'TestPass',
        executionPath: [],
        variables: {},
      }

      await executor.execute(context)

      expect(context.variables.discount).toBe(0.1)
      expect(context.variables.finalPrice).toBe(135) // 150 * 0.9
      expect(context.variables.hasDiscount).toBe(true)
    })
  })

  describe('JSONPath mode Assign field (for comparison)', () => {
    it('should evaluate JSONPath expressions in Assign field with .$ suffix', async () => {
      const state = StateFactory.createState({
        Type: 'Pass',
        Assign: {
          'customer.$': '$.customer',
          'firstItem.$': '$.items[0]',
          staticValue: 'fixed-string',
        },
        Next: 'NextState',
      }) as PassState

      const executor = new PassStateExecutor(state, mockEngine)
      const context: ExecutionContext = {
        input: {
          customer: { name: 'John' },
          items: ['item1', 'item2'],
        },
        currentState: 'TestPass',
        executionPath: [],
        variables: {},
      }

      await executor.execute(context)

      expect(context.variables.customer).toEqual({ name: 'John' })
      expect(context.variables.firstItem).toBe('item1')
      expect(context.variables.staticValue).toBe('fixed-string')
    })
  })
})
