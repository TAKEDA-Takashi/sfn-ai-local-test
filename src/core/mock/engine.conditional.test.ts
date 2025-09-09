import { describe, expect, it } from 'vitest'
import { MockEngine } from './engine'

describe('MockEngine Conditional Matching with JSONata', () => {
  it('should match conditional mock based on dynamically generated values', async () => {
    const mockConfig = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessUserData',
          type: 'conditional',
          conditions: [
            {
              when: {
                input: {
                  Payload: {
                    fullName: 'John Doe',
                    age: 25,
                  },
                },
              },
              response: {
                Payload: {
                  fullName: 'John Doe',
                  status: 'matched',
                },
              },
            },
            {
              default: {
                Payload: {
                  fullName: 'Default User',
                  status: 'default',
                },
              },
            },
          ],
        },
      ],
    }

    const engine = new MockEngine(mockConfig as any)

    // This should match the first condition
    const result = await engine.getMockResponse('ProcessUserData', {
      FunctionName: 'ProcessUserDataFunction',
      Payload: {
        fullName: 'John Doe',
        age: 25,
        isAdult: true,
        value: 1500,
      },
    })

    expect(result).toBeDefined()
    expect((result as any).Payload).toBeDefined()
    expect((result as any).Payload.status).toBe('matched')
    expect((result as any).Payload.fullName).toBe('John Doe')
  })

  it('should perform partial matching for conditional mocks', async () => {
    const mockConfig = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessUserData',
          type: 'conditional',
          conditions: [
            {
              when: {
                input: {
                  Payload: {
                    age: 25,
                  },
                },
              },
              response: {
                Payload: {
                  result: 'age-matched',
                },
              },
            },
            {
              default: {
                Payload: {
                  result: 'default',
                },
              },
            },
          ],
        },
      ],
    }

    const engine = new MockEngine(mockConfig as any)

    // Should match even with additional fields
    const result = await engine.getMockResponse('ProcessUserData', {
      FunctionName: 'ProcessUserDataFunction',
      Payload: {
        fullName: 'John Doe',
        age: 25,
        isAdult: true,
        value: 1500,
        extra: 'field',
      },
    })

    expect((result as any).Payload.result).toBe('age-matched')
  })
})
