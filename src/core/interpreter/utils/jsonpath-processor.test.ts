import { describe, expect, it } from 'vitest'
import { JSONPathProcessor } from './jsonpath-processor'

describe('JSONPathProcessor', () => {
  describe('processEntry', () => {
    it('should process regular key without JSONPath suffix', () => {
      const result = JSONPathProcessor.processEntry('regularKey', 'value', { test: 'data' })
      expect(result.key).toBe('regularKey')
      expect(result.value).toBe('value')
    })

    it('should process key with JSONPath suffix', () => {
      const data = { field: 'extracted' }
      const result = JSONPathProcessor.processEntry('myKey.$', '$.field', data)
      expect(result.key).toBe('myKey')
      expect(result.value).toBe('extracted')
    })

    it('should handle non-string value with JSONPath suffix', () => {
      const result = JSONPathProcessor.processEntry('myKey.$', 42, { test: 'data' })
      expect(result.key).toBe('myKey')
      expect(result.value).toBe(42)
    })
  })

  describe('processEntries', () => {
    it('should process multiple entries with mixed JSONPath patterns', () => {
      const entries = {
        regular: 'value1',
        'extracted.$': '$.field',
        another: 'value2',
      }
      const data = { field: 'extracted_value' }

      const result = JSONPathProcessor.processEntries(entries, data)

      expect(result).toEqual({
        regular: 'value1',
        extracted: 'extracted_value',
        another: 'value2',
      })
    })
  })
})
