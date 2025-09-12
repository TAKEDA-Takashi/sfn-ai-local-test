import { describe, expect, it } from 'vitest'
import { DiffFormatter } from './diff-formatter'

describe('DiffFormatter', () => {
  describe('formatJsonDiff', () => {
    it('should format object diff with changed fields', () => {
      const expected = {
        accountId: '123456789012',
        region: 'us-east-1',
        status: 'active',
        executionId: 'execution-1757653509569',
        traceId: 'execution-1757653509569',
      }

      const actual = {
        accountId: '123456789012',
        region: 'us-east-1',
        status: 'active',
        executionId: 'execution-1757654166290',
        traceId: 'execution-1757654166290',
      }

      const diff = DiffFormatter.formatJsonDiff(expected, actual)

      expect(diff).toContain('Changed fields:')
      expect(diff).toContain('executionId:')
      expect(diff).toContain('- Expected: "execution-1757653509569"')
      expect(diff).toContain('+ Actual:   "execution-1757654166290"')
      expect(diff).toContain('traceId:')
      expect(diff).toContain('Unchanged fields:')
      expect(diff).toContain('accountId')
    })

    it('should format object diff with missing and extra fields', () => {
      const expected = {
        name: 'John',
        age: 30,
        city: 'Tokyo',
      }

      const actual = {
        name: 'John',
        age: 30,
        country: 'Japan',
      }

      const diff = DiffFormatter.formatJsonDiff(expected, actual)

      expect(diff).toContain('Missing fields (in actual):')
      expect(diff).toContain('- city: "Tokyo"')
      expect(diff).toContain('Extra fields (in actual):')
      expect(diff).toContain('+ country: "Japan"')
    })

    it('should format array diff', () => {
      const expected = ['a', 'b', 'c']
      const actual = ['a', 'x', 'c', 'd']

      const diff = DiffFormatter.formatJsonDiff(expected, actual)

      expect(diff).toContain('Array length: Expected 3, Actual 4')
      expect(diff).toContain('[1]:')
      expect(diff).toContain('- Expected: "b"')
      expect(diff).toContain('+ Actual:   "x"')
      expect(diff).toContain('[3] + "d" (extra)')
    })

    it('should format simple value diff', () => {
      const expected = 42
      const actual = 43

      const diff = DiffFormatter.formatJsonDiff(expected, actual)

      expect(diff).toBe('Expected: 42\nActual: 43')
    })
  })

  describe('formatCompactDiff', () => {
    it('should create compact diff for changed fields', () => {
      const expected = {
        status: 'pending',
        count: 10,
      }

      const actual = {
        status: 'completed',
        count: 15,
      }

      const compact = DiffFormatter.formatCompactDiff(expected, actual)

      expect(compact).toBe('status: "pending" → "completed", count: 10 → 15')
    })

    it('should show added fields in compact format', () => {
      const expected = { name: 'test' }
      const actual = { name: 'test', age: 25 }

      const compact = DiffFormatter.formatCompactDiff(expected, actual)

      expect(compact).toBe('Added: age')
    })

    it('should show missing fields in compact format', () => {
      const expected = { name: 'test', age: 25 }
      const actual = { name: 'test' }

      const compact = DiffFormatter.formatCompactDiff(expected, actual)

      expect(compact).toBe('Missing: age')
    })

    it('should handle simple values in compact format', () => {
      const expected = 'old'
      const actual = 'new'

      const compact = DiffFormatter.formatCompactDiff(expected, actual)

      expect(compact).toBe('"old" → "new"')
    })
  })
})
