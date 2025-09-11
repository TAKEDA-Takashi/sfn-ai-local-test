import { describe, expect, it } from 'vitest'
import type { MockConfig } from '../../schemas/mock-schema'
import { MockEngine } from './engine'

describe('Lambda Mock Requirements', () => {
  it('should demonstrate that simple fixed mock is sufficient for most cases', async () => {
    // Complex AI-generated conditional mock
    const complexMock: MockConfig = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessOrder',
          type: 'conditional',
          conditions: [
            {
              when: { input: { customer: { firstName: 'John' } } }, // Never matches
              response: { Payload: { orderId: 'complex-john' } },
            },
            {
              when: { input: { customer: { firstName: 'Jane' } } }, // Never matches
              response: { Payload: { orderId: 'complex-jane' } },
            },
            {
              default: { Payload: { orderId: 'default-order' } },
            },
          ],
        },
      ],
    }

    // Simple fixed mock (much simpler)
    const simpleMock: MockConfig = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessOrder',
          type: 'fixed',
          response: { Payload: { orderId: 'simple-fixed' } },
        },
      ],
    }

    // Test with Lambda Arguments structure
    const lambdaInput = {
      FunctionName: 'ProcessOrderFunction',
      Payload: {
        orderId: 'uuid-123',
        customerName: 'John Doe',
        orderTotal: 1300,
      },
    }

    const complexResult = await new MockEngine(complexMock).getMockResponse(
      'ProcessOrder',
      lambdaInput,
    )
    const simpleResult = await new MockEngine(simpleMock).getMockResponse(
      'ProcessOrder',
      lambdaInput,
    )

    // Complex mock falls back to default (because conditions never match)
    expect((complexResult as any).Payload.orderId).toBe('default-order')

    // Simple mock works directly
    expect((simpleResult as any).Payload.orderId).toBe('simple-fixed')

    // Both provide the minimum required: a Payload with some response
    expect((complexResult as any).Payload).toBeDefined()
    expect((simpleResult as any).Payload).toBeDefined()
  })

  it('should demonstrate that mock content does not affect workflow logic', async () => {
    // Three different mock contents
    const mocks = [
      { orderId: 'test-1', orderTotal: 999999 }, // Wrong orderTotal
      { orderId: 'test-2', status: 'irrelevant' }, // Irrelevant fields
      { orderId: 'test-3' }, // Minimal content
    ]

    for (const mockPayload of mocks) {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'ProcessOrder',
            type: 'fixed',
            response: { Payload: mockPayload } as any,
          },
        ],
      }

      const mockEngine = new MockEngine(mockConfig)
      const result = await mockEngine.getMockResponse('ProcessOrder', {})

      // All return valid Payload (sufficient for Output: "{% $states.result.Payload %}")
      expect((result as any).Payload).toEqual(mockPayload)
    }
  })
})
