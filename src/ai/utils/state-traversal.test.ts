import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/asl'
import { generateSampleData } from './item-reader-analyzer'

describe('Data Generation Precision Test', () => {
  it('should generate realistic processing data based on actual DistributedMap analysis', () => {
    // Simulate a realistic data processing DistributedMap
    const stateMachine: StateMachine = {
      StartAt: 'ProcessDataItems',
      States: {
        ProcessDataItems: StateFactory.createState({
          Type: 'Map',
          ItemReader: {
            Resource: 'arn:aws:states:::s3:getObject',
            ReaderConfig: {
              InputType: 'JSONL',
            },
            Parameters: {
              Bucket: 'processing-data-bucket',
              Key: 'invoices/data.jsonl',
            },
          },
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ValidateInvoice',
            States: {
              ValidateInvoice: {
                Type: 'Choice',
                Choices: [
                  {
                    Variable: '$.processed',
                    BooleanEquals: false,
                    Next: 'ProcessInvoice',
                  },
                  {
                    Variable: '$.amount',
                    NumericGreaterThan: 1000,
                    Next: 'HighValueProcessing',
                  },
                ],
                Default: 'StandardProcessing',
              },
              ProcessInvoice: {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                Parameters: {
                  FunctionName: 'process-data-item',
                  Payload: {
                    invoiceId: '$.id',
                    customerInfo: '$.customer',
                    processingAmount: '$.amount',
                    processedFlag: '$.processed',
                  },
                },
                Next: 'StandardProcessing',
              },
              HighValueProcessing: {
                Type: 'Pass',
                End: true,
              },
              StandardProcessing: {
                Type: 'Pass',
                End: true,
              },
            },
          },
          End: true,
        }),
      },
    }

    // Generate JSONL data for this realistic scenario
    const mapState = stateMachine.States.ProcessDataItems as any
    const data = generateSampleData('jsonl', 5, mapState)
    const lines = data.split('\n')

    expect(lines).toHaveLength(5)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line) {
        const obj = JSON.parse(line)

        // Verify that ItemProcessor analysis influenced the data structure
        expect(obj).toHaveProperty('id')
        expect(obj).toHaveProperty('customer')
        expect(obj).toHaveProperty('amount')
        expect(obj).toHaveProperty('processed')

        // Check field types
        expect(typeof obj.id).toBe('string')
        expect(typeof obj.customer).toBeDefined()
        expect(typeof obj.amount).toBe('number')
        expect(typeof obj.processed).toBe('boolean')

        // Verify realistic data generation
        expect(obj.id).toMatch(/^id-\d+$/) // Should follow ID pattern with incremental numbers
        expect(obj.amount).toBeGreaterThan(0)
        expect(obj.amount).toBeLessThan(10000) // Reasonable range
        expect([true, false]).toContain(obj.processed) // Should be valid boolean
      }
    }
  })
})
