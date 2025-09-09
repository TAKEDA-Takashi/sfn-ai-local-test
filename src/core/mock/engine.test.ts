import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockConfig } from '../../types/mock'
import { MockEngine } from './engine'

describe('MockEngine', () => {
  let mockConfig: MockConfig

  beforeEach(() => {
    mockConfig = {
      version: '1.0',
      mocks: [],
    }
  })

  describe('Fixed mocks', () => {
    it('should return fixed response', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'fixed',
          response: { result: 'fixed value' },
        },
      ]

      const engine = new MockEngine(mockConfig)
      const response = await engine.getMockResponse('TestState', {})

      expect(response).toEqual({ result: 'fixed value' })
    })
  })

  describe('Conditional mocks', () => {
    it('should return response based on input condition', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'conditional',
          conditions: [
            {
              when: { input: { userId: '123' } },
              response: { result: 'user 123' },
            },
            {
              when: { input: { userId: '456' } },
              response: { result: 'user 456' },
            },
            {
              default: { result: 'default user' },
            },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)

      const response1 = await engine.getMockResponse('TestState', {
        userId: '123',
      })
      expect(response1).toEqual({ result: 'user 123' })

      const response2 = await engine.getMockResponse('TestState', {
        userId: '456',
      })
      expect(response2).toEqual({ result: 'user 456' })

      const response3 = await engine.getMockResponse('TestState', {
        userId: '789',
      })
      expect(response3).toEqual({ result: 'default user' })
    })

    it('should match complex nested conditions like 03-parallel case', async () => {
      mockConfig.mocks = [
        {
          state: 'CalculatePrice',
          type: 'conditional',
          conditions: [
            {
              when: { input: { orderId: 'order-001' } },
              response: {
                Payload: { totalPrice: 2000 },
                StatusCode: 200,
              },
            },
            {
              when: {
                input: { items: [{ productId: 'item-001', quantity: 2 }] },
              },
              response: {
                Payload: { totalPrice: 2000 },
                StatusCode: 200,
              },
            },
            {
              default: {
                Payload: { totalPrice: 1000 },
                StatusCode: 200,
              },
            },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)

      // Test simple orderId matching
      const response1 = await engine.getMockResponse('CalculatePrice', {
        orderId: 'order-001',
        items: [{ productId: 'item-999', quantity: 1 }],
      })
      expect((response1 as any).Payload.totalPrice).toBe(2000)

      // Test complex items matching
      const response2 = await engine.getMockResponse('CalculatePrice', {
        orderId: 'order-999',
        items: [{ productId: 'item-001', quantity: 2 }],
      })
      expect((response2 as any).Payload.totalPrice).toBe(2000)

      // Test default case
      const response3 = await engine.getMockResponse('CalculatePrice', {
        orderId: 'order-999',
        items: [{ productId: 'item-999', quantity: 1 }],
      })
      expect((response3 as any).Payload.totalPrice).toBe(1000)
    })

    it('should match Lambda integration format with Payload wrapper', async () => {
      mockConfig.mocks = [
        {
          state: 'CalculatePrice',
          type: 'conditional',
          conditions: [
            {
              when: {
                input: {
                  Payload: {
                    orderId: 'order-001',
                  },
                },
              },
              response: {
                Payload: { totalPrice: 2000 },
                StatusCode: 200,
              },
            },
            {
              when: {
                input: {
                  Payload: {
                    orderId: 'order-fail',
                  },
                },
              },
              response: {
                Payload: { totalPrice: 1000 },
                StatusCode: 200,
              },
            },
            {
              default: {
                Payload: { totalPrice: 500 },
                StatusCode: 200,
              },
            },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)

      // Test Lambda integration format (with FunctionName and Payload)
      const response1 = await engine.getMockResponse('CalculatePrice', {
        FunctionName: 'CalculatePriceFunction',
        Payload: {
          orderId: 'order-001',
          items: [{ productId: 'item-001', quantity: 2 }],
          customer: { id: 'customer-123' },
        },
      })
      expect((response1 as any).Payload.totalPrice).toBe(2000)

      // Test order-fail case
      const response2 = await engine.getMockResponse('CalculatePrice', {
        FunctionName: 'CalculatePriceFunction',
        Payload: {
          orderId: 'order-fail',
          items: [{ productId: 'item-003', quantity: 10 }],
          customer: { id: 'customer-789' },
        },
      })
      expect((response2 as any).Payload.totalPrice).toBe(1000)

      // Test default case
      const response3 = await engine.getMockResponse('CalculatePrice', {
        FunctionName: 'CalculatePriceFunction',
        Payload: {
          orderId: 'order-unknown',
          items: [{ productId: 'item-unknown', quantity: 1 }],
        },
      })
      expect((response3 as any).Payload.totalPrice).toBe(500)
    })
  })

  describe('Stateful mocks', () => {
    it('should return different responses on subsequent calls', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'stateful',
          responses: [{ result: 'first' }, { result: 'second' }, { result: 'third' }],
        },
      ]

      const engine = new MockEngine(mockConfig)

      const response1 = await engine.getMockResponse('TestState', {})
      expect(response1).toEqual({ result: 'first' })

      const response2 = await engine.getMockResponse('TestState', {})
      expect(response2).toEqual({ result: 'second' })

      const response3 = await engine.getMockResponse('TestState', {})
      expect(response3).toEqual({ result: 'third' })

      const response4 = await engine.getMockResponse('TestState', {})
      expect(response4).toEqual({ result: 'first' })
    })
  })

  describe('Error mocks', () => {
    it('should throw error when configured', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'error',
          error: {
            type: 'States.TaskFailed',
            cause: 'Simulated error',
          },
        },
      ]

      const engine = new MockEngine(mockConfig)

      await expect(engine.getMockResponse('TestState', {})).rejects.toThrow('Simulated error')
    })
  })

  describe('Mock with delay', () => {
    it('should apply delay to fixed mock response', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'fixed',
          response: { result: 'delayed' },
          delay: 100,
        },
      ]

      const engine = new MockEngine(mockConfig)
      const startTime = Date.now()

      await engine.getMockResponse('TestState', {})

      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThanOrEqual(95) // Allow for timing variations
    })

    it('should apply delay to conditional mock response', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'conditional',
          conditions: [
            {
              when: { input: { test: true } },
              response: { result: 'delayed' },
              delay: 50,
            },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)
      const startTime = Date.now()

      await engine.getMockResponse('TestState', { test: true })

      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThanOrEqual(50)
    })
  })

  describe('Error mocks with probability', () => {
    it('should throw error based on probability', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'error',
          error: {
            type: 'States.TaskFailed',
            message: 'Random error',
          },
          probability: 1.0, // Always throw
        },
      ]

      const engine = new MockEngine(mockConfig)
      await expect(engine.getMockResponse('TestState', {})).rejects.toThrow('Random error')
    })

    it('should use probability to determine error', async () => {
      // Test with mocked Math.random
      const originalRandom = Math.random

      // Test probability 0.5 with random = 0.3 (should throw)
      Math.random = vi.fn().mockReturnValue(0.3)
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'error',
          error: {
            type: 'States.TaskFailed',
            message: 'Random error',
          },
          probability: 0.5,
        },
      ]

      const engine1 = new MockEngine(mockConfig)
      await expect(engine1.getMockResponse('TestState', {})).rejects.toThrow('Random error')

      // Test probability 0.5 with random = 0.7 (should not throw)
      Math.random = vi.fn().mockReturnValue(0.7)
      // Need to create a new engine to test the different probability
      const engine2 = new MockEngine(mockConfig)
      const response = await engine2.getMockResponse('TestState', {})
      expect(response).toEqual({})

      // Restore original Math.random
      Math.random = originalRandom
    })
  })

  describe('ItemReader mocks', () => {
    it('should return data from ItemReader mock', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'itemReader',
          data: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)
      const response = await engine.getMockResponse('TestState', {})

      expect(response).toEqual([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ])
    })

    it('should throw error when ItemReader mock has no data', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'itemReader',
        },
      ]

      const engine = new MockEngine(mockConfig)
      await expect(engine.getMockResponse('TestState', {})).rejects.toThrow(
        "ItemReader mock for state 'TestState' has neither data nor dataFile",
      )
    })
  })

  // File loading mocks are tested in integration tests

  describe('Cache management', () => {
    it('should clear cache when clearCache is called', () => {
      const engine = new MockEngine(mockConfig)
      // Add a simple fixed mock to verify cache clearing works
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'fixed',
          response: { result: 'test' },
        },
      ]

      // Just verify the method exists and doesn't throw
      expect(() => engine.clearCache()).not.toThrow()
    })

    it('should update base path', () => {
      const engine = new MockEngine(mockConfig)

      // Just verify the method exists and doesn't throw
      expect(() => engine.setBasePath('/new/base/path')).not.toThrow()
    })
  })

  describe('State reset', () => {
    it('should reset call count and history', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'stateful',
          responses: [{ result: 'first' }, { result: 'second' }],
        },
      ]

      const engine = new MockEngine(mockConfig)

      // Make some calls
      await engine.getMockResponse('TestState', { input: 'test' })
      await engine.getMockResponse('TestState', { input: 'test2' })

      // Check history is tracked
      let history = engine.getHistory()
      expect(history).toHaveLength(2)

      // Reset
      engine.reset()

      // Check history is cleared
      history = engine.getHistory()
      expect(history).toHaveLength(0)

      // Check call count is reset (next call should return 'first' again)
      const response = await engine.getMockResponse('TestState', {})
      expect(response).toEqual({ result: 'first' })
    })
  })

  describe('Stateful mock with error', () => {
    it('should throw error from stateful mock response', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'stateful',
          responses: [
            { result: 'success' },
            { error: { message: 'Stateful error', type: 'States.TaskFailed' } },
            { result: 'success again' },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)

      // First call - success
      const response1 = await engine.getMockResponse('TestState', {})
      expect(response1).toEqual({ result: 'success' })

      // Second call - error
      await expect(engine.getMockResponse('TestState', {})).rejects.toThrow('Stateful error')

      // Third call - success again
      const response3 = await engine.getMockResponse('TestState', {})
      expect(response3).toEqual({ result: 'success again' })
    })
  })

  describe('Conditional mock with error', () => {
    it('should throw error from conditional mock', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'conditional',
          conditions: [
            {
              when: { input: { shouldError: true } },
              error: {
                message: 'Conditional error',
                cause: 'Test cause',
                type: 'CustomError',
              },
            },
            {
              default: { result: 'success' },
            },
          ],
        },
      ]

      const engine = new MockEngine(mockConfig)

      // Error condition
      await expect(engine.getMockResponse('TestState', { shouldError: true })).rejects.toThrow(
        'Conditional error',
      )

      // Default condition
      const response = await engine.getMockResponse('TestState', { shouldError: false })
      expect(response).toEqual({ result: 'success' })
    })
  })

  describe('History tracking', () => {
    it('should track mock call history', async () => {
      mockConfig.mocks = [
        {
          state: 'TestState',
          type: 'fixed',
          response: { result: 'test' },
        },
      ]

      const engine = new MockEngine(mockConfig)

      await engine.getMockResponse('TestState', { input: 'data' })

      const history = engine.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        state: 'TestState',
        input: { input: 'data' },
        output: { result: 'test' },
      })
    })
  })
})
