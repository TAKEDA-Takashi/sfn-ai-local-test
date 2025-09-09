import { describe, expect, it } from 'vitest'
import { DataFlowHelpers } from './data-flow-helpers'

describe('DataFlowHelpers', () => {
  describe('extractVariableReferences', () => {
    it('should extract simple variable references', () => {
      const expression = '$myVariable'
      const references = DataFlowHelpers.extractVariableReferences(expression)
      expect(references).toEqual(['$myVariable'])
    })

    it('should extract multiple variable references', () => {
      const expression = '$var1 + $var2 - $var3'
      const references = DataFlowHelpers.extractVariableReferences(expression)
      expect(references).toEqual(['$var1', '$var2', '$var3'])
    })

    it('should extract $states.result references', () => {
      const expression = '$states.result.Payload.data'
      const references = DataFlowHelpers.extractVariableReferences(expression)
      expect(references).toEqual(['$states.result.Payload.data'])
    })

    it('should extract $states.input references', () => {
      const expression = '$states.input.userId + $states.input.items.length'
      const references = DataFlowHelpers.extractVariableReferences(expression)
      expect(references).toEqual(['$states.input.userId', '$states.input.items.length'])
    })

    it('should handle mixed references', () => {
      const expression = '$count + $states.result.total + $states.input.value'
      const references = DataFlowHelpers.extractVariableReferences(expression)
      expect(references).toEqual(['$states.result.total', '$states.input.value', '$count'])
    })

    it('should handle empty string', () => {
      const references = DataFlowHelpers.extractVariableReferences('')
      expect(references).toEqual([])
    })
  })

  describe('extractFieldFromPath', () => {
    it('should extract field from simple path', () => {
      expect(DataFlowHelpers.extractFieldFromPath('$.field')).toBe('field')
      expect(DataFlowHelpers.extractFieldFromPath('$.userId')).toBe('userId')
    })

    it('should extract first field from nested path', () => {
      expect(DataFlowHelpers.extractFieldFromPath('$.user.name')).toBe('user')
      expect(DataFlowHelpers.extractFieldFromPath('$.data.items.length')).toBe('data')
    })

    it('should handle path without dot', () => {
      expect(DataFlowHelpers.extractFieldFromPath('$field')).toBe('field')
    })

    it('should return null for invalid paths', () => {
      expect(DataFlowHelpers.extractFieldFromPath('')).toBeNull()
      expect(DataFlowHelpers.extractFieldFromPath('field')).toBeNull()
      expect(DataFlowHelpers.extractFieldFromPath('$[0]')).toBeNull()
      expect(DataFlowHelpers.extractFieldFromPath('$.')).toBeNull()
    })
  })

  describe('generateSampleValue', () => {
    it('should generate email for email fields', () => {
      expect(DataFlowHelpers.generateSampleValue('email')).toBe('user@example.com')
      expect(DataFlowHelpers.generateSampleValue('userEmail')).toBe('user@example.com')
      expect(DataFlowHelpers.generateSampleValue('emailAddress')).toBe('user@example.com')
    })

    it('should generate bucket name for bucket fields', () => {
      expect(DataFlowHelpers.generateSampleValue('bucket')).toBe('my-bucket')
      expect(DataFlowHelpers.generateSampleValue('bucketName')).toBe('my-bucket')
      expect(DataFlowHelpers.generateSampleValue('s3Bucket')).toBe('my-bucket')
    })

    it('should generate ID values for ID fields', () => {
      expect(DataFlowHelpers.generateSampleValue('id')).toBe('id-001')
      expect(DataFlowHelpers.generateSampleValue('userId')).toBe('userId-001')
      expect(DataFlowHelpers.generateSampleValue('customerId')).toBe('customerId-001')
    })

    it('should generate numbers for count/amount fields', () => {
      expect(DataFlowHelpers.generateSampleValue('count')).toBe(100)
      expect(DataFlowHelpers.generateSampleValue('amount')).toBe(100)
      expect(DataFlowHelpers.generateSampleValue('total')).toBe(100)
      expect(DataFlowHelpers.generateSampleValue('price')).toBe(100)
      expect(DataFlowHelpers.generateSampleValue('quantity')).toBe(100)
    })

    it('should generate booleans for flag/enabled fields', () => {
      expect(DataFlowHelpers.generateSampleValue('enabled')).toBe(true)
      expect(DataFlowHelpers.generateSampleValue('isActive')).toBe(true)
      expect(DataFlowHelpers.generateSampleValue('processed')).toBe(true)
      expect(DataFlowHelpers.generateSampleValue('hasCompleted')).toBe(true)
    })

    it('should generate status values for status fields', () => {
      expect(DataFlowHelpers.generateSampleValue('status')).toBe('active')
      expect(DataFlowHelpers.generateSampleValue('state')).toBe('active')
    })

    it('should generate ISO date for date/time fields', () => {
      const value = DataFlowHelpers.generateSampleValue('date') as string
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const timestamp = DataFlowHelpers.generateSampleValue('timestamp') as string
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should generate default value for unknown fields', () => {
      expect(DataFlowHelpers.generateSampleValue('unknownField')).toBe('unknownField-value')
      expect(DataFlowHelpers.generateSampleValue('randomName')).toBe('Sample randomName')
    })
  })

  describe('createNestedSampleObject', () => {
    it('should create nested object from dot notation', () => {
      const result = DataFlowHelpers.createNestedSampleObject('user.name')
      expect(result).toEqual({
        user: {
          name: 'Sample name',
        },
      })
    })

    it('should handle deep nesting', () => {
      const result = DataFlowHelpers.createNestedSampleObject('data.user.profile.email')
      expect(result).toEqual({
        data: {
          user: {
            profile: {
              email: 'user@example.com',
            },
          },
        },
      })
    })

    it('should handle single level', () => {
      const result = DataFlowHelpers.createNestedSampleObject('status')
      expect(result).toEqual({
        status: 'active',
      })
    })
  })

  describe('deduplicateRequirements', () => {
    it('should remove duplicate requirements', () => {
      const requirements = [
        { field: 'userId', type: 'string' as const, required: true },
        { field: 'userId', type: 'string' as const, required: true },
        { field: 'count', type: 'number' as const, required: true },
      ]

      const result = DataFlowHelpers.deduplicateRequirements(requirements)
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.field)).toEqual(['userId', 'count'])
    })

    it('should prefer specific type over any', () => {
      const requirements = [
        { field: 'userId', type: 'any' as const, required: true },
        { field: 'userId', type: 'string' as const, required: true },
      ]

      const result = DataFlowHelpers.deduplicateRequirements(requirements)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        field: 'userId',
        type: 'string',
      })
    })

    it('should prefer requirement with example', () => {
      const requirements = [
        { field: 'status', type: 'string' as const, required: true },
        { field: 'status', type: 'string' as const, required: true, example: 'active' },
      ]

      const result = DataFlowHelpers.deduplicateRequirements(requirements)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        field: 'status',
        type: 'string',
        example: 'active',
      })
    })

    it('should handle empty array', () => {
      const result = DataFlowHelpers.deduplicateRequirements([])
      expect(result).toEqual([])
    })
  })

  describe('isLikelyArrayField', () => {
    it('should identify array-like field names', () => {
      expect(DataFlowHelpers.isLikelyArrayField('items')).toBe(true)
      expect(DataFlowHelpers.isLikelyArrayField('accounts')).toBe(true)
      expect(DataFlowHelpers.isLikelyArrayField('userList')).toBe(true)
      expect(DataFlowHelpers.isLikelyArrayField('dataArray')).toBe(true)
      expect(DataFlowHelpers.isLikelyArrayField('targets')).toBe(true)
      expect(DataFlowHelpers.isLikelyArrayField('entries')).toBe(true)
      expect(DataFlowHelpers.isLikelyArrayField('users')).toBe(true) // plural
    })

    it('should not identify non-array field names', () => {
      expect(DataFlowHelpers.isLikelyArrayField('user')).toBe(false)
      expect(DataFlowHelpers.isLikelyArrayField('status')).toBe(true) // ends with 's'
      expect(DataFlowHelpers.isLikelyArrayField('count')).toBe(false)
      expect(DataFlowHelpers.isLikelyArrayField('enabled')).toBe(false)
    })
  })

  describe('generateSampleValueForFieldType', () => {
    it('should generate value based on field type', () => {
      expect(DataFlowHelpers.generateSampleValueForFieldType('email', 'string')).toBe(
        'user@example.com',
      )
      expect(DataFlowHelpers.generateSampleValueForFieldType('count', 'number')).toBe(1)
      expect(DataFlowHelpers.generateSampleValueForFieldType('enabled', 'boolean')).toBe(true)
      expect(DataFlowHelpers.generateSampleValueForFieldType('items', 'array')).toEqual([
        'item1',
        'item2',
        'item3',
      ])
      expect(DataFlowHelpers.generateSampleValueForFieldType('data', 'object')).toEqual({
        data: 'value',
      })
    })

    it('should fallback to generateSampleValue for any type', () => {
      const result = DataFlowHelpers.generateSampleValueForFieldType('unknownField', 'any')
      expect(result).toBe('unknownField-value')
    })
  })

  describe('Type-specific sample value generators', () => {
    describe('generateSampleStringValue', () => {
      it('should generate appropriate string values', () => {
        expect(DataFlowHelpers.generateSampleStringValue('month')).toBe('2025-01')
        expect(DataFlowHelpers.generateSampleStringValue('accountId')).toBe('123456789012')
        expect(DataFlowHelpers.generateSampleStringValue('bucket')).toBe('sample-bucket')
        expect(DataFlowHelpers.generateSampleStringValue('email')).toBe('user@example.com')
        expect(DataFlowHelpers.generateSampleStringValue('other')).toBe('sample-other')
      })
    })

    describe('generateSampleNumberValue', () => {
      it('should generate appropriate number values', () => {
        expect(DataFlowHelpers.generateSampleNumberValue('count')).toBe(1)
        expect(DataFlowHelpers.generateSampleNumberValue('size')).toBe(1)
        expect(DataFlowHelpers.generateSampleNumberValue('year')).toBe(2025)
        expect(DataFlowHelpers.generateSampleNumberValue('amount')).toBe(100)
        expect(DataFlowHelpers.generateSampleNumberValue('total')).toBe(100)
        expect(DataFlowHelpers.generateSampleNumberValue('other')).toBe(42)
      })
    })

    describe('generateSampleBooleanValue', () => {
      it('should generate appropriate boolean values', () => {
        expect(DataFlowHelpers.generateSampleBooleanValue('notify')).toBe(true)
        expect(DataFlowHelpers.generateSampleBooleanValue('enabled')).toBe(true)
        expect(DataFlowHelpers.generateSampleBooleanValue('skip')).toBe(false)
        expect(DataFlowHelpers.generateSampleBooleanValue('disabled')).toBe(false)
        expect(DataFlowHelpers.generateSampleBooleanValue('other')).toBe(true)
      })
    })

    describe('generateSampleArrayValue', () => {
      it('should generate appropriate array values', () => {
        expect(DataFlowHelpers.generateSampleArrayValue('accounts')).toEqual([
          '123456789012',
          '234567890123',
        ])
        expect(DataFlowHelpers.generateSampleArrayValue('items')).toEqual([
          'item1',
          'item2',
          'item3',
        ])
        expect(DataFlowHelpers.generateSampleArrayValue('list')).toEqual([
          'item1',
          'item2',
          'item3',
        ])
        expect(DataFlowHelpers.generateSampleArrayValue('other')).toEqual(['other-1', 'other-2'])
      })
    })
  })

  describe('extractFieldsFromPattern', () => {
    it('should extract fields using regex pattern and update requirements', () => {
      const requirements: any[] = []
      const sampleInput = {}
      const pattern = /\$\.([a-zA-Z_][a-zA-Z0-9_]*)/g
      const expression = '$.userId + $.count'

      DataFlowHelpers.extractFieldsFromPattern(
        pattern,
        expression,
        requirements,
        sampleInput,
        'test',
      )

      expect(requirements).toHaveLength(2)
      expect(requirements[0]).toMatchObject({
        field: 'userId',
        type: 'any',
        required: true,
        description: 'Referenced in test',
      })
      expect(requirements[1]).toMatchObject({
        field: 'count',
        type: 'any',
        required: true,
        description: 'Referenced in test',
      })
      expect(sampleInput).toMatchObject({
        userId: 'userId-001',
        count: 100,
      })
    })

    it('should handle nested field paths', () => {
      const requirements: any[] = []
      const sampleInput = {}
      const pattern = /\$\.([a-zA-Z_][a-zA-Z0-9_.]*)/g
      const expression = '$.user.email'

      DataFlowHelpers.extractFieldsFromPattern(
        pattern,
        expression,
        requirements,
        sampleInput,
        'test',
      )

      expect(requirements).toHaveLength(1)
      expect(requirements[0].field).toBe('user')
      // Check that a nested structure was created
      expect(sampleInput).toHaveProperty('user')
      expect((sampleInput as any).user).toHaveProperty('user')
      expect((sampleInput as any).user.user).toHaveProperty('email', 'user@example.com')
    })

    it('should not add duplicate fields', () => {
      const requirements: any[] = []
      const sampleInput = { userId: 'existing' }
      const pattern = /\$\.([a-zA-Z_][a-zA-Z0-9_]*)/g
      const expression = '$.userId'

      DataFlowHelpers.extractFieldsFromPattern(
        pattern,
        expression,
        requirements,
        sampleInput,
        'test',
      )

      expect(requirements).toHaveLength(1)
      expect(sampleInput.userId).toBe('existing') // Should not overwrite
    })
  })
})
