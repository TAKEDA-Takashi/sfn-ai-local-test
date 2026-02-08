import * as fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateMachine } from '../../types/asl'
import {
  generateAndLogTestData,
  generateFallbackTemplate,
  loadMockConfig,
  parseConcurrency,
  parseMaxAttempts,
  parseTimeout,
} from './generate'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('../../ai/utils/test-data-generator', () => ({
  generateTestDataFiles: vi.fn(),
}))

describe('parseTimeout', () => {
  it('should return default 300000 when undefined', () => {
    expect(parseTimeout(undefined)).toBe(300000)
  })

  it('should parse string to number', () => {
    expect(parseTimeout('60000')).toBe(60000)
  })

  it('should parse "0" to 0', () => {
    expect(parseTimeout('0')).toBe(0)
  })
})

describe('parseMaxAttempts', () => {
  it('should return default 2 when undefined', () => {
    expect(parseMaxAttempts(undefined)).toBe(2)
  })

  it('should parse string to number', () => {
    expect(parseMaxAttempts('5')).toBe(5)
  })
})

describe('parseConcurrency', () => {
  it('should return default 1 when undefined', () => {
    expect(parseConcurrency(undefined)).toBe(1)
  })

  it('should parse valid string to number', () => {
    expect(parseConcurrency('4')).toBe(4)
  })

  it('should fallback to 1 for NaN', () => {
    expect(parseConcurrency('abc')).toBe(1)
  })

  it('should fallback to 1 for values less than 1', () => {
    expect(parseConcurrency('0')).toBe(1)
    expect(parseConcurrency('-1')).toBe(1)
  })
})

describe('loadMockConfig', () => {
  it('should load and parse a valid mock file', () => {
    const mockYaml =
      'version: "1.0"\nmocks:\n  - state: "TestState"\n    type: "fixed"\n    response:\n      result: "ok"\n'
    vi.mocked(fs.readFileSync).mockReturnValue(mockYaml)

    const result = loadMockConfig('/path/to/mock.yaml')

    expect(result).not.toBeNull()
    expect(result?.content).toBe(mockYaml)
    expect(result?.config.mocks).toHaveLength(1)
    expect(result?.filePath).toBe('/path/to/mock.yaml')
  })

  it('should return null when file read fails', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found')
    })

    const result = loadMockConfig('/path/to/nonexistent.yaml')
    expect(result).toBeNull()
  })

  it('should return null when YAML parse fails', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid: [yaml: content')

    const result = loadMockConfig('/path/to/invalid.yaml')
    expect(result).toBeNull()
  })

  it('should return null when schema validation fails', () => {
    // version フィールドが不足
    vi.mocked(fs.readFileSync).mockReturnValue('mocks: []')

    const result = loadMockConfig('/path/to/invalid-schema.yaml')
    expect(result).toBeNull()
  })
})

describe('generateAndLogTestData', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call generateTestDataFiles and log results when verbose', async () => {
    const { generateTestDataFiles } = await import('../../ai/utils/test-data-generator')
    vi.mocked(generateTestDataFiles).mockReturnValue([
      { filename: 'test.json', path: 'test-data/test.json', content: '{}', format: 'json' },
    ])

    const mockStateMachine = { States: {} } as unknown as StateMachine

    generateAndLogTestData(mockStateMachine, 'version: "1.0"\nmocks: []', true)

    expect(generateTestDataFiles).toHaveBeenCalledWith(
      mockStateMachine,
      'version: "1.0"\nmocks: []',
    )
  })

  it('should not log when not verbose', async () => {
    const { generateTestDataFiles } = await import('../../ai/utils/test-data-generator')
    vi.mocked(generateTestDataFiles).mockReturnValue([
      { filename: 'test.json', path: 'test-data/test.json', content: '{}', format: 'json' },
    ])

    const mockStateMachine = { States: {} } as unknown as StateMachine

    generateAndLogTestData(mockStateMachine, 'version: "1.0"\nmocks: []', false)

    expect(generateTestDataFiles).toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    const { generateTestDataFiles } = await import('../../ai/utils/test-data-generator')
    vi.mocked(generateTestDataFiles).mockImplementation(() => {
      throw new Error('Generation failed')
    })

    const mockStateMachine = { States: {} } as unknown as StateMachine

    // Should not throw
    expect(() => {
      generateAndLogTestData(mockStateMachine, 'version: "1.0"\nmocks: []', true)
    }).not.toThrow()
  })
})

describe('generateFallbackTemplate', () => {
  it('should return mock template for type "mock"', () => {
    const result = generateFallbackTemplate('mock')
    expect(result).toContain('version: "1.0"')
    expect(result).toContain('mocks:')
    expect(result).toContain('YourTaskStateName')
  })

  it('should return test template for type "test"', () => {
    const result = generateFallbackTemplate('test')
    expect(result).toContain('version: "1.0"')
    expect(result).toContain('testCases:')
    expect(result).toContain('Success case')
  })

  it('should return empty string for unknown type', () => {
    const result = generateFallbackTemplate('unknown')
    expect(result).toBe('')
  })
})
