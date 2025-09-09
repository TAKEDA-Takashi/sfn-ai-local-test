import { describe, expect, it } from 'vitest'
import type { WaitState } from '../../../types/state-classes'
import { StateFactory } from '../../../types/state-factory'
import { WaitStateExecutor } from './wait'

describe('WaitStateExecutor', () => {
  describe('Standard JSONPath mode', () => {
    it('should wait for specified seconds', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        Seconds: 2,
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const startTime = Date.now()
      const context = {
        input: { test: 'data' },
        context: {},
        currentState: 'WaitState',
        executionPath: [],
        variables: {},
        originalInput: { test: 'data' },
        stateExecutions: [],
      }

      const result = await executor.execute(context as any)

      const endTime = Date.now()
      const elapsedMs = endTime - startTime

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ test: 'data' })
      expect(result.nextState).toBe('NextState')
      expect(result.executionPath).toEqual([])
      // Should have waited at least some time (capped at 100ms for testing)
      expect(elapsedMs).toBeGreaterThan(50)
    })

    it('should wait using SecondsPath', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$.waitTime',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitTime: 1, data: 'test' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitTime: 1, data: 'test' })
      expect(result.nextState).toBe('NextState')
    })

    it('should wait until specified timestamp', async () => {
      // Set timestamp 1 second in the future
      const futureTime = new Date(Date.now() + 1000)
      const state = StateFactory.createState({
        Type: 'Wait',
        Timestamp: futureTime.toISOString(),
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { test: 'data' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ test: 'data' })
      expect(result.nextState).toBe('NextState')
    })

    it('should not wait for past timestamp', async () => {
      // Set timestamp in the past
      const pastTime = new Date(Date.now() - 1000)
      const state = StateFactory.createState({
        Type: 'Wait',
        Timestamp: pastTime.toISOString(),
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const startTime = Date.now()
      const context = {
        input: { test: 'data' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      const endTime = Date.now()
      const elapsedMs = endTime - startTime

      expect(result.success).toBe(true)
      // Should not have waited significantly
      expect(elapsedMs).toBeLessThan(50)
    })

    it('should wait using TimestampPath', async () => {
      const futureTime = new Date(Date.now() + 500)
      const state = StateFactory.createState({
        Type: 'Wait',
        TimestampPath: '$.waitUntil',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitUntil: futureTime.toISOString(), data: 'test' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitUntil: futureTime.toISOString(), data: 'test' })
    })

    it('should handle number timestamp in TimestampPath', async () => {
      const futureTime = Date.now() + 500
      const state = StateFactory.createState({
        Type: 'Wait',
        TimestampPath: '$.waitUntilMs',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitUntilMs: futureTime, data: 'test' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitUntilMs: futureTime, data: 'test' })
    })

    it('should apply InputPath correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        InputPath: '$.payload',
        Seconds: 0.1,
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { payload: { message: 'test' }, other: 'ignored' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ message: 'test' })
    })

    it('should apply OutputPath correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        Seconds: 0.1,
        OutputPath: '$.result',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { result: { status: 'ready' }, metadata: 'ignored' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ status: 'ready' })
    })

    it('should handle undefined SecondsPath gracefully', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$.nonexistentPath',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { data: 'test' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ data: 'test' })
    })

    it('should handle root path "$" in SecondsPath', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: 0.1, // Input is directly a number
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toBe(0.1)
    })
  })

  describe('JSONata mode', () => {
    it('should handle Seconds as JSONata expression', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        QueryLanguage: 'JSONata',
        Seconds: '$states.input.waitTime * 2',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitTime: 0.05 },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitTime: 0.05 })
    })

    it('should handle numeric Seconds in JSONata mode', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        QueryLanguage: 'JSONata',
        Seconds: 0.1,
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { test: 'data' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ test: 'data' })
    })

    it('should throw error for SecondsPath in JSONata mode', () => {
      // Should throw error during state creation
      expect(() =>
        StateFactory.createState({
          Type: 'Wait',
          QueryLanguage: 'JSONata',
          SecondsPath: '$.waitTime',
          Next: 'NextState',
        }),
      ).toThrow('SecondsPath field is not supported in JSONata mode. Use Seconds field instead')
    })

    it('should throw error for TimestampPath in JSONata mode', () => {
      // 構築時にエラーが投げられることを期待
      expect(() =>
        StateFactory.createState({
          Type: 'Wait',
          QueryLanguage: 'JSONata',
          TimestampPath: '$.waitUntil',
          Next: 'NextState',
        }),
      ).toThrow('TimestampPath field is not supported in JSONata mode. Use Timestamp field instead')
    })
  })

  describe('Edge cases', () => {
    it('should handle zero wait time', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        Seconds: 0,
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const startTime = Date.now()
      const context = {
        input: { test: 'data' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      const endTime = Date.now()
      const elapsedMs = endTime - startTime

      expect(result.success).toBe(true)
      expect(elapsedMs).toBeLessThan(50) // Should complete quickly
    })

    it('should handle negative wait time from path', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$.waitTime',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitTime: -1 },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitTime: -1 })
    })

    it('should handle null input', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        Seconds: 0.01,
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: null,
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toBeNull()
    })

    it('should handle empty path result', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$.nonexistent[*].missing',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { data: 'test' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ data: 'test' })
    })

    it('should cap wait time for very long durations', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        Seconds: 3600, // 1 hour - should be capped at 100ms for testing
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const startTime = Date.now()
      const context = {
        input: { test: 'data' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      const endTime = Date.now()
      const elapsedMs = endTime - startTime

      expect(result.success).toBe(true)
      // Should have waited close to 100ms (the cap), not 1 hour
      expect(elapsedMs).toBeLessThan(200)
      expect(elapsedMs).toBeGreaterThan(50)
    })

    it('should handle Date object in TimestampPath', async () => {
      const futureTime = new Date(Date.now() + 200)
      const state = StateFactory.createState({
        Type: 'Wait',
        TimestampPath: '$.waitUntil',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitUntil: futureTime, data: 'test' },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitUntil: futureTime, data: 'test' })
    })
  })

  describe('getPathValue private method coverage', () => {
    it('should handle complex JSONPath expressions', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$.config.timing.waitSeconds',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: {
          config: {
            timing: {
              waitSeconds: 0.05,
            },
          },
          data: 'test',
        },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual(context.input)
    })

    it('should handle array results from JSONPath', async () => {
      const state = StateFactory.createState({
        Type: 'Wait',
        SecondsPath: '$.waitTimes[0]',
        Next: 'NextState',
      }) as WaitState
      const executor = new WaitStateExecutor(state)

      const context = {
        input: { waitTimes: [0.05, 0.1, 0.2] },
        context: {},
        currentState: 'WaitState',
      }

      const result = await executor.execute(context as any)

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ waitTimes: [0.05, 0.1, 0.2] })
    })
  })
})
