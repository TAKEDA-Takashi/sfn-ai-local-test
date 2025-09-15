import { describe, expect, it } from 'vitest'
import { isError } from '../types/type-guards'
import { processInParallel } from './parallel'

describe('processInParallel', () => {
  describe('basic functionality', () => {
    it('should process items sequentially with concurrency=1', async () => {
      const items = [1, 2, 3]
      const processor = async (item: number, _index: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return item * 2
      }

      const results = await processInParallel(items, processor, 1)

      expect(results).toEqual([2, 4, 6])
      expect(results.every((r) => !isError(r))).toBe(true)
    })

    it('should process items in parallel with concurrency=2', async () => {
      const items = [1, 2, 3, 4]
      const startTimes: number[] = []
      const processor = async (item: number, _index: number) => {
        startTimes.push(Date.now())
        await new Promise((resolve) => setTimeout(resolve, 50))
        return item * 2
      }

      const start = Date.now()
      const results = await processInParallel(items, processor, 2)
      const end = Date.now()

      expect(results).toEqual([2, 4, 6, 8])

      // With concurrency=2, 4 items should complete in ~100ms instead of ~200ms
      const executionTime = end - start
      expect(executionTime).toBeLessThan(150) // Allow buffer for test environment
    })

    it('should process all items in parallel when concurrency >= item count', async () => {
      const items = [1, 2, 3]
      const processor = async (item: number) => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return item * 2
      }

      const start = Date.now()
      const results = await processInParallel(items, processor, 5)
      const end = Date.now()

      expect(results).toEqual([2, 4, 6])

      // All 3 items should complete in parallel (~30ms instead of ~90ms)
      const executionTime = end - start
      expect(executionTime).toBeLessThan(70)
    })
  })

  describe('error handling', () => {
    it('should handle errors without stopping other processing', async () => {
      const items = [1, 2, 3, 4]
      const processor = async (item: number, _index: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        if (item === 2) {
          throw new Error(`Error for item ${item}`)
        }
        return item * 2
      }

      const results = await processInParallel(items, processor, 2)

      expect(results).toHaveLength(4)
      expect(results[0]).toBe(2) // Success
      expect(isError(results[1])).toBe(true) // Error
      expect((results[1] as Error).message).toBe('Error for item 2')
      expect(results[2]).toBe(6) // Success
      expect(results[3]).toBe(8) // Success
    })

    it('should handle all items throwing errors', async () => {
      const items = [1, 2, 3]
      const processor = (item: number) => {
        throw new Error(`Error for item ${item}`)
      }

      const results = await processInParallel(items, processor, 2)

      expect(results).toHaveLength(3)
      expect(results.every(isError)).toBe(true)
      expect((results[0] as Error).message).toBe('Error for item 1')
      expect((results[1] as Error).message).toBe('Error for item 2')
      expect((results[2] as Error).message).toBe('Error for item 3')
    })
  })

  describe('edge cases', () => {
    it('should handle empty array', async () => {
      const items: number[] = []
      const processor = async (item: number) => item * 2

      const results = await processInParallel(items, processor, 2)

      expect(results).toEqual([])
    })

    it('should handle single item', async () => {
      const items = [5]
      const processor = async (item: number) => item * 2

      const results = await processInParallel(items, processor, 3)

      expect(results).toEqual([10])
    })

    it('should throw error for invalid concurrency', async () => {
      const items = [1, 2, 3]
      const processor = async (item: number) => item * 2

      await expect(processInParallel(items, processor, 0)).rejects.toThrow(
        'Concurrency must be greater than 0',
      )
      await expect(processInParallel(items, processor, -1)).rejects.toThrow(
        'Concurrency must be greater than 0',
      )
    })

    it('should maintain order of results', async () => {
      const items = [10, 20, 30, 40, 50]
      const processor = async (item: number, index: number) => {
        // Add variable delays to ensure order is maintained regardless of completion time
        const delay = item === 30 ? 80 : item === 10 ? 60 : 20
        await new Promise((resolve) => setTimeout(resolve, delay))
        return `result-${item}-${index}`
      }

      const results = await processInParallel(items, processor, 3)

      expect(results).toEqual([
        'result-10-0',
        'result-20-1',
        'result-30-2',
        'result-40-3',
        'result-50-4',
      ])
    })
  })

  describe('concurrency control', () => {
    it('should respect concurrency limits', async () => {
      const items = [1, 2, 3, 4, 5, 6]
      let maxConcurrent = 0
      let currentConcurrent = 0

      const processor = async (item: number) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)

        await new Promise((resolve) => setTimeout(resolve, 30))

        currentConcurrent--
        return item * 2
      }

      const results = await processInParallel(items, processor, 2)

      expect(results).toEqual([2, 4, 6, 8, 10, 12])
      expect(maxConcurrent).toBe(2) // Should never exceed concurrency limit
    })
  })
})

describe('isError', () => {
  it('should return true for Error instances', () => {
    expect(isError(new Error('test'))).toBe(true)
    expect(isError(new TypeError('test'))).toBe(true)
  })

  it('should return false for non-Error values', () => {
    expect(isError('string')).toBe(false)
    expect(isError(123)).toBe(false)
    expect(isError(null)).toBe(false)
    expect(isError(undefined)).toBe(false)
    expect(isError({})).toBe(false)
    expect(isError([])).toBe(false)
  })
})
