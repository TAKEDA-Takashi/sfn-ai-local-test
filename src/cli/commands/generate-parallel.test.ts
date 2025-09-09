import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as agentsModule from '../../ai/agents/index'
import * as configLoader from '../../config/loader'
import { generateCommand } from './generate'

// Mock modules
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  }),
}))

vi.mock('../../ai/agents/index', () => ({
  generateMockWithAI: vi.fn(),
  generateTestWithAI: vi.fn(),
}))

vi.mock('../../config/loader', () => ({
  loadProjectConfig: vi.fn(),
  loadStateMachineDefinition: vi.fn(),
  resolveMockPath: vi.fn(),
  resolveTestSuitePath: vi.fn(),
}))

const mockedLoadProjectConfig = vi.mocked(configLoader.loadProjectConfig)
const mockedLoadStateMachineDefinition = vi.mocked(configLoader.loadStateMachineDefinition)
const mockedResolveMockPath = vi.mocked(configLoader.resolveMockPath)
const mockedResolveTestSuitePath = vi.mocked(configLoader.resolveTestSuitePath)
const mockedGenerateMockWithAI = vi.mocked(agentsModule.generateMockWithAI)
const mockedGenerateTestWithAI = vi.mocked(agentsModule.generateTestWithAI)

const { writeFileSync, existsSync } = vi.mocked(await import('node:fs'))

const multipleStateMachinesConfig = {
  version: '1.0',
  stateMachines: [
    {
      name: 'workflow-1',
      source: { type: 'asl' as const, path: './workflow-1.asl.json' },
    },
    {
      name: 'workflow-2',
      source: { type: 'asl' as const, path: './workflow-2.asl.json' },
    },
    {
      name: 'workflow-3',
      source: { type: 'asl' as const, path: './workflow-3.asl.json' },
    },
  ],
}

const mockStateMachine = {
  StartAt: 'Start',
  States: { Start: { Type: 'Pass', End: true } },
}

describe('generate command - parallel execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockedLoadStateMachineDefinition.mockReturnValue(mockStateMachine)
    mockedResolveMockPath.mockImplementation((_, name) => `./sfn-test/mocks/${name}.mock.yaml`)
    mockedResolveTestSuitePath.mockImplementation(
      (_, name) => `./sfn-test/test-suites/${name}.test.yaml`,
    )
  })

  describe('sequential execution (default)', () => {
    it('should process multiple state machines sequentially by default', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedGenerateMockWithAI.mockResolvedValue('version: "1.0"\nmocks: []')
      existsSync.mockReturnValue(false) // Directory doesn't exist, so mkdirSync will be called

      await generateCommand('mock', { aiModel: 'test' })

      // Should be called 3 times sequentially
      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)
      expect(writeFileSync).toHaveBeenCalledTimes(3)

      // Check each call
      expect(writeFileSync).toHaveBeenNthCalledWith(
        1,
        './sfn-test/mocks/workflow-1.mock.yaml',
        'version: "1.0"\nmocks: []',
      )
      expect(writeFileSync).toHaveBeenNthCalledWith(
        2,
        './sfn-test/mocks/workflow-2.mock.yaml',
        'version: "1.0"\nmocks: []',
      )
      expect(writeFileSync).toHaveBeenNthCalledWith(
        3,
        './sfn-test/mocks/workflow-3.mock.yaml',
        'version: "1.0"\nmocks: []',
      )
    })
  })

  describe('parallel execution with concurrency option', () => {
    it('should process multiple state machines with concurrency=2', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      existsSync.mockReturnValue(false)

      // Use a delay to simulate AI processing time and verify parallel execution
      let callCount = 0
      mockedGenerateMockWithAI.mockImplementation(async () => {
        const currentCall = ++callCount
        await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
        return `version: "1.0"\nmocks: []\n# call-${currentCall}`
      })

      const startTime = Date.now()
      await generateCommand('mock', { aiModel: 'test', concurrency: '2' })
      const endTime = Date.now()

      // With concurrency=2, 3 tasks should complete faster than sequential execution
      // Sequential would take ~150ms, parallel should take ~100ms
      const executionTime = endTime - startTime
      expect(executionTime).toBeLessThan(140) // Allow some buffer for test environment

      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)
      expect(writeFileSync).toHaveBeenCalledTimes(3)
    })

    it('should process multiple state machines with concurrency=3 (higher than task count)', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedGenerateMockWithAI.mockResolvedValue('version: "1.0"\nmocks: []')
      existsSync.mockReturnValue(false)

      await generateCommand('mock', { aiModel: 'test', concurrency: '3' })

      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)
      expect(writeFileSync).toHaveBeenCalledTimes(3)
    })

    it('should handle errors in parallel execution', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      existsSync.mockReturnValue(false)

      // Make second call fail
      mockedGenerateMockWithAI.mockImplementation((_stateMachine, _model) => {
        const isSecondCall = vi.mocked(mockedGenerateMockWithAI).mock.calls.length === 2
        if (isSecondCall) {
          throw new Error('AI generation failed')
        }
        return Promise.resolve('version: "1.0"\nmocks: []')
      })

      await generateCommand('mock', { aiModel: 'test', concurrency: '2' })

      // Should still process all 3 state machines
      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)

      // Only 2 should succeed (1st and 3rd)
      expect(writeFileSync).toHaveBeenCalledTimes(2)

      // Check error message was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('✗ Failed to generate mock for workflow-2: AI generation failed'),
      )
    })
  })

  describe('parallel test generation', () => {
    it('should support parallel test generation with mock file detection', async () => {
      const { existsSync, readFileSync } = vi.mocked(await import('node:fs'))

      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      existsSync.mockReturnValue(true)
      readFileSync.mockReturnValue('version: "1.0"\nmocks: []')
      mockedGenerateTestWithAI.mockResolvedValue('version: "1.0"\ntestCases: []')

      await generateCommand('test', { aiModel: 'test', concurrency: '2' })

      expect(mockedGenerateTestWithAI).toHaveBeenCalledTimes(3)
      expect(writeFileSync).toHaveBeenCalledTimes(3)

      // Verify mock file was read for each test generation
      expect(readFileSync).toHaveBeenCalledWith('./sfn-test/mocks/workflow-1.mock.yaml', 'utf-8')
      expect(readFileSync).toHaveBeenCalledWith('./sfn-test/mocks/workflow-2.mock.yaml', 'utf-8')
      expect(readFileSync).toHaveBeenCalledWith('./sfn-test/mocks/workflow-3.mock.yaml', 'utf-8')
    })
  })

  describe('concurrency validation', () => {
    it('should default to sequential execution when concurrency is not specified', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedGenerateMockWithAI.mockResolvedValue('version: "1.0"\nmocks: []')

      await generateCommand('mock', { aiModel: 'test' })

      // Should still work (sequentially)
      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)
      expect(writeFileSync).toHaveBeenCalledTimes(3)
    })

    it('should handle invalid concurrency values gracefully', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedGenerateMockWithAI.mockResolvedValue('version: "1.0"\nmocks: []')

      // Test with invalid concurrency value (will be parsed as NaN, defaulting to 1)
      await generateCommand('mock', { aiModel: 'test', concurrency: 'invalid' })

      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)
      expect(writeFileSync).toHaveBeenCalledTimes(3)
    })
  })
})
