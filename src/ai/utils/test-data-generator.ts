/**
 * Generates test data files for ItemReader mocks
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as yaml from 'js-yaml'
import { mockConfigSchema } from '../../schemas/mock-schema'
import { isMap, type MapState, type StateMachine } from '../../types/asl'
import { analyzeItemReaders, generateSampleData } from './item-reader-analyzer'
import { findStates } from './state-traversal'

export interface TestDataFile {
  filename: string
  path: string
  content: string
  format: string
}

/**
 * Generates test data files for DistributedMap ItemReaders
 */
export function generateTestDataFiles(
  stateMachine: StateMachine,
  mockYaml: string,
): TestDataFile[] {
  const generatedFiles: TestDataFile[] = []

  // Analyze ItemReaders in the state machine
  const itemReaders = analyzeItemReaders(stateMachine)
  if (itemReaders.length === 0) {
    return generatedFiles
  }

  // Parse the mock YAML to check if ItemReader mocks are using dataFile
  let mockConfig: {
    mocks?: Array<{ state: string; type: string; dataFile?: string; dataFormat?: string }>
  }
  try {
    const rawConfig = yaml.load(mockYaml)
    mockConfig = mockConfigSchema.parse(rawConfig)
    if (!mockConfig || typeof mockConfig !== 'object') {
      return generatedFiles
    }
  } catch {
    return generatedFiles
  }

  // Ensure test-data directory exists
  const testDataDir = './sfn-test/test-data'
  if (!existsSync(testDataDir)) {
    mkdirSync(testDataDir, { recursive: true })
  }

  // Process each ItemReader
  for (const reader of itemReaders) {
    // Check if this state has an itemReader mock in the YAML
    const mockForState = mockConfig?.mocks?.find(
      (m) => m.state === reader.stateName && m.type === 'itemReader',
    )

    // Generate file if ItemReader mock exists and uses dataFile
    if (mockForState?.dataFile) {
      // Find the corresponding MapState for ItemProcessor analysis
      const mapState = findMapState(stateMachine, reader.stateName)

      // Generate test data based on the format and ItemProcessor requirements
      const itemCount = reader.estimatedItemCount || 10
      // Both dataFormat and reader.format should be the same type, but TypeScript loses the union type
      const format = (mockForState.dataFormat || reader.format) as Parameters<
        typeof generateSampleData
      >[0]
      const sampleData = generateSampleData(format, itemCount, mapState || undefined)

      // Use the filename from the mock (handle relative paths)
      const filename = mockForState.dataFile
      // If the filename contains a directory, create it
      const filepath = filename.includes('/') ? filename : join(testDataDir, filename)

      // Ensure the directory exists
      const dir = dirname(filepath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      // Write the file
      writeFileSync(filepath, sampleData)

      generatedFiles.push({
        filename,
        path: filepath,
        content: sampleData,
        format: reader.format,
      })

      // Logging is handled by the caller
    }
  }

  return generatedFiles
}

/**
 * Finds a MapState by name in the state machine
 */
function findMapState(stateMachine: StateMachine, stateName: string): MapState | null {
  const mapStates = findStates(stateMachine, (name, state, _context) => {
    return name === stateName && isMap(state)
  })

  if (mapStates.length > 0) {
    const firstState = mapStates[0]?.state
    // isMap() in the filter ensures this is a MapState
    if (firstState && isMap(firstState)) {
      return firstState
    }
  }

  return null
}
