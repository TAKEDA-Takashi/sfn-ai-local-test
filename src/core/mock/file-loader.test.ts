import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MockEngine } from './engine'
import { MockFileLoader } from './file-loader'

describe('MockFileLoader', () => {
  let testDir: string
  let fileLoader: MockFileLoader

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `mock-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    fileLoader = new MockFileLoader(testDir)
  })

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('JSON file loading', () => {
    it('should load JSON file', () => {
      const jsonData = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]
      const filePath = join(testDir, 'data.json')
      writeFileSync(filePath, JSON.stringify(jsonData))

      const loaded = fileLoader.loadFromFile('data.json')
      expect(loaded).toEqual(jsonData)
    })

    it('should auto-detect JSON format', () => {
      const jsonData = { key: 'value' }
      const filePath = join(testDir, 'test.json')
      writeFileSync(filePath, JSON.stringify(jsonData))

      const loaded = fileLoader.loadFromFile('test.json')
      expect(loaded).toEqual(jsonData)
    })
  })

  describe('CSV file loading', () => {
    it('should load CSV file with headers', () => {
      const csvContent = `id,name,age
1,Alice,30
2,Bob,25
3,Charlie,35`
      const filePath = join(testDir, 'data.csv')
      writeFileSync(filePath, csvContent)

      const loaded = fileLoader.loadFromFile('data.csv')
      expect(loaded).toEqual([
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
        { id: 3, name: 'Charlie', age: 35 },
      ])
    })

    it('should handle quoted CSV values', () => {
      const csvContent = `name,description
"Item 1","Contains, comma"
"Item 2","Contains ""quotes"""
"Item 3","Multi
line"`
      const filePath = join(testDir, 'quoted.csv')
      writeFileSync(filePath, csvContent)

      const loaded = fileLoader.loadFromFile('quoted.csv')
      expect(loaded).toEqual([
        { name: 'Item 1', description: 'Contains, comma' },
        { name: 'Item 2', description: 'Contains "quotes"' },
        { name: 'Item 3', description: 'Multi\nline' },
      ])
    })
  })

  describe('JSON Lines file loading', () => {
    it('should load JSONL file', () => {
      const jsonlContent = `{"id":1,"type":"A"}
{"id":2,"type":"B"}
{"id":3,"type":"C"}`
      const filePath = join(testDir, 'data.jsonl')
      writeFileSync(filePath, jsonlContent)

      const loaded = fileLoader.loadFromFile('data.jsonl')
      expect(loaded).toEqual([
        { id: 1, type: 'A' },
        { id: 2, type: 'B' },
        { id: 3, type: 'C' },
      ])
    })

    it('should handle .ndjson extension', () => {
      const jsonlContent = `{"value":100}
{"value":200}`
      const filePath = join(testDir, 'data.ndjson')
      writeFileSync(filePath, jsonlContent)

      const loaded = fileLoader.loadFromFile('data.ndjson')
      expect(loaded).toEqual([{ value: 100 }, { value: 200 }])
    })
  })

  describe('YAML file loading', () => {
    it('should load YAML file', () => {
      const yamlContent = `- id: 1
  name: Item 1
  tags:
    - tag1
    - tag2
- id: 2
  name: Item 2
  tags:
    - tag3`
      const filePath = join(testDir, 'data.yaml')
      writeFileSync(filePath, yamlContent)

      const loaded = fileLoader.loadFromFile('data.yaml')
      expect(loaded).toEqual([
        { id: 1, name: 'Item 1', tags: ['tag1', 'tag2'] },
        { id: 2, name: 'Item 2', tags: ['tag3'] },
      ])
    })
  })

  describe('Path resolution', () => {
    it('should resolve relative paths', () => {
      const subDir = join(testDir, 'subdir')
      mkdirSync(subDir)

      const data = { test: 'data' }
      const filePath = join(subDir, 'test.json')
      writeFileSync(filePath, JSON.stringify(data))

      const loaded = fileLoader.loadFromFile('subdir/test.json')
      expect(loaded).toEqual(data)
    })

    it('should handle absolute paths', () => {
      const data = { absolute: 'path' }
      const filePath = join(testDir, 'absolute.json')
      writeFileSync(filePath, JSON.stringify(data))

      const loaded = fileLoader.loadFromFile(filePath)
      expect(loaded).toEqual(data)
    })
  })
})

describe('MockEngine with external files', () => {
  let testDir: string
  let mockEngine: MockEngine

  beforeEach(() => {
    testDir = join(tmpdir(), `mock-engine-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should load fixed mock from external JSON file', async () => {
    // Create external data file
    const externalData = [
      { id: 1, name: 'External 1' },
      { id: 2, name: 'External 2' },
    ]
    const dataPath = join(testDir, 'external.json')
    writeFileSync(dataPath, JSON.stringify(externalData))

    // Create mock config
    const config = {
      version: '1.0',
      mocks: [
        {
          state: 'TestState',
          type: 'fixed' as const,
          responseFile: 'external.json',
        },
      ],
    }

    mockEngine = new MockEngine(config, { basePath: testDir })
    const response = await mockEngine.getMockResponse('TestState', {})

    expect(response).toEqual(externalData)
  })

  it('should load conditional mock from external CSV file', async () => {
    // Create external CSV data
    const csvContent = `userId,movieId,rating
user1,movie1,4.5
user2,movie2,3.0`
    const dataPath = join(testDir, 'ratings.csv')
    writeFileSync(dataPath, csvContent)

    // Create mock config
    const config = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessRatings',
          type: 'conditional' as const,
          conditions: [
            {
              when: { input: { type: 'ratings' } },
              responseFile: 'ratings.csv',
            },
            {
              default: [],
            },
          ],
        },
      ],
    }

    mockEngine = new MockEngine(config, { basePath: testDir })
    const response = await mockEngine.getMockResponse('ProcessRatings', {
      type: 'ratings',
    })

    expect(response).toEqual([
      { userId: 'user1', movieId: 'movie1', rating: 4.5 },
      { userId: 'user2', movieId: 'movie2', rating: 3 },
    ])
  })

  it('should load stateful mock from external JSONL file', async () => {
    // Create external JSONL data
    const jsonlContent = `{"status":"pending"}
{"status":"processing"}
{"status":"completed"}`
    const dataPath = join(testDir, 'states.jsonl')
    writeFileSync(dataPath, jsonlContent)

    // Create mock config
    const config = {
      version: '1.0',
      mocks: [
        {
          state: 'StatusCheck',
          type: 'stateful' as const,
          responsesFile: 'states.jsonl',
        },
      ],
    }

    mockEngine = new MockEngine(config, { basePath: testDir })

    // First call
    let response = await mockEngine.getMockResponse('StatusCheck', {})
    expect(response).toEqual({ status: 'pending' })

    // Second call
    response = await mockEngine.getMockResponse('StatusCheck', {})
    expect(response).toEqual({ status: 'processing' })

    // Third call
    response = await mockEngine.getMockResponse('StatusCheck', {})
    expect(response).toEqual({ status: 'completed' })

    // Fourth call (cycles back)
    response = await mockEngine.getMockResponse('StatusCheck', {})
    expect(response).toEqual({ status: 'pending' })
  })

  it('should cache loaded files', async () => {
    // Create external data file
    const data = { cached: true }
    const dataPath = join(testDir, 'cache.json')
    writeFileSync(dataPath, JSON.stringify(data))

    // Create mock config
    const config = {
      version: '1.0',
      mocks: [
        {
          state: 'CachedState',
          type: 'fixed' as const,
          responseFile: 'cache.json',
        },
      ],
    }

    mockEngine = new MockEngine(config, { basePath: testDir })

    // First call - loads from file
    const response1 = await mockEngine.getMockResponse('CachedState', {})
    expect(response1).toEqual(data)

    // Modify the file
    writeFileSync(dataPath, JSON.stringify({ cached: false }))

    // Second call - should use cached value
    const response2 = await mockEngine.getMockResponse('CachedState', {})
    expect(response2).toEqual(data) // Still the original data

    // Clear cache and try again
    mockEngine.clearCache()
    const response3 = await mockEngine.getMockResponse('CachedState', {})
    expect(response3).toEqual({ cached: false }) // Now loads the new data
  })

  it('should handle mixed inline and external data', async () => {
    // Create external data file
    const externalData = [{ external: true }]
    const dataPath = join(testDir, 'external.json')
    writeFileSync(dataPath, JSON.stringify(externalData))

    // Create mock config with both inline and external
    const config = {
      version: '1.0',
      mocks: [
        {
          state: 'InlineState',
          type: 'fixed' as const,
          response: { inline: true },
        },
        {
          state: 'ExternalState',
          type: 'fixed' as const,
          responseFile: 'external.json',
        },
      ],
    }

    mockEngine = new MockEngine(config, { basePath: testDir })

    // Test inline mock
    const inlineResponse = await mockEngine.getMockResponse('InlineState', {})
    expect(inlineResponse).toEqual({ inline: true })

    // Test external mock
    const externalResponse = await mockEngine.getMockResponse('ExternalState', {})
    expect(externalResponse).toEqual(externalData)
  })
})
