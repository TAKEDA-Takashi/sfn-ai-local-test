import { describe, expect, it } from 'vitest'
import type { ItemReader } from '../../types/asl'
import { ItemReaderValidator } from './item-reader-validator'

describe('ItemReaderValidator', () => {
  describe('S3 ListObjectsV2 validation', () => {
    const itemReader: ItemReader = {
      Resource: 'arn:aws:states:::s3:listObjectsV2',
      Parameters: {
        Bucket: 'my-bucket',
        Prefix: 'data/',
      },
    }

    it('should validate correct S3 object list format', () => {
      const mockData = [
        { Key: 'data/file1.json', Size: 1024 },
        { Key: 'data/file2.json', Size: 2048 },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toHaveLength(2)
      expect((result.data as any)[0]).toHaveProperty('ETag')
      expect((result.data as any)[0]).toHaveProperty('LastModified')
      expect((result.data as any)[0]).toHaveProperty('StorageClass')
    })

    it('should reject invalid S3 object list', () => {
      const mockData = [
        { name: 'file1.json' }, // Missing 'Key' field
        { Key: 'file2.json' },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Item 0: Missing required field 'Key'")
    })

    it('should validate prefix matching', () => {
      const mockData = [
        { Key: 'data/file1.json' },
        { Key: 'other/file2.json' }, // Wrong prefix
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Item 1: Key 'other/file2.json' doesn't match prefix 'data/'")
    })

    it('should apply MaxItems limit', () => {
      const mockData = Array.from({ length: 10 }, (_, i) => ({
        Key: `data/file${i}.json`,
      }))

      const limitedReader: ItemReader = {
        ...itemReader,
        ReaderConfig: {
          ...itemReader.ReaderConfig,
          MaxItems: 5,
        },
      }

      const result = ItemReaderValidator.validateAndTransform(mockData, limitedReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toHaveLength(5)
    })

    it('should reject non-array data', () => {
      const mockData = { Key: 'data/file.json' }

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('S3 ListObjectsV2 mock data must be an array')
    })
  })

  describe('CSV data validation', () => {
    const itemReader: ItemReader = {
      Resource: 'arn:aws:states:::s3:getObject',
      ReaderConfig: {
        InputType: 'CSV',
        CSVHeaderLocation: 'GIVEN',
        CSVHeaders: ['id', 'name', 'age'],
      },
    }

    it('should validate correct CSV format', () => {
      const mockData = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', age: 25 },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toEqual(mockData)
    })

    it('should add missing CSV columns with empty strings', () => {
      const mockData = [
        { id: '1', name: 'Alice' }, // Missing 'age'
        { id: '2', age: 25 }, // Missing 'name'
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false) // Has errors but still transforms
      expect(result.errors).toHaveLength(2)
      expect((result.data as any)[0]).toEqual({ id: '1', name: 'Alice', age: '' })
      expect((result.data as any)[1]).toEqual({ id: '2', name: '', age: 25 })
    })

    it('should remove extra columns not in CSVHeaders', () => {
      const mockData = [{ id: '1', name: 'Alice', age: 30, extra: 'field' }]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect((result.data as any)[0]).toEqual({ id: '1', name: 'Alice', age: 30 })
      expect((result.data as any)[0]).not.toHaveProperty('extra')
    })

    it('should reject non-array CSV data', () => {
      const mockData = 'not an array'

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('CSV mock data must be an array of objects')
    })
  })

  describe('JSON data validation', () => {
    const itemReader: ItemReader = {
      Resource: 'arn:aws:states:::s3:getObject',
      ReaderConfig: {
        InputType: 'JSON',
      },
    }

    it('should validate JSON array', () => {
      const mockData = [
        { id: 1, data: 'item1' },
        { id: 2, data: 'item2' },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toEqual(mockData)
    })

    it('should reject non-array JSON data', () => {
      const mockData = { id: 1, data: 'single object' }

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('JSON mock data for ItemReader must be an array')
    })
  })

  describe('JSONL data validation', () => {
    const itemReader: ItemReader = {
      Resource: 'arn:aws:states:::s3:getObject',
      ReaderConfig: {
        InputType: 'JSONL',
      },
    }

    it('should validate JSONL array format', () => {
      const mockData = [
        { line: 1, content: 'first' },
        { line: 2, content: 'second' },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toEqual(mockData)
    })

    it('should reject non-object items in JSONL', () => {
      const mockData = [
        { line: 1, content: 'first' },
        'string value', // Not an object
        null, // Not an object
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Line 1: Must be a valid JSON object')
      expect(result.errors).toContain('Line 2: Must be a valid JSON object')
    })
  })

  describe('Manifest data validation', () => {
    const itemReader: ItemReader = {
      Resource: 'arn:aws:states:::s3:getObject',
      ReaderConfig: {
        InputType: 'MANIFEST',
      },
    }

    it('should validate manifest format', () => {
      const mockData = [
        { Bucket: 'my-bucket', Key: 'object1.json' },
        { Bucket: 'my-bucket', Key: 'object2.json', Size: 1024 },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toHaveLength(2)
      expect((result.data as any)[0]).toHaveProperty('LastModifiedDate')
      expect((result.data as any)[0]).toHaveProperty('IsMultipartUploaded', false)
    })

    it('should reject manifest without required fields', () => {
      const mockData = [
        { Key: 'object1.json' }, // Missing Bucket
        { Bucket: 'my-bucket' }, // Missing Key
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Item 0: Missing required field 'Bucket'")
      expect(result.errors).toContain("Item 1: Missing required field 'Key'")
    })
  })

  describe('DynamoDB data validation', () => {
    const itemReader: ItemReader = {
      Resource: 'arn:aws:states:::dynamodb:scan',
      Parameters: {
        TableName: 'MyTable',
      },
    }

    it('should validate DynamoDB items array', () => {
      const mockData = [
        { id: 'item1', data: 'value1' },
        { id: 'item2', data: 'value2' },
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect(result.data as any).toEqual(mockData)
    })

    it('should reject non-object DynamoDB items', () => {
      const mockData = [{ id: 'item1' }, 'not an object', null]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Item 1: Must be a valid object')
      expect(result.errors).toContain('Item 2: Must be a valid object')
    })
  })

  describe('Format compatibility check', () => {
    it('should check format compatibility', () => {
      const s3Reader: ItemReader = {
        Resource: 'arn:aws:states:::s3:listObjectsV2',
      }

      const validData = [{ Key: 'file.json' }]
      const invalidData = { notAnArray: true }

      expect(ItemReaderValidator.isCompatibleFormat(validData, s3Reader)).toBe(true)
      expect(ItemReaderValidator.isCompatibleFormat(invalidData, s3Reader)).toBe(false)
    })
  })

  describe('Expected format description', () => {
    it('should provide helpful format descriptions', () => {
      const s3ListReader: ItemReader = {
        Resource: 'arn:aws:states:::s3:listObjectsV2',
      }

      expect(ItemReaderValidator.getExpectedFormat(s3ListReader)).toContain(
        'Array of S3 objects with fields: Key (required)',
      )

      const csvReader: ItemReader = {
        Resource: 'arn:aws:states:::s3:getObject',
        ReaderConfig: {
          InputType: 'CSV',
          CSVHeaders: ['id', 'name'],
        },
      }

      expect(ItemReaderValidator.getExpectedFormat(csvReader)).toContain(
        'Array of objects with CSV columns: id, name',
      )

      const jsonlReader: ItemReader = {
        Resource: 'arn:aws:states:::s3:getObject',
        ReaderConfig: {
          InputType: 'JSONL',
        },
      }

      expect(ItemReaderValidator.getExpectedFormat(jsonlReader)).toContain(
        'Array of JSON objects (one per line)',
      )
    })
  })

  describe('Case-insensitive field names', () => {
    it('should handle case variations in field names', () => {
      const itemReader: ItemReader = {
        Resource: 'arn:aws:states:::s3:listObjectsV2',
      }

      const mockData = [
        { key: 'file1.json' }, // lowercase 'key'
        { Key: 'file2.json' }, // correct case
      ]

      const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)

      expect(result.valid).toBe(true)
      expect((result.data as any)[0].Key).toBe('file1.json')
      expect((result.data as any)[1].Key).toBe('file2.json')
    })
  })
})
