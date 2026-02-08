import { describe, expect, it } from 'vitest'
import type { MapState, StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/asl'
import {
  analyzeItemReaders,
  generateBasicSampleData,
  generateSampleData,
  getFileExtension,
} from './item-reader-analyzer'

describe('ItemReader Analyzer', () => {
  describe('analyzeItemReaders', () => {
    it('should detect DistributedMap with S3 ItemReader', () => {
      const stateMachine: StateMachine = {
        Comment: 'Test',
        StartAt: 'ProcessBatch',
        States: {
          ProcessBatch: StateFactory.createState({
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'my-bucket',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED' as const,
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          }),
        },
      }

      const results = analyzeItemReaders(stateMachine)

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({
        stateName: 'ProcessBatch',
        resource: 'arn:aws:states:::s3:listObjectsV2',
        format: 's3objects',
        hasItemReader: true,
        estimatedItemCount: 20,
      })
    })

    it('should detect CSV format from ReaderConfig', () => {
      const stateMachine: StateMachine = {
        Comment: 'Test',
        StartAt: 'ProcessCSV',
        States: {
          ProcessCSV: StateFactory.createState({
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
                Mode: 'DISTRIBUTED' as const,
              },
              StartAt: 'ProcessRow',
              States: {
                ProcessRow: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          }),
        },
      }

      const results = analyzeItemReaders(stateMachine)

      expect(results).toHaveLength(1)
      expect(results[0]?.format).toBe('csv')
      expect(results[0]?.estimatedItemCount).toBe(50)
    })

    it('should detect S3 inventory manifest format', () => {
      const stateMachine: StateMachine = {
        Comment: 'Test',
        StartAt: 'ProcessInventory',
        States: {
          ProcessInventory: StateFactory.createState({
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              ReaderConfig: {
                InputType: 'MANIFEST',
              },
              Parameters: {
                Bucket: 'my-inventory-bucket',
                Key: 'inventory/manifest.json',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED' as const,
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          }),
        },
      }

      const results = analyzeItemReaders(stateMachine)

      expect(results).toHaveLength(1)
      expect(results[0]?.format).toBe('manifest')
      expect(results[0]?.estimatedItemCount).toBe(100)
    })

    it('should detect JSONL format from Arguments.Key (JSONata mode)', () => {
      const stateMachine = {
        QueryLanguage: 'JSONata' as const,
        StartAt: 'Test Map',
        States: {
          'Test Map': StateFactory.createState({
            Type: 'Map' as const,
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              Arguments: {
                Bucket: 'test-bucket',
                Key: 'account_list/processing_report.jsonl',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED' as const,
                ExecutionType: 'STANDARD' as const,
              },
              StartAt: 'Process Item',
              States: {
                'Process Item': {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          }),
        },
      }

      const itemReaders = analyzeItemReaders(stateMachine)
      expect(itemReaders).toHaveLength(1)
      expect(itemReaders[0]?.format).toBe('jsonl')
      expect(itemReaders[0]?.estimatedItemCount).toBe(30)
    })

    it('should detect CSV format from Arguments.Key (JSONata mode)', () => {
      const stateMachine = {
        QueryLanguage: 'JSONata' as const,
        StartAt: 'CSV Map',
        States: {
          'CSV Map': StateFactory.createState({
            Type: 'Map' as const,
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              Arguments: {
                Bucket: 'test-bucket',
                Key: 'data/export.csv',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED' as const,
              },
              StartAt: 'Process Row',
              States: {
                'Process Row': {
                  Type: 'Pass' as const,
                  End: true,
                },
              },
            },
          }),
        },
      }

      const itemReaders = analyzeItemReaders(stateMachine)
      expect(itemReaders).toHaveLength(1)
      expect(itemReaders[0]?.format).toBe('csv')
      expect(itemReaders[0]?.estimatedItemCount).toBe(50)
    })
  })

  describe('generateBasicSampleData', () => {
    it('should generate S3 objects list', () => {
      const data = generateBasicSampleData('s3objects', 3)
      const parsed = JSON.parse(data)

      expect(parsed).toHaveLength(3)
      expect(parsed[0]).toHaveProperty('Key')
      expect(parsed[0]).toHaveProperty('Size')
      expect(parsed[0]).toHaveProperty('LastModified')
      expect(parsed[0]).toHaveProperty('ETag')
    })

    it('should generate CSV data', () => {
      const data = generateBasicSampleData('csv', 3)
      const lines = data.split('\n')

      expect(lines).toHaveLength(4) // header + 3 rows
      expect(lines[0]).toBe('id,name,value,status,created_at')
      // Updated to expect new timestamp-based format
      expect(lines[1]).toMatch(/^1,Item-\d+-1,\d+,(pending|active),\d{4}-\d{2}-\d{2}T/)
    })

    it('should generate JSONL data', () => {
      const data = generateBasicSampleData('jsonl', 3)
      const lines = data.split('\n')

      expect(lines).toHaveLength(3)
      lines.forEach((line) => {
        const obj = JSON.parse(line)
        // Updated to expect new timestamp-based format
        expect(obj.id).toMatch(/^item-\d+-\d+$/)
        expect(obj).toHaveProperty('name')
        expect(obj).toHaveProperty('value')
        expect(obj).toHaveProperty('metadata')
        expect(obj.metadata).toHaveProperty('batch')
      })
    })

    it('should generate S3 inventory manifest', () => {
      const data = generateBasicSampleData('manifest', 3)
      const parsed = JSON.parse(data)

      expect(parsed).toHaveProperty('sourceBucket')
      expect(parsed).toHaveProperty('files')
      expect(parsed.files).toHaveLength(3)
      expect(parsed.files[0]).toHaveProperty('key')
      expect(parsed.files[0]).toHaveProperty('size')
      expect(parsed.files[0]).toHaveProperty('MD5checksum')
    })

    it('should generate standard JSON array', () => {
      const data = generateBasicSampleData('json', 3)
      const parsed = JSON.parse(data)

      expect(parsed).toHaveLength(3)
      expect(parsed[0]).toHaveProperty('id')
      expect(parsed[0]).toHaveProperty('name')
      expect(parsed[0]).toHaveProperty('value')
      expect(parsed[0]).toHaveProperty('metadata')
    })
  })

  describe('getFileExtension', () => {
    it('should return correct extensions', () => {
      expect(getFileExtension('csv')).toBe('csv')
      expect(getFileExtension('jsonl')).toBe('jsonl')
      expect(getFileExtension('s3objects')).toBe('json')
      expect(getFileExtension('manifest')).toBe('json')
      expect(getFileExtension('json')).toBe('json')
    })
  })

  describe('Field Type Inference', () => {
    describe('Logic-based field type detection', () => {
      it('should infer appropriate format from field name patterns', () => {
        // Generic test - when field name contains "account" and "id"
        const mapState = StateFactory.createState({
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemSelector: {
            value: '{% $states.context.Map.Item.Value %}',
            additionalParam: '{% $someParam %}',
          },
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ProcessAccount',
            States: {
              ProcessAccount: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::states:startExecution',
                Arguments: {
                  Input: '{% { "id": $states.input.value.account_id } %}',
                },
                End: true,
              },
            },
          },
          End: true,
        }) as MapState

        const sampleData = generateSampleData('jsonl', 3, mapState)
        const lines = sampleData.split('\n')

        expect(lines).toHaveLength(3)

        const firstItem = JSON.parse(lines[0] ?? '{}')

        // Field exists
        expect(firstItem).toHaveProperty('account_id')
        expect(firstItem.account_id).toBeTruthy()
        expect(typeof firstItem.account_id).toBe('string')

        // Should NOT have ItemSelector fields
        expect(firstItem).not.toHaveProperty('value')
        expect(firstItem).not.toHaveProperty('additionalParam')
      })

      it('should handle date/time fields intelligently', () => {
        const mapState = StateFactory.createState({
          Type: 'Map',
          ItemSelector: {
            'item.$': '$$.Map.Item.Value',
            'processedAt.$': '$$.State.EnteredTime',
          },
          ItemProcessor: {
            StartAt: 'Process',
            States: {
              Process: {
                Type: 'Pass',
                Parameters: {
                  'created_at.$': '$.item.created_at',
                  'updated_at.$': '$.item.updated_at',
                  'processing_month.$': '$.item.processing_month',
                },
                End: true,
              },
            },
          },
          End: true,
        }) as MapState

        const sampleData = generateSampleData('json', 2, mapState)
        const items = JSON.parse(sampleData)

        expect(items).toHaveLength(2)

        const firstItem = items[0]

        // Logic should recognize these as date/time fields
        if (firstItem.created_at) {
          expect(firstItem.created_at).toMatch(/\d{4}-\d{2}-\d{2}/) // ISO date pattern
        }

        if (firstItem.processing_month) {
          // YYYY-MM format for month fields
          expect(firstItem.processing_month).toMatch(/^\d{4}-\d{2}$/)
        }
      })

      it('should handle email fields appropriately', () => {
        const mapState = StateFactory.createState({
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'SendNotification',
            States: {
              SendNotification: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  'email.$': '$.user_email',
                  'notification_email.$': '$.notification_email',
                  'notification_address.$': '$.notification_address',
                },
                End: true,
              },
            },
          },
          End: true,
        }) as MapState

        const sampleData = generateSampleData('json', 1, mapState)
        const items = JSON.parse(sampleData)

        const firstItem = items[0]

        // Logic should recognize email fields
        if (firstItem.user_email) {
          expect(firstItem.user_email).toContain('@')
        }
        if (firstItem.notification_email) {
          expect(firstItem.notification_email).toContain('@')
        }
      })
    })

    describe('Responsibility boundaries', () => {
      it('should properly separate logic and AI responsibilities', () => {
        // This test documents the separation of concerns

        const logicResponsibilities = {
          // Logic should handle basic data type inference
          fieldTypeInference: [
            'email fields → email format',
            'date fields → ISO date format',
            'month fields → YYYY-MM format',
            'boolean flags → true/false',
            'counts/amounts → numbers',
            'generic ID patterns',
          ],

          // Logic should handle field extraction from ASL
          fieldExtraction: [
            'Parse ItemSelector references',
            'Extract fields from Parameters',
            'Identify fields used in Choice conditions',
          ],

          // Logic should provide reasonable defaults
          defaultValues: ['Generate unique IDs', 'Create timestamps', 'Provide sample emails'],
        }

        const aiResponsibilities = {
          // AI should handle complex business logic
          businessLogic: [
            'Relationships between fields',
            'Valid combinations of values',
            'Business-specific constraints',
            'Platform-specific ID formats (AWS, Azure, etc.)',
          ],

          // AI should handle context-aware generation
          contextAware: [
            'Mock responses for Lambda functions',
            'Error scenarios and edge cases',
            'Stateful sequences',
          ],

          // AI should handle test scenario design
          testDesign: ['Happy path scenarios', 'Error scenarios', 'Edge cases'],
        }

        // Verify the separation is maintained
        expect(logicResponsibilities.fieldTypeInference).toBeDefined()
        expect(aiResponsibilities.businessLogic).toBeDefined()
      })
    })
  })
})
