import { describe, expect, it, vi } from 'vitest'
import type { MockConfig } from '../../types/mock'
import { MockEngine } from './engine'

describe('Default Response Behavior', () => {
  it('should always use default fallback when conditions do not match', async () => {
    // Exact AI generated mock configuration
    const mockConfig: MockConfig = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessOrder',
          type: 'conditional',
          description: 'Lambda invoke mock with customer-based branching logic',
          conditions: [
            // This condition should NEVER match Lambda Arguments structure
            {
              when: {
                input: {
                  customer: {
                    firstName: 'John',
                  },
                },
              },
              response: {
                Payload: {
                  orderId: 'order-12345',
                  status: 'processed',
                  orderTotal: 1300,
                  priority: 'high',
                  processedBy: 'high-volume-processor',
                },
                StatusCode: 200,
                ExecutedVersion: '$LATEST',
              },
            },
            // Default fallback - this should ALWAYS be used
            {
              default: {
                Payload: {
                  orderId: 'order-99999',
                  status: 'processed',
                  orderTotal: 25,
                  priority: 'low',
                  processedBy: 'default-processor',
                },
                StatusCode: 200,
                ExecutedVersion: '$LATEST',
              },
            },
          ],
        },
      ],
    }

    const mockEngine = new MockEngine(mockConfig)

    // Test with all different customer names - should ALL return default
    const testInputs = [
      {
        FunctionName: 'ProcessOrderFunction',
        Payload: {
          customerName: 'John Doe', // John case
          orderTotal: 1300,
        },
      },
      {
        FunctionName: 'ProcessOrderFunction',
        Payload: {
          customerName: 'Jane Smith', // Jane case
          orderTotal: 350,
        },
      },
      {
        FunctionName: 'ProcessOrderFunction',
        Payload: {
          customerName: 'Alice Johnson', // Alice case
          orderTotal: 1500,
        },
      },
    ]

    for (const input of testInputs) {
      const result = await mockEngine.getMockResponse('ProcessOrder', input)

      // Prove that DEFAULT is always returned (orderId: "order-99999")
      expect(result).toEqual({
        Payload: {
          orderId: 'order-99999', // This proves default fallback
          status: 'processed',
          orderTotal: 25,
          priority: 'low',
          processedBy: 'default-processor',
        },
        StatusCode: 200,
        ExecutedVersion: '$LATEST',
      })
    }
  })

  it('should prove that when conditions never match Lambda Arguments', async () => {
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
                  customer: {
                    firstName: 'John',
                  },
                },
              },
              response: { shouldNeverBeReturned: true },
            },
            {
              default: { defaultResponse: true },
            },
          ],
        },
      ],
    }

    const mockEngine = new MockEngine(mockConfig)

    // Spy on the matching function to prove it never matches
    const matchSpy = vi.spyOn(
      mockEngine as unknown as { matchesCondition: (...args: unknown[]) => unknown },
      'matchesCondition',
    )

    const lambdaInput = {
      FunctionName: 'ProcessOrderFunction',
      Payload: {
        customerId: 'cust-001',
        customerName: 'John Doe',
      },
    }

    const result = await mockEngine.getMockResponse('ProcessOrder', lambdaInput)

    // Verify that matching was attempted but failed
    expect(matchSpy).toHaveBeenCalledWith(lambdaInput, {
      input: { customer: { firstName: 'John' } },
    })

    // Verify that default was used
    expect(result).toEqual({ defaultResponse: true })
  })
})
