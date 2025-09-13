import { describe, expect, it } from 'vitest'
import { EXECUTION_CONTEXT_DEFAULTS } from '../../../constants/execution-context'
import type { JsonValue } from '../../../types/asl'
import { JSONPathEvaluator } from './jsonpath'

describe('JSONPathEvaluator', () => {
  describe('Standard JSONPath', () => {
    it('should evaluate simple path', () => {
      const data = { name: 'John', age: 30 }
      const result = JSONPathEvaluator.evaluate('$.name', data)
      expect(result).toBe('John')
    })

    it('should evaluate nested path', () => {
      const data = { user: { profile: { name: 'Jane' } } }
      const result = JSONPathEvaluator.evaluate('$.user.profile.name', data)
      expect(result).toBe('Jane')
    })

    it('should evaluate array index', () => {
      const data = { items: ['a', 'b', 'c'] }
      const result = JSONPathEvaluator.evaluate('$.items[1]', data)
      expect(result).toBe('b')
    })
  })

  describe('States.Array', () => {
    it('should create array from arguments', () => {
      const data = { id: 123, name: 'test' }
      const result = JSONPathEvaluator.evaluate('States.Array($.id, $.name)', data)
      expect(result).toEqual([123, 'test'])
    })

    it('should handle mixed literal and path arguments', () => {
      const data = { value: 'dynamic' }
      const result = JSONPathEvaluator.evaluate('States.Array("literal", $.value, 42)', data)
      expect(result).toEqual(['literal', 'dynamic', 42])
    })

    it('should handle empty arguments', () => {
      const result = JSONPathEvaluator.evaluate('States.Array()', {})
      expect(result).toEqual([])
    })
  })

  describe('States.ArrayPartition', () => {
    it('should partition array into chunks', () => {
      const data = { array: [1, 2, 3, 4, 5, 6, 7] }
      const result = JSONPathEvaluator.evaluate('States.ArrayPartition($.array, 3)', data)
      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    })

    it('should handle empty array', () => {
      const data = { array: [] }
      const result = JSONPathEvaluator.evaluate('States.ArrayPartition($.array, 2)', data)
      expect(result).toEqual([])
    })

    it('should handle non-array input', () => {
      const data = { value: 'not-array' }
      const result = JSONPathEvaluator.evaluate('States.ArrayPartition($.value, 2)', data)
      expect(result).toEqual([])
    })
  })

  describe('States.ArrayContains', () => {
    it('should find value in array', () => {
      const data = { array: [1, 2, 3], search: 2 }
      const result = JSONPathEvaluator.evaluate('States.ArrayContains($.array, $.search)', data)
      expect(result).toBe(true)
    })

    it('should not find missing value', () => {
      const data = { array: [1, 2, 3], search: 5 }
      const result = JSONPathEvaluator.evaluate('States.ArrayContains($.array, $.search)', data)
      expect(result).toBe(false)
    })

    it('should handle object comparison', () => {
      const data = { array: [{ id: 1 }, { id: 2 }], search: { id: 2 } }
      const result = JSONPathEvaluator.evaluate('States.ArrayContains($.array, $.search)', data)
      expect(result).toBe(true)
    })

    it('should throw error for non-array input', () => {
      const data = { notArray: 'string', search: 's' }
      expect(() => {
        JSONPathEvaluator.evaluate('States.ArrayContains($.notArray, $.search)', data)
      }).toThrow('Invalid arguments in States.ArrayContains')
    })
  })

  describe('States.ArrayRange', () => {
    it('should generate ascending range', () => {
      const result = JSONPathEvaluator.evaluate('States.ArrayRange(1, 5, 1)', {})
      expect(result).toEqual([1, 2, 3, 4])
    })

    it('should generate range with step', () => {
      const result = JSONPathEvaluator.evaluate('States.ArrayRange(0, 10, 2)', {})
      expect(result).toEqual([0, 2, 4, 6, 8])
    })

    it('should generate descending range', () => {
      const result = JSONPathEvaluator.evaluate('States.ArrayRange(5, 1, -1)', {})
      expect(result).toEqual([5, 4, 3, 2])
    })

    it('should round non-integer values', () => {
      const result = JSONPathEvaluator.evaluate('States.ArrayRange(1.5, 5.7, 1.2)', {})
      expect(result).toEqual([2, 3, 4, 5])
    })

    it('should throw error for too many elements', () => {
      expect(() => {
        JSONPathEvaluator.evaluate('States.ArrayRange(1, 2000, 1)', {})
      }).toThrow('cannot generate more than 1000 elements')
    })
  })

  describe('States.ArrayGetItem', () => {
    it('should get item at index', () => {
      const data = { array: ['a', 'b', 'c'], index: 1 }
      const result = JSONPathEvaluator.evaluate('States.ArrayGetItem($.array, $.index)', data)
      expect(result).toBe('b')
    })

    it('should handle $ as array reference', () => {
      const data = ['first', 'second', 'third']
      const result = JSONPathEvaluator.evaluate('States.ArrayGetItem($, 0)', data)
      expect(result).toBe('first')
    })

    it('should handle $ in nested functions', () => {
      const data = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]
      const result = JSONPathEvaluator.evaluate('States.ArrayGetItem($, 1)', data)
      expect(result).toEqual({ id: 2, name: 'b' })
    })

    it('should throw error for out of bounds index', () => {
      const data = { array: ['a', 'b'], index: 5 }
      expect(() => {
        JSONPathEvaluator.evaluate('States.ArrayGetItem($.array, $.index)', data)
      }).toThrow('Invalid arguments in States.ArrayGetItem')
    })

    it('should throw error for negative index', () => {
      const data = { array: ['a', 'b', 'c'], index: -1 }
      expect(() => {
        JSONPathEvaluator.evaluate('States.ArrayGetItem($.array, $.index)', data)
      }).toThrow('Invalid arguments in States.ArrayGetItem')
    })

    it('should round non-integer index', () => {
      const data = { array: ['a', 'b', 'c'], index: 1.7 }
      const result = JSONPathEvaluator.evaluate('States.ArrayGetItem($.array, $.index)', data)
      expect(result).toBe('c') // 1.7 rounds to 2
    })
  })

  describe('States.ArrayLength', () => {
    it('should return array length', () => {
      const data = { array: [1, 2, 3, 4, 5] }
      const result = JSONPathEvaluator.evaluate('States.ArrayLength($.array)', data)
      expect(result).toBe(5)
    })

    it('should return 0 for empty array', () => {
      const data = { array: [] }
      const result = JSONPathEvaluator.evaluate('States.ArrayLength($.array)', data)
      expect(result).toBe(0)
    })

    it('should return 0 for non-array', () => {
      const data = { value: 'not-array' }
      const result = JSONPathEvaluator.evaluate('States.ArrayLength($.value)', data)
      expect(result).toBe(0)
    })
  })

  describe('States.ArrayUnique', () => {
    it('should remove duplicate primitives', () => {
      const data = { array: [1, 2, 2, 3, 3, 3, 4] }
      const result = JSONPathEvaluator.evaluate('States.ArrayUnique($.array)', data)
      expect(result).toEqual([1, 2, 3, 4])
    })

    it('should remove duplicate objects', () => {
      const data = { array: [{ id: 1 }, { id: 2 }, { id: 1 }] }
      const result = JSONPathEvaluator.evaluate('States.ArrayUnique($.array)', data)
      expect(result).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('should handle empty array', () => {
      const data = { array: [] }
      const result = JSONPathEvaluator.evaluate('States.ArrayUnique($.array)', data)
      expect(result).toEqual([])
    })
  })

  describe('States.Base64Encode', () => {
    it('should encode string', () => {
      const data = { text: 'Hello World' }
      const result = JSONPathEvaluator.evaluate('States.Base64Encode($.text)', data)
      expect(result).toBe('SGVsbG8gV29ybGQ=')
    })

    it('should encode JSON object as string', () => {
      const data = { obj: { key: 'value' } }
      const result = JSONPathEvaluator.evaluate('States.Base64Encode($.obj)', data)
      const decoded = Buffer.from(result as string, 'base64').toString()
      expect(decoded).toBe('{"key":"value"}')
    })
  })

  describe('States.Base64Decode', () => {
    it('should decode base64 string', () => {
      const data = { encoded: 'SGVsbG8gV29ybGQ=' }
      const result = JSONPathEvaluator.evaluate('States.Base64Decode($.encoded)', data)
      expect(result).toBe('Hello World')
    })
  })

  describe('States.Hash', () => {
    it('should calculate SHA-256 hash', () => {
      const data = { text: 'test' }
      const result = JSONPathEvaluator.evaluate('States.Hash($.text, "SHA-256")', data)
      expect(result).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
    })

    it('should calculate MD5 hash', () => {
      const data = { text: 'test' }
      const result = JSONPathEvaluator.evaluate('States.Hash($.text, "MD5")', data)
      expect(result).toBe('098f6bcd4621d373cade4e832627b4f6')
    })

    it('should handle SHA-1', () => {
      const data = { text: 'test' }
      const result = JSONPathEvaluator.evaluate('States.Hash($.text, "SHA-1")', data)
      expect(result).toBe('a94a8fe5ccb19ba61c4c0873d391e987982fbbd3')
    })

    it('should throw error for invalid algorithm', () => {
      const data = { text: 'test' }
      expect(() => {
        JSONPathEvaluator.evaluate('States.Hash($.text, "INVALID")', data)
      }).toThrow('Invalid hash algorithm')
    })
  })

  describe('States.JsonMerge', () => {
    it('should shallow merge objects', () => {
      const data = {
        obj1: { a: 1, b: 2 },
        obj2: { b: 3, c: 4 },
      }
      const result = JSONPathEvaluator.evaluate('States.JsonMerge($.obj1, $.obj2, false)', data)
      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('should merge array elements using ArrayGetItem with $', () => {
      // This is the actual use case from the production workflow
      const data: JsonValue = [
        { initialize: true, control_tower: false },
        { management_account: true, organization_id: 'o-123' },
      ]
      const result = JSONPathEvaluator.evaluate(
        'States.JsonMerge(States.ArrayGetItem($, 0), States.ArrayGetItem($, 1), false)',
        data,
      )
      expect(result).toEqual({
        initialize: true,
        control_tower: false,
        management_account: true,
        organization_id: 'o-123',
      })
    })

    it('should override nested objects in shallow merge', () => {
      const data = {
        obj1: { a: { x: 1, y: 2 }, b: 2 },
        obj2: { a: { z: 3 }, c: 4 },
      }
      const result = JSONPathEvaluator.evaluate('States.JsonMerge($.obj1, $.obj2, false)', data)
      expect(result).toEqual({ a: { z: 3 }, b: 2, c: 4 })
    })

    it('should throw error for deep merge', () => {
      const data = { obj1: {}, obj2: {} }
      expect(() => {
        JSONPathEvaluator.evaluate('States.JsonMerge($.obj1, $.obj2, true)', data)
      }).toThrow('Deep merge is not supported')
    })
  })

  describe('States.StringToJson', () => {
    it('should parse JSON string', () => {
      const data = { jsonStr: '{"key":"value","num":42}' }
      const result = JSONPathEvaluator.evaluate('States.StringToJson($.jsonStr)', data)
      expect(result).toEqual({ key: 'value', num: 42 })
    })

    it('should throw error for invalid JSON', () => {
      const data = { jsonStr: 'not-json' }
      expect(() => {
        JSONPathEvaluator.evaluate('States.StringToJson($.jsonStr)', data)
      }).toThrow('Invalid JSON string')
    })
  })

  describe('States.JsonToString', () => {
    it('should stringify object', () => {
      const data = { obj: { key: 'value', num: 42 } }
      const result = JSONPathEvaluator.evaluate('States.JsonToString($.obj)', data)
      expect(result).toBe('{"key":"value","num":42}')
    })

    it('should stringify array', () => {
      const data = { array: [1, 2, 3] }
      const result = JSONPathEvaluator.evaluate('States.JsonToString($.array)', data)
      expect(result).toBe('[1,2,3]')
    })
  })

  describe('States.MathRandom', () => {
    it('should generate random number in range', () => {
      const result = JSONPathEvaluator.evaluate('States.MathRandom(1, 10)', {})
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThan(10)
    })

    it('should generate consistent number with seed', () => {
      const result1 = JSONPathEvaluator.evaluate('States.MathRandom(1, 100, 42)', {})
      const result2 = JSONPathEvaluator.evaluate('States.MathRandom(1, 100, 42)', {})
      expect(result1).toBe(result2)
    })

    it('should round non-integer bounds', () => {
      const result = JSONPathEvaluator.evaluate('States.MathRandom(1.5, 10.7)', {})
      expect(result).toBeGreaterThanOrEqual(2)
      expect(result).toBeLessThan(11)
    })
  })

  describe('States.MathAdd', () => {
    it('should add positive numbers', () => {
      const data = { a: 10, b: 20 }
      const result = JSONPathEvaluator.evaluate('States.MathAdd($.a, $.b)', data)
      expect(result).toBe(30)
    })

    it('should handle negative numbers', () => {
      const data = { a: 10, b: -5 }
      const result = JSONPathEvaluator.evaluate('States.MathAdd($.a, $.b)', data)
      expect(result).toBe(5)
    })

    it('should round non-integer values', () => {
      const data = { a: 10.7, b: 5.3 }
      const result = JSONPathEvaluator.evaluate('States.MathAdd($.a, $.b)', data)
      expect(result).toBe(16)
    })

    it('should throw error for overflow', () => {
      expect(() => {
        JSONPathEvaluator.evaluate('States.MathAdd(2147483647, 1)', {})
      }).toThrow('exceeds integer range')
    })
  })

  describe('States.StringSplit', () => {
    it('should split string by delimiter', () => {
      const data = { str: 'a,b,c,d', delim: ',' }
      const result = JSONPathEvaluator.evaluate('States.StringSplit($.str, $.delim)', data)
      expect(result).toEqual(['a', 'b', 'c', 'd'])
    })

    it('should handle multiple character delimiters', () => {
      const data = { str: 'a.b,c+d', delim: '.,+' }
      const result = JSONPathEvaluator.evaluate('States.StringSplit($.str, $.delim)', data)
      expect(result).toEqual(['a', 'b', 'c', 'd'])
    })

    it('should handle double character delimiter correctly', () => {
      const data = { str: 'one::two::three', delim: '::' }
      const result = JSONPathEvaluator.evaluate('States.StringSplit($.str, $.delim)', data)
      expect(result).toEqual(['one', 'two', 'three'])
    })

    it('should handle inline string literals with single quotes', () => {
      const result = JSONPathEvaluator.evaluate("States.StringSplit('one::two::three', '::')", {})
      expect(result).toEqual(['one', 'two', 'three'])
    })

    it('should throw error for non-string input', () => {
      const data = { value: 123, delim: ',' }
      expect(() => {
        JSONPathEvaluator.evaluate('States.StringSplit($.value, $.delim)', data)
      }).toThrow('requires a string')
    })
  })

  describe('States.Format', () => {
    it('should format string with placeholders', () => {
      const data = { a: 'hello', b: 'world' }
      const result = JSONPathEvaluator.evaluate('States.Format("{} {}", $.a, $.b)', data)
      expect(result).toBe('hello world')
    })

    it('should handle multiple placeholders', () => {
      const result = JSONPathEvaluator.evaluate('States.Format("{}-{}-{}", "a", "b", "c")', {})
      expect(result).toBe('a-b-c')
    })

    it('should convert non-strings to string', () => {
      const data = { num: 42, bool: true }
      const result = JSONPathEvaluator.evaluate(
        'States.Format("Number: {}, Boolean: {}", $.num, $.bool)',
        data,
      )
      expect(result).toBe('Number: 42, Boolean: true')
    })
  })

  describe('States.UUID', () => {
    it('should generate fixed UUID for deterministic testing', () => {
      const result = JSONPathEvaluator.evaluate('States.UUID()', {})
      // Now returns fixed UUID for deterministic testing
      expect(result).toBe(EXECUTION_CONTEXT_DEFAULTS.FIXED_UUID)
    })

    it('should return same UUID for multiple calls (deterministic mode)', () => {
      const result1 = JSONPathEvaluator.evaluate('States.UUID()', {})
      const result2 = JSONPathEvaluator.evaluate('States.UUID()', {})
      // In deterministic mode, returns same UUID
      // TODO: In future, implement counter for unique but predictable UUIDs
      expect(result1).toBe(result2)
      expect(result1).toBe(EXECUTION_CONTEXT_DEFAULTS.FIXED_UUID)
    })
  })

  describe('Nested intrinsic functions', () => {
    it('should handle nested function calls', () => {
      const data = { array: [1, 2, 3, 4, 5] }
      // States.ArrayGetItem(States.ArrayPartition($.array, 2), 1)
      const result = JSONPathEvaluator.evaluate(
        'States.ArrayGetItem(States.ArrayPartition($.array, 2), 1)',
        data,
      )
      expect(result).toEqual([3, 4])
    })

    it('should handle complex nested functions', () => {
      const data = { str: 'a,b,c' }
      // States.ArrayLength(States.StringSplit($.str, ","))
      const result = JSONPathEvaluator.evaluate(
        'States.ArrayLength(States.StringSplit($.str, ","))',
        data,
      )
      expect(result).toBe(3)
    })
  })
})
