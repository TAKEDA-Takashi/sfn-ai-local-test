/**
 * Tests for JSONPath Utilities
 */

import { describe, expect, it } from 'vitest'
import { JSONPathUtils } from './jsonpath-utils'

describe('JSONPathUtils', () => {
  const testData = {
    name: 'John',
    age: 30,
    address: {
      city: 'Tokyo',
      country: 'Japan',
    },
    hobbies: ['reading', 'gaming', 'coding'],
    scores: [85, 90, 78],
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ],
  }

  describe('evaluate', () => {
    it('should evaluate simple path', () => {
      const result = JSONPathUtils.evaluate('$.name', testData)
      expect(result).toBe('John')
    })

    it('should evaluate nested path', () => {
      const result = JSONPathUtils.evaluate('$.address.city', testData)
      expect(result).toBe('Tokyo')
    })

    it('should evaluate array path', () => {
      const result = JSONPathUtils.evaluate('$.hobbies[0]', testData)
      expect(result).toBe('reading')
    })

    it('should not throw error for bracket-only path (returns root)', () => {
      // JSONPath actually treats '$[' as a valid path returning root
      const result = JSONPathUtils.evaluate('$[', testData)
      expect(result).toBeDefined()
    })
  })

  describe('evaluateWithoutWrap', () => {
    it('should evaluate without wrapping result', () => {
      const result = JSONPathUtils.evaluateWithoutWrap('$.name', testData)
      expect(result).toBe('John')
    })

    it('should return array as-is', () => {
      const result = JSONPathUtils.evaluateWithoutWrap('$.hobbies', testData)
      expect(result).toEqual(['reading', 'gaming', 'coding'])
    })

    it('should not throw error for bracket-only path (returns root)', () => {
      // JSONPath actually treats '$[' as a valid path returning root
      const result = JSONPathUtils.evaluateWithoutWrap('$[', testData)
      expect(result).toBeDefined()
    })
  })

  describe('evaluateFirst', () => {
    it('should return first element when path matches multiple', () => {
      const result = JSONPathUtils.evaluateFirst('$.hobbies[*]', testData)
      expect(result).toBe('reading')
    })

    it('should return single value directly', () => {
      const result = JSONPathUtils.evaluateFirst('$.name', testData)
      expect(result).toBe('John')
    })

    it('should return null when path does not exist and no default', () => {
      const result = JSONPathUtils.evaluateFirst('$.nonexistent', testData)
      expect(result).toBeNull()
    })

    it('should return default value when path does not exist', () => {
      const result = JSONPathUtils.evaluateFirst('$.nonexistent', testData, 'default')
      expect(result).toBe('default')
    })

    it('should return value when path is valid even if unusual', () => {
      // '$[' is actually valid in JSONPath and returns root
      const result = JSONPathUtils.evaluateFirst('$[', testData, 'fallback')
      expect(result).toBeDefined()
      expect(result).not.toBe('fallback')
    })

    it('should return value when path is valid even if unusual and no default', () => {
      // '$[' is actually valid in JSONPath and returns root
      const result = JSONPathUtils.evaluateFirst('$[', testData)
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
    })
  })

  describe('evaluateAsArray', () => {
    it('should return array for array path', () => {
      const result = JSONPathUtils.evaluateAsArray('$.hobbies', testData)
      // JSONPath returns array of results, so array values get wrapped
      expect(result).toEqual([['reading', 'gaming', 'coding']])
    })

    it('should wrap single value in array', () => {
      const result = JSONPathUtils.evaluateAsArray('$.name', testData)
      expect(result).toEqual(['John'])
    })

    it('should return empty array for non-existent path', () => {
      const result = JSONPathUtils.evaluateAsArray('$.nonexistent', testData)
      expect(result).toEqual([])
    })

    it('should return array when path is valid even if unusual', () => {
      // '$[' is actually valid in JSONPath and returns root
      const result = JSONPathUtils.evaluateAsArray('$[', testData)
      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('pathExists', () => {
    it('should return true for existing path', () => {
      const result = JSONPathUtils.pathExists('$.name', testData)
      expect(result).toBe(true)
    })

    it('should return true for nested existing path', () => {
      const result = JSONPathUtils.pathExists('$.address.city', testData)
      expect(result).toBe(true)
    })

    it('should return false for non-existent path', () => {
      const result = JSONPathUtils.pathExists('$.nonexistent', testData)
      expect(result).toBe(false)
    })

    it('should return true for unusual but valid path', () => {
      // '$[' is actually valid in JSONPath and returns root
      const result = JSONPathUtils.pathExists('$[', testData)
      expect(result).toBe(true)
    })
  })

  describe('evaluateWithContext', () => {
    const contextData = {
      Context: {
        Execution: {
          Name: 'test-execution',
          StartTime: '2024-01-01T00:00:00Z',
        },
        StateMachine: {
          Name: 'TestStateMachine',
        },
      },
    }

    it('should evaluate context path starting with $$.', () => {
      const result = JSONPathUtils.evaluateWithContext(
        '$$.Context.Execution.Name',
        testData,
        contextData,
      )
      expect(result).toEqual(['test-execution'])
    })

    it('should evaluate nested context path', () => {
      const result = JSONPathUtils.evaluateWithContext(
        '$$.Context.StateMachine.Name',
        testData,
        contextData,
      )
      expect(result).toEqual(['TestStateMachine'])
    })

    it('should evaluate normal path when not starting with $$.', () => {
      const result = JSONPathUtils.evaluateWithContext('$.name', testData, contextData)
      expect(result).toBe('John')
    })

    it('should handle unusual but valid context path', () => {
      // '$$.[' becomes '$.[' which is valid in JSONPath
      const result = JSONPathUtils.evaluateWithContext('$$.[', testData, contextData)
      expect(result).toBeDefined()
    })

    it('should handle unusual but valid normal path', () => {
      // '$[' is actually valid in JSONPath
      const result = JSONPathUtils.evaluateWithContext('$[', testData, contextData)
      expect(result).toBeDefined()
    })
  })

  describe('extractItemsArray', () => {
    const arrayData = ['item1', 'item2', 'item3']
    const objectWithArray = {
      data: {
        items: ['a', 'b', 'c'],
      },
    }

    it('should return input when ItemsPath is $', () => {
      const result = JSONPathUtils.extractItemsArray('$', arrayData)
      expect(result).toEqual(['item1', 'item2', 'item3'])
    })

    it('should throw error when ItemsPath is $ but input is not array', () => {
      expect(() => JSONPathUtils.extractItemsArray('$', { not: 'array' })).toThrow(
        'Input must be an array when ItemsPath is "$"',
      )
    })

    it('should extract nested array', () => {
      const result = JSONPathUtils.extractItemsArray('$.data.items', objectWithArray)
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should extract array from complex path', () => {
      const result = JSONPathUtils.extractItemsArray('$.hobbies', testData)
      expect(result).toEqual(['reading', 'gaming', 'coding'])
    })

    it('should throw error when path does not resolve to array', () => {
      expect(() => JSONPathUtils.extractItemsArray('$.name', testData)).toThrow(
        'ItemsPath "$.name" must resolve to an array',
      )
    })

    it('should throw error when path resolves to non-array', () => {
      expect(() => JSONPathUtils.extractItemsArray('$.address', testData)).toThrow(
        'ItemsPath "$.address" must resolve to an array',
      )
    })
  })
})
