import { describe, expect, it } from 'vitest'
import type { MockConfig } from '../../types/mock'
import { MockEngine } from './engine'

describe('MockEngine Lambda Arguments Matching', () => {
  describe('Lambda invoke integration mock matching', () => {
    it('should match Lambda Arguments with Payload structure correctly', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'ProcessOrder',
            type: 'conditional',
            conditions: [
              {
                when: {
                  input: {
                    Payload: {
                      customerName: 'John Doe',
                    },
                  },
                },
                response: {
                  Payload: { orderId: 'order-12345', status: 'processed' },
                  StatusCode: 200,
                },
              },
            ],
          },
        ],
      }

      const mockEngine = new MockEngine(mockConfig)

      // This is the actual structure passed to Lambda invoke
      const lambdaInput = {
        FunctionName: 'ProcessOrderFunction',
        Payload: {
          orderId: 'uuid-123',
          customerId: 'cust-001',
          customerName: 'John Doe',
          orderTotal: 1300,
        },
      }

      const result = await mockEngine.getMockResponse('ProcessOrder', lambdaInput)

      expect(result).toEqual({
        Payload: { orderId: 'order-12345', status: 'processed' },
        StatusCode: 200,
      })
    })

    it('should fail to match when using incorrect condition structure', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'ProcessOrder',
            type: 'conditional',
            conditions: [
              {
                // This is WRONG - AI generated this incorrect structure
                when: {
                  input: {
                    customer: {
                      firstName: 'John',
                    },
                  },
                },
                response: {
                  Payload: { orderId: 'order-12345', status: 'processed' },
                  StatusCode: 200,
                },
              },
            ],
          },
        ],
      }

      const mockEngine = new MockEngine(mockConfig)

      // Actual Lambda input structure
      const lambdaInput = {
        FunctionName: 'ProcessOrderFunction',
        Payload: {
          orderId: 'uuid-123',
          customerId: 'cust-001',
          customerName: 'John Doe',
          orderTotal: 1300,
        },
      }

      // Should throw error because no condition matches and no default is provided
      await expect(mockEngine.getMockResponse('ProcessOrder', lambdaInput)).rejects.toThrow(
        'No matching condition for state: ProcessOrder',
      )
    })
  })
})
