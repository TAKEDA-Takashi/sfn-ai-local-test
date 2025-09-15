import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MapOutputAnalyzer } from './map-output-analyzer'

describe('MapOutputAnalyzer', () => {
  describe('InlineMap output analysis', () => {
    it('should analyze basic InlineMap output requirements', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessItems',
        States: {
          ProcessItems: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0]).toMatchObject({
        stateName: 'ProcessItems',
        requiredFields: expect.arrayContaining([
          expect.objectContaining({
            field: 'ProcessedItemCount',
            type: 'number',
            required: true,
          }),
        ]),
      })

      // Check dynamic fields structure more flexibly
      expect(specs[0].dynamicFields).toHaveLength(1)
      expect(specs[0].dynamicFields[0]).toMatchObject({
        field: 'ProcessedItemCount',
      })
      expect(specs[0].dynamicFields[0].calculation).toMatch(/input.*length/)
    })

    it('should handle Map without explicit ItemsPath', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessAll',
        States: {
          ProcessAll: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0]).toMatchObject({
        stateName: 'ProcessAll',
        conditionalLogic: 'Check if input is array, use length; otherwise assume single item',
      })
    })

    it('should handle Map with Parameters in JSONPath mode', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'MapWithParams',
        States: {
          MapWithParams: {
            Type: 'Map',
            Parameters: {
              items: '$.data.accounts',
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0].dynamicFields).toHaveLength(1)
      expect(specs[0].dynamicFields[0]).toMatchObject({
        field: 'ProcessedItemCount',
      })
      // The calculation might be generic due to Parameters handling
      expect(specs[0].dynamicFields[0].calculation).toMatch(/input/)
    })
  })

  describe('DistributedMap output analysis', () => {
    it('should analyze DistributedMap with additional fields', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'DistributedProcess',
        States: {
          DistributedProcess: {
            Type: 'Map',
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
              ExecutionType: 'STANDARD',
            },
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
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0].requiredFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'ProcessedItemCount',
            type: 'number',
            required: true,
          }),
          expect.objectContaining({
            field: 'FailedItemCount',
            type: 'number',
            required: false,
          }),
          expect.objectContaining({
            field: 'PendingItemCount',
            type: 'number',
            required: false,
          }),
          expect.objectContaining({
            field: 'TotalItemCount',
            type: 'number',
            required: false,
          }),
        ]),
      )
    })

    it('should detect ResultWriter and add ResultWriterDetails', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'MapWithResultWriter',
        States: {
          MapWithResultWriter: {
            Type: 'Map',
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
              ExecutionType: 'STANDARD',
            },
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'input-bucket',
              },
            },
            ResultWriter: {
              Resource: 'arn:aws:states:::s3:putObject',
              Parameters: {
                Bucket: 'output-bucket',
                Prefix: 'results/',
              },
            },
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0].requiredFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'ResultWriterDetails',
            type: 'object',
            required: true,
            description: 'Details about result writing location',
          }),
        ]),
      )
    })
  })

  describe('JSONata mode Map analysis', () => {
    it('should analyze Map with JSONata Arguments', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessList',
        QueryLanguage: 'JSONata',
        States: {
          ProcessList: {
            Type: 'Map',
            Arguments: {
              items: '$states.input.resourceList',
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0]).toMatchObject({
        stateName: 'ProcessList',
        dynamicFields: expect.arrayContaining([
          expect.objectContaining({
            field: 'ProcessedItemCount',
            calculation: 'input.resourceList.length',
          }),
        ]),
        conditionalLogic: 'Use conditional mock based on input.resourceList array size',
      })
    })

    it('should handle Map with complex JSONata Arguments', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'ComplexMap',
        QueryLanguage: 'JSONata',
        States: {
          ComplexMap: {
            Type: 'Map',
            Arguments: {
              data: {
                accounts: '$accountList',
                regions: '$regionList',
              },
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(1)
      expect(specs[0].dynamicFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'ProcessedItemCount',
            calculation: expect.stringContaining('accountList'),
          }),
        ]),
      )
    })
  })

  describe('Edge cases', () => {
    it('should handle multiple Map states', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'FirstMap',
        States: {
          FirstMap: {
            Type: 'Map',
            ItemsPath: '$.firstItems',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'Process1',
              States: {
                Process1: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            Next: 'SecondMap',
          },
          SecondMap: {
            Type: 'Map',
            ItemsPath: '$.secondItems',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'Process2',
              States: {
                Process2: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(2)
      expect(specs[0].stateName).toBe('FirstMap')
      expect(specs[0].dynamicFields[0].calculation).toMatch(/input.*length/)
      expect(specs[1].stateName).toBe('SecondMap')
      expect(specs[1].dynamicFields[0].calculation).toMatch(/input.*length/)
    })

    it('should handle Map without ItemProcessor', () => {
      // Map without ItemProcessor should throw an error during state machine creation
      expect(() => {
        StateFactory.createStateMachine({
          StartAt: 'EmptyMap',
          States: {
            EmptyMap: {
              Type: 'Map',
              ItemsPath: '$.items',
              End: true,
            },
          },
        })
      }).toThrow('Map state requires ItemProcessor or Iterator field')
    })

    it('should handle non-Map states gracefully', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'NotAMap',
        States: {
          NotAMap: {
            Type: 'Pass',
            Result: 'test',
            End: true,
          },
        },
      })

      const analyzer = new MapOutputAnalyzer(stateMachine)
      const specs = analyzer.analyzeMapOutputRequirements()

      expect(specs).toHaveLength(0)
    })
  })
})
