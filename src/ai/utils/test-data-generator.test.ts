import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { generateTestDataFiles } from './test-data-generator'

// Mock file system functions
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Mock the analyzer module
vi.mock('./item-reader-analyzer', () => ({
  analyzeItemReaders: vi.fn(),
  generateSampleData: vi.fn(),
}))

import { analyzeItemReaders, generateSampleData } from './item-reader-analyzer'

describe('test-data-generator', () => {
  const mockedExistsSync = vi.mocked(existsSync)
  const mockedMkdirSync = vi.mocked(mkdirSync)
  const mockedWriteFileSync = vi.mocked(writeFileSync)
  const mockedAnalyzeItemReaders = vi.mocked(analyzeItemReaders)
  const mockedGenerateSampleData = vi.mocked(generateSampleData)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateTestDataFiles', () => {
    it('should return empty array when no ItemReaders found', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const mockYaml = `
version: "1.0"
mocks: []
`

      mockedAnalyzeItemReaders.mockReturnValue([])

      const result = generateTestDataFiles(stateMachine, mockYaml)

      expect(result).toEqual([])
      expect(mockedAnalyzeItemReaders).toHaveBeenCalledWith(stateMachine)
    })

    it('should generate test data file for ItemReader with dataFile mock', () => {
      const stateMachine: StateMachine = {
        StartAt: 'MapState',
        States: StateFactory.createStates({
          MapState: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'test-bucket',
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
        }),
      }

      const mockYaml = `
version: "1.0"
mocks:
  - state: MapState
    type: itemReader
    dataFile: test-data.json
    dataFormat: json
`

      mockedAnalyzeItemReaders.mockReturnValue([
        {
          stateName: 'MapState',
          resource: 'arn:aws:states:::s3:listObjectsV2',
          estimatedItemCount: 10,
          format: 'json',
          hasItemReader: true,
        },
      ])

      mockedGenerateSampleData.mockReturnValue('[{"id": 1}, {"id": 2}]')
      mockedExistsSync.mockReturnValue(false)

      const result = generateTestDataFiles(stateMachine, mockYaml)

      expect(mockedMkdirSync).toHaveBeenCalledWith('sfn-test/test-data', { recursive: true })
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        'sfn-test/test-data/test-data.json',
        '[{"id": 1}, {"id": 2}]',
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        filename: 'test-data.json',
        path: 'sfn-test/test-data/test-data.json',
        content: '[{"id": 1}, {"id": 2}]',
        format: 'json',
      })
    })

    it('should handle invalid mock YAML gracefully', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const invalidYaml = 'not: valid: yaml: structure:'

      mockedAnalyzeItemReaders.mockReturnValue([
        {
          stateName: 'MapState',
          resource: 'arn:aws:states:::s3:listObjectsV2',
          estimatedItemCount: 10,
          format: 'json',
          hasItemReader: true,
        },
      ])

      const result = generateTestDataFiles(stateMachine, invalidYaml)

      expect(result).toEqual([])
    })

    it('should skip ItemReaders without dataFile in mock', () => {
      const stateMachine: StateMachine = {
        StartAt: 'MapState',
        States: StateFactory.createStates({
          MapState: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'test-bucket',
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
        }),
      }

      const mockYaml = `
version: "1.0"
mocks:
  - state: MapState
    type: itemReader
    response:
      - item1
      - item2
`

      mockedAnalyzeItemReaders.mockReturnValue([
        {
          stateName: 'MapState',
          resource: 'arn:aws:states:::s3:listObjectsV2',
          estimatedItemCount: 10,
          format: 'json',
          hasItemReader: true,
        },
      ])

      const result = generateTestDataFiles(stateMachine, mockYaml)

      expect(result).toEqual([])
      expect(mockedWriteFileSync).not.toHaveBeenCalled()
    })

    it('should handle custom file paths with directories', () => {
      const stateMachine: StateMachine = {
        StartAt: 'MapState',
        States: StateFactory.createStates({
          MapState: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'test-bucket',
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
        }),
      }

      const mockYaml = `
version: "1.0"
mocks:
  - state: MapState
    type: itemReader
    dataFile: custom/path/data.csv
    dataFormat: csv
`

      mockedAnalyzeItemReaders.mockReturnValue([
        {
          stateName: 'MapState',
          resource: 'arn:aws:states:::s3:listObjectsV2',
          estimatedItemCount: 5,
          format: 'csv',
          hasItemReader: true,
        },
      ])

      mockedGenerateSampleData.mockReturnValue('id,name\n1,Item1\n2,Item2')
      mockedExistsSync.mockReturnValue(false)

      const result = generateTestDataFiles(stateMachine, mockYaml)

      expect(mockedMkdirSync).toHaveBeenCalledWith('custom/path', { recursive: true })
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        'custom/path/data.csv',
        'id,name\n1,Item1\n2,Item2',
      )
      expect(result[0]).toMatchObject({
        filename: 'custom/path/data.csv',
        path: 'custom/path/data.csv',
        content: 'id,name\n1,Item1\n2,Item2',
        format: 'csv',
      })
    })

    it('should not create directory if it already exists', () => {
      const stateMachine: StateMachine = {
        StartAt: 'MapState',
        States: StateFactory.createStates({
          MapState: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'test-bucket',
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
        }),
      }

      const mockYaml = `
version: "1.0"
mocks:
  - state: MapState
    type: itemReader
    dataFile: test-data.json
`

      mockedAnalyzeItemReaders.mockReturnValue([
        {
          stateName: 'MapState',
          resource: 'arn:aws:states:::s3:listObjectsV2',
          estimatedItemCount: 10,
          format: 'json',
          hasItemReader: true,
        },
      ])

      mockedGenerateSampleData.mockReturnValue('[]')
      mockedExistsSync.mockReturnValue(true) // Directory already exists

      const result = generateTestDataFiles(stateMachine, mockYaml)

      expect(mockedMkdirSync).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })
})
