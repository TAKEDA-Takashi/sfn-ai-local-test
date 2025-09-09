import { describe, expect, it } from 'vitest'
import { JSONataEvaluator } from './jsonata'

describe('JSONataEvaluator', () => {
  describe('Step Functions specific JSONata functions', () => {
    describe('$partition', () => {
      it('should partition array into chunks', async () => {
        const expression = '$partition([1,2,3,4,5,6], 2)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([
          [1, 2],
          [3, 4],
          [5, 6],
        ])
      })

      it('should handle last chunk with fewer elements', async () => {
        const expression = '$partition([1,2,3,4,5], 2)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([[1, 2], [3, 4], [5]])
      })

      it('should return undefined for empty array', async () => {
        const expression = '$partition([], 2)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toBeUndefined() // AWS returns undefined for empty array
      })

      it('should return undefined for non-array input', async () => {
        const expression = '$partition("not-an-array", 2)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toBeUndefined() // AWS returns undefined for invalid input
      })
    })

    describe('$range', () => {
      it('should generate ascending range with positive step', async () => {
        const expression = '$range(1, 5, 1)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([1, 2, 3, 4, 5]) // AWS includes the end value
      })

      it('should generate range with custom step', async () => {
        const expression = '$range(0, 10, 2)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([0, 2, 4, 6, 8, 10]) // AWS includes the end value
      })

      it('should generate descending range with negative step', async () => {
        const expression = '$range(10, 1, -2)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([10, 8, 6, 4, 2]) // AWS behavior
      })

      it('should require all three parameters', async () => {
        // AWS requires all 3 parameters - no default step
        const expression = '$range(2, 5, 1)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([2, 3, 4, 5])
      })

      it('should return single value when start equals end', async () => {
        const expression = '$range(5, 5, 1)'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual(5) // AWS returns single value, not array
      })
    })

    describe('$hash', () => {
      it('should generate SHA-256 hash by default', async () => {
        const expression = '$hash("hello")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        // Should be a valid SHA-256 hash (64 character hex string)
        expect(typeof result).toBe('string')
        expect(result).toHaveLength(64)
        expect(result).toMatch(/^[a-f0-9]{64}$/)
      })

      it('should generate hash with specified algorithm', async () => {
        const expression = '$hash("hello", "MD5")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        // Should be a valid MD5 hash (32 character hex string)
        expect(typeof result).toBe('string')
        expect(result).toHaveLength(32)
        expect(result).toMatch(/^[a-f0-9]{32}$/)
      })

      it('should hash JSON object', async () => {
        const expression = '$hash({"key": "value"})'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(typeof result).toBe('string')
        expect((result as string).length).toBe(64) // SHA-256 produces 64 char hex string
      })

      it('should handle SHA-1 algorithm', async () => {
        const expression = '$hash("test", "SHA-1")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        // Should be a valid SHA-1 hash (40 character hex string)
        expect(typeof result).toBe('string')
        expect(result).toHaveLength(40)
        expect(result).toMatch(/^[a-f0-9]{40}$/)
      })
    })

    describe('$random', () => {
      it('should generate random number between 0 and 1', async () => {
        const expression = '$random()'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(1)
      })

      it('should generate consistent result with same seed', async () => {
        const expression = '$random(42)'
        const result1 = await JSONataEvaluator.evaluate(expression, {})
        const result2 = await JSONataEvaluator.evaluate(expression, {})
        expect(result1).toBe(result2)
        expect(typeof result1).toBe('number')
        expect(result1).toBeGreaterThanOrEqual(0)
        expect(result1).toBeLessThan(1)
      })

      it('should generate different results with different seeds', async () => {
        const expr1 = '$random(42)'
        const expr2 = '$random(100)'
        const result1 = await JSONataEvaluator.evaluate(expr1, {})
        const result2 = await JSONataEvaluator.evaluate(expr2, {})
        expect(result1).not.toBe(result2)
      })
    })

    describe('$uuid', () => {
      it('should generate valid UUID v4', async () => {
        const expression = '$uuid()'
        const result = await JSONataEvaluator.evaluate(expression, {})

        // UUID v4 regex pattern
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        expect(result).toMatch(uuidPattern)
      })

      it('should generate unique UUIDs', async () => {
        const expression = '$uuid()'
        const result1 = await JSONataEvaluator.evaluate(expression, {})
        const result2 = await JSONataEvaluator.evaluate(expression, {})
        expect(result1).not.toBe(result2)
      })
    })

    describe('$parse', () => {
      it('should parse valid JSON string', async () => {
        const expression = '$parse("{\\"key\\": \\"value\\", \\"number\\": 42}")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual({ key: 'value', number: 42 })
      })

      it('should parse JSON array', async () => {
        const expression = '$parse("[1, 2, 3]")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual([1, 2, 3])
      })

      it('should return null for invalid JSON', async () => {
        const expression = '$parse("invalid json")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toBeNull()
      })

      it('should parse nested JSON objects', async () => {
        const expression = '$parse("{\\"nested\\": {\\"key\\": \\"value\\"}}")'
        const result = await JSONataEvaluator.evaluate(expression, {})
        expect(result).toEqual({ nested: { key: 'value' } })
      })
    })
  })

  describe('Expression wrapper detection', () => {
    it('should detect JSONata expression syntax', () => {
      expect(JSONataEvaluator.isJSONataExpression('{% $count(items) %}')).toBe(true)
      expect(JSONataEvaluator.isJSONataExpression('{% firstName & " " & lastName %}')).toBe(true)
      expect(JSONataEvaluator.isJSONataExpression('regular string')).toBe(false)
      expect(JSONataEvaluator.isJSONataExpression('{ not jsonata }')).toBe(false)
    })

    it('should detect inline JSONata expressions', () => {
      expect(JSONataEvaluator.isJSONataExpression('Hello {% name %} world')).toBe(true)
      expect(JSONataEvaluator.isJSONataExpression('No expressions here')).toBe(false)
    })
  })

  describe('$states variable integration', () => {
    it('should access input data through $states variable', async () => {
      const expression = '$states.input.firstName & " " & $states.input.lastName'
      const data = { firstName: 'John', lastName: 'Doe' }
      const bindings = {
        states: {
          input: data,
        },
      }

      const result = await JSONataEvaluator.evaluate(expression, data, bindings)
      expect(result).toBe('John Doe')
    })

    it('should access nested input data', async () => {
      const expression = '$states.input.user.profile.name'
      const data = {
        user: {
          profile: {
            name: 'Alice Smith',
          },
        },
      }
      const bindings = {
        states: {
          input: data,
        },
      }

      const result = await JSONataEvaluator.evaluate(expression, data, bindings)
      expect(result).toBe('Alice Smith')
    })

    it('should access array elements through $states', async () => {
      const expression = '$count($states.input.items)'
      const data = {
        items: [1, 2, 3, 4, 5],
      }
      const bindings = {
        states: {
          input: data,
        },
      }

      const result = await JSONataEvaluator.evaluate(expression, data, bindings)
      expect(result).toBe(5)
    })

    it('should perform complex calculations with $states', async () => {
      const expression = '$sum($states.input.items.price) * 1.1'
      const data = {
        items: [
          { name: 'item1', price: 10 },
          { name: 'item2', price: 20 },
          { name: 'item3', price: 15 },
        ],
      }
      const bindings = {
        states: {
          input: data,
        },
      }

      const result = await JSONataEvaluator.evaluate(expression, data, bindings)
      expect(result).toBeCloseTo(49.5, 10) // (10 + 20 + 15) * 1.1
    })
  })
})
