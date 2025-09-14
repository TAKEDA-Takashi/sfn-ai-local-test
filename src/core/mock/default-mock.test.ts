import { describe, expect, it } from 'vitest'
import type { MockConfig } from '../../schemas/mock-schema'
import { StateFactory } from '../../types/state-factory'
import { MockEngine } from './engine'

describe('Default Mock Behavior', () => {
  describe('default mock generation', () => {
    it('should return input as-is for simple Task state when no mock is defined', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::dynamodb:getItem',
        End: true,
      })

      const input = { userId: '123', requestId: 'abc' }
      const result = await mockEngine.getMockResponse('GetUserData', input, state)

      expect(result).toEqual(input)
    })

    it('should wrap input in Payload for Lambda invoke when no mock is defined', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        End: true,
      })

      const input = { orderId: '123', amount: 100 }
      const result = await mockEngine.getMockResponse('ProcessOrder', input, state)

      expect(result).toEqual({
        Payload: input,
        StatusCode: 200,
      })
    })

    it('should return empty array for Map state when no mock is defined', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: {
            Mode: 'INLINE',
          },
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      })

      const input = { items: [1, 2, 3] }
      const result = await mockEngine.getMockResponse('MapItems', input, state)

      expect(result).toEqual([])
    })

    it('should return empty array for DistributedMap state when no mock is defined', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: {
            Mode: 'DISTRIBUTED',
          },
          StartAt: 'ProcessItem',
          States: {
            ProcessItem: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      })

      const input = { bucket: 'my-bucket', prefix: 'data/' }
      const result = await mockEngine.getMockResponse('DistributedMapItems', input, state)

      expect(result).toEqual([])
    })

    it('should use explicit mock when defined, ignoring default behavior', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'ProcessOrder',
            type: 'fixed',
            response: { customResponse: true },
          },
        ],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        End: true,
      })

      const input = { orderId: '123' }
      const result = await mockEngine.getMockResponse('ProcessOrder', input, state)

      expect(result).toEqual({ customResponse: true })
    })
  })

  describe('Lambda ARN detection', () => {
    it('should wrap response for direct Lambda ARN', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
        End: true,
      })

      const input = { test: 'data' }
      const result = await mockEngine.getMockResponse('InvokeLambda', input, state)

      // Direct Lambda ARN should NOT wrap in Payload (different from lambda:invoke)
      expect(result).toEqual(input)
    })

    it('should wrap response for lambda:invoke.waitForTaskToken', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
        End: true,
      })

      const input = { test: 'data' }
      const result = await mockEngine.getMockResponse('InvokeLambda', input, state)

      expect(result).toEqual({
        Payload: input,
        StatusCode: 200,
      })
    })
  })

  describe('Parallel state default mock', () => {
    it('should return array of inputs for Parallel state', async () => {
      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const mockEngine = new MockEngine(mockConfig)
      const state = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'Branch1',
            States: {
              Branch1: {
                Type: 'Pass',
                End: true,
              },
            },
          },
          {
            StartAt: 'Branch2',
            States: {
              Branch2: {
                Type: 'Pass',
                End: true,
              },
            },
          },
        ],
        End: true,
      })

      const input = { test: 'data' }
      const result = await mockEngine.getMockResponse('ParallelProcess', input, state)

      // Parallel should return array with input for each branch
      expect(result).toEqual([input, input])
    })
  })
})
