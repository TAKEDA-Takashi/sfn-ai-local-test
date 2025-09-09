import { describe, expect, it } from 'vitest'
import type { JsonObject, MapState } from '../../types/asl'
import { StateFactory } from '../../types/asl'
import { generateSampleData } from './item-reader-analyzer'

describe('ItemProcessor Analysis Integration', () => {
  it('should generate JSONL data based on ItemProcessor analysis', () => {
    const mapStateConfig = {
      Type: 'Map',
      ItemReader: {
        Resource: 'arn:aws:states:::s3:getObject',
        ReaderConfig: {
          InputType: 'JSONL',
        },
        Parameters: {
          Bucket: 'my-bucket',
          Key: 'data.jsonl',
        },
      },
      ItemProcessor: {
        ProcessorConfig: {
          Mode: 'DISTRIBUTED',
        },
        StartAt: 'CheckStatus',
        States: {
          CheckStatus: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.status',
                StringEquals: 'active',
                Next: 'ProcessActive',
              },
              {
                Variable: '$.priority',
                NumericGreaterThan: 10,
                Next: 'ProcessHighPriority',
              },
            ],
            Default: 'ProcessDefault',
          },
          ProcessActive: {
            Type: 'Pass',
            End: true,
          },
          ProcessHighPriority: {
            Type: 'Pass',
            End: true,
          },
          ProcessDefault: {
            Type: 'Pass',
            End: true,
          },
        },
      },
      End: true,
    }

    // Create StateMachine with raw JSON data
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'TestMap',
      States: { TestMap: mapStateConfig as unknown as JsonObject },
      QueryLanguage: 'JSONPath',
    })
    const mapStateFromSM = stateMachine.States.TestMap as MapState

    // Generate JSONL data with ItemProcessor analysis
    const data = generateSampleData('jsonl', 3, mapStateFromSM)
    const lines = data.split('\n')

    expect(lines).toHaveLength(3)

    // Parse each line and verify structure
    for (const line of lines) {
      const obj = JSON.parse(line)

      // Should have fields identified by ItemProcessor analysis
      expect(obj).toHaveProperty('status')
      expect(obj).toHaveProperty('priority')

      // Verify expected field types and values
      expect(typeof obj.status).toBe('string')
      // Status should be one of realistic options, not a mangled version
      expect(['active', 'pending', 'inactive', 'processing', 'completed']).toContain(obj.status)
      expect(typeof obj.priority).toBe('number')
      expect(obj.priority).toBeGreaterThan(0) // Should be a reasonable number
    }
  })

  it('should generate CSV data based on ItemProcessor analysis', () => {
    const mapStateConfig = {
      Type: 'Map',
      ItemReader: {
        Resource: 'arn:aws:states:::s3:getObject',
        ReaderConfig: {
          InputType: 'CSV',
        },
        Parameters: {
          Bucket: 'my-bucket',
          Key: 'data.csv',
        },
      },
      ItemProcessor: {
        ProcessorConfig: {
          Mode: 'DISTRIBUTED',
        },
        StartAt: 'ProcessItem',
        States: {
          ProcessItem: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'process-item',
              Payload: {
                itemId: '$.id',
                customerName: '$.customer',
                processingAmount: '$.amount',
              },
            },
            End: true,
          },
        },
      },
      End: true,
    }

    // Create StateMachine with raw JSON data
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'TestMap',
      States: { TestMap: mapStateConfig as unknown as JsonObject },
      QueryLanguage: 'JSONPath',
    })
    const mapStateFromSM = stateMachine.States.TestMap as MapState

    // Generate CSV data with ItemProcessor analysis
    const data = generateSampleData('csv', 3, mapStateFromSM)
    const lines = data.split('\n')

    expect(lines.length).toBeGreaterThan(3) // Header + 3 rows

    // Check header contains fields from analysis
    const headers = lines[0]?.split(',') || []
    expect(headers).toContain('id')
    expect(headers).toContain('customer')
    expect(headers).toContain('amount')

    // Check data rows
    for (let i = 1; i < lines.length && i <= 3; i++) {
      const values = lines[i]?.split(',') || []
      expect(values.length).toBe(headers.length)

      // Verify each row has data for all columns
      expect(values.every((v) => v && v.trim() !== '')).toBe(true)
    }
  })

  it('should generate S3 objects with additional fields from ItemProcessor', () => {
    const mapStateConfig = {
      Type: 'Map',
      ItemReader: {
        Resource: 'arn:aws:states:::s3:listObjectsV2',
        Parameters: {
          Bucket: 'my-bucket',
        },
      },
      ItemProcessor: {
        ProcessorConfig: {
          Mode: 'DISTRIBUTED',
        },
        StartAt: 'ProcessObject',
        States: {
          ProcessObject: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'process-s3-object',
              Payload: {
                bucketName: '$.bucket',
                objectKey: '$.key',
                fileSize: '$.size',
              },
            },
            End: true,
          },
        },
      },
      End: true,
    }

    // Create StateMachine with raw JSON data
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'TestMap',
      States: { TestMap: mapStateConfig as unknown as JsonObject },
      QueryLanguage: 'JSONPath',
    })
    const mapStateFromSM = stateMachine.States.TestMap as MapState

    // Generate S3 objects data with ItemProcessor analysis
    const data = generateSampleData('s3objects', 2, mapStateFromSM)
    const parsed = JSON.parse(data)

    expect(parsed).toHaveLength(2)

    for (const item of parsed) {
      // Should have standard S3 object fields
      expect(item).toHaveProperty('Key')
      expect(item).toHaveProperty('Size')
      expect(item).toHaveProperty('LastModified')
      expect(item).toHaveProperty('ETag')

      // Should have additional fields from ItemProcessor analysis
      expect(item).toHaveProperty('bucket')
      expect(item).toHaveProperty('key')
      expect(item).toHaveProperty('size')

      // Verify field types
      expect(typeof item.bucket).toBe('string')
      expect(typeof item.key).toBe('string')
      expect(typeof item.size).toBeDefined()
    }
  })

  it('should fallback to generic data when no ItemProcessor analysis available', () => {
    // Test without MapState (no analysis)
    const data = generateSampleData('jsonl', 2)
    const lines = data.split('\n')

    expect(lines).toHaveLength(2)

    for (const line of lines) {
      const obj = JSON.parse(line)

      // Should have generic fallback structure
      expect(obj).toHaveProperty('id')
      expect(obj).toHaveProperty('name')
      expect(obj).toHaveProperty('value')
      expect(obj).toHaveProperty('processed')
      expect(obj).toHaveProperty('metadata')

      // Verify the generic structure
      expect(obj.id).toMatch(/^item-\d+-\d+$/)
      expect(typeof obj.name).toBe('string')
      expect(typeof obj.value).toBe('number')
      expect(typeof obj.processed).toBe('boolean')
      expect(obj.metadata).toHaveProperty('batch')
    }
  })
})
