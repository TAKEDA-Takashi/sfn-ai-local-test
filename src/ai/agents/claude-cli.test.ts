import type { ExecException } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_TIMEOUT_MS } from '../../constants/defaults'
import { StateFactory } from '../../types/state-factory'
import {
  correctFilePaths,
  generateMockWithClaudeCLI,
  generateTestWithClaudeCLI,
  hasNameBasedConfig,
  isClaudeCLIAvailable,
} from './claude-cli'

// Mock node modules
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))

vi.mock('node:fs', () => ({
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('node:os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}))

vi.mock('node:util', () => ({
  promisify: vi.fn((fn) => {
    return (...args: unknown[]) => {
      return new Promise((resolve, reject) => {
        const callback = (error: Error | null, result?: unknown) => {
          if (error) reject(error)
          else resolve(result)
        }
        fn(...args, callback)
      })
    }
  }),
}))

// Mock dynamic imports
const mockPromptBuilder = {
  buildMockPrompt: vi.fn(() => 'Mock prompt'),
  buildTestPrompt: vi.fn(() => 'Test prompt'),
}

import type { ValidationIssue } from '../validation/state-machine-validator'

const mockStateMachineValidator = {
  validateMockContent: vi.fn((): ValidationIssue[] => []),
  validateTestContent: vi.fn((): ValidationIssue[] => []),
  formatReport: vi.fn(() => 'No issues'),
  autoFix: vi.fn((content) => content),
}

const mockGenerationRetryManager = {
  generate: vi.fn(),
}

vi.mock('../generation/prompt-builder', () => ({
  PromptBuilder: vi.fn(() => mockPromptBuilder),
}))

vi.mock('../validation/state-machine-validator', () => ({
  StateMachineValidator: vi.fn(() => mockStateMachineValidator),
}))

vi.mock('../generation/generation-retry-manager', () => ({
  GenerationRetryManager: vi.fn(() => mockGenerationRetryManager),
}))

vi.mock('../../config/loader', () => ({
  loadProjectConfig: vi.fn(),
}))

describe('claude-cli', () => {
  const mockExec = vi.fn()
  const mockWriteFileSync = vi.fn()
  const mockUnlinkSync = vi.fn()
  const mockLoadProjectConfig = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()

    // Setup mocks
    const { exec } = await import('node:child_process')
    const { writeFileSync, unlinkSync } = await import('node:fs')
    const { loadProjectConfig } = await import('../../config/loader')

    vi.mocked(exec).mockImplementation(mockExec)
    vi.mocked(writeFileSync).mockImplementation(mockWriteFileSync)
    vi.mocked(unlinkSync).mockImplementation(mockUnlinkSync)
    vi.mocked(loadProjectConfig).mockImplementation(mockLoadProjectConfig)

    // Reset mock implementations
    mockPromptBuilder.buildMockPrompt.mockReturnValue('Mock prompt')
    mockPromptBuilder.buildTestPrompt.mockReturnValue('Test prompt')
    mockStateMachineValidator.validateMockContent.mockReturnValue([])
    mockStateMachineValidator.autoFix.mockImplementation((content) => content)
    mockStateMachineValidator.validateTestContent.mockReturnValue([])
    mockStateMachineValidator.autoFix.mockImplementation((content) => content)

    // Spy on console methods
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('generateMockWithClaudeCLI', () => {
    const mockStateMachine = {
      StartAt: 'Start',
      States: StateFactory.createStates({ Start: { Type: 'Pass', End: true } }),
    }

    it('should generate mock with single attempt (maxAttempts = 1)', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, { stdout: 'version: "1.0"\nmocks: []', stderr: '' })
      })

      const result = await generateMockWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        1,
      )

      expect(result).toBe('version: "1.0"\nmocks: []')
      expect(mockPromptBuilder.buildMockPrompt).toHaveBeenCalledWith(mockStateMachine)
      expect(mockStateMachineValidator.validateMockContent).toHaveBeenCalled()
      expect(mockStateMachineValidator.autoFix).toHaveBeenCalled()
    })

    it('should generate mock with retry manager (maxAttempts > 1)', async () => {
      mockGenerationRetryManager.generate.mockResolvedValue({
        success: true,
        content: 'version: "1.0"\nmocks: []',
        attempts: 1,
        issues: [],
      })

      const result = await generateMockWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        2,
      )

      expect(result).toBe('version: "1.0"\nmocks: []')
      expect(mockGenerationRetryManager.generate).toHaveBeenCalledWith({
        stateMachine: mockStateMachine,
        maxAttempts: 2,
        type: 'mock',
        timeout: DEFAULT_AI_TIMEOUT_MS,
        retryOnTimeout: true,
      })
    })

    it('should handle validation issues with warnings', async () => {
      mockGenerationRetryManager.generate.mockResolvedValue({
        success: true,
        content: 'version: "1.0"\nmocks: []',
        attempts: 1,
        issues: [{ level: 'warning', message: 'Minor issue' }],
      })

      const result = await generateMockWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        2,
      )

      expect(result).toBe('version: "1.0"\nmocks: []')
      expect(console.log).toHaveBeenCalledWith('⚠️ 1 warning(s) remain but are acceptable')
    })

    it('should throw error on generation failure', async () => {
      mockGenerationRetryManager.generate.mockResolvedValue({
        success: false,
        content: '',
        attempts: 2,
        issues: [],
        error: 'Generation failed',
      })

      await expect(
        generateMockWithClaudeCLI(mockStateMachine, DEFAULT_AI_TIMEOUT_MS, undefined, 2),
      ).rejects.toThrow('Generation failed')
    })

    it('should handle timeout errors', async () => {
      const timeoutError = new Error() as ExecException
      timeoutError.killed = true
      timeoutError.signal = 'SIGTERM'

      mockExec.mockImplementation((_, __, callback) => {
        callback(timeoutError)
      })

      await expect(generateMockWithClaudeCLI(mockStateMachine, 5000, undefined, 1)).rejects.toThrow(
        'Claude CLI timed out after 5000ms',
      )
    })

    it('should handle claude CLI not found error', async () => {
      const notFoundError = new Error('command not found') as ExecException
      notFoundError.code = 1

      mockExec.mockImplementation((_, __, callback) => {
        callback(notFoundError)
      })

      await expect(
        generateMockWithClaudeCLI(mockStateMachine, DEFAULT_AI_TIMEOUT_MS, undefined, 1),
      ).rejects.toThrow('Claude CLI not found')
    })
  })

  describe('generateTestWithClaudeCLI', () => {
    const mockStateMachine = {
      StartAt: 'Start',
      States: StateFactory.createStates({ Start: { Type: 'Pass', End: true } }),
    }
    const mockContent = 'version: "1.0"\nmocks: []'

    it('should generate test successfully', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, { stdout: 'version: "1.0"\ntestCases: []', stderr: '' })
      })

      const result = await generateTestWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        mockContent,
      )

      expect(result).toBe('version: "1.0"\ntestCases: []')
      expect(mockPromptBuilder.buildTestPrompt).toHaveBeenCalledWith(mockStateMachine, mockContent)
      expect(mockStateMachineValidator.validateTestContent).toHaveBeenCalled()
      expect(mockStateMachineValidator.autoFix).toHaveBeenCalled()
    })

    it('should handle validation issues', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, { stdout: 'version: "1.0"\ntestCases: []', stderr: '' })
      })

      mockStateMachineValidator.validateTestContent.mockReturnValue([
        { level: 'error' as const, message: 'Invalid format' },
      ])
      mockStateMachineValidator.formatReport.mockReturnValue('Error: Invalid format')

      const result = await generateTestWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        mockContent,
      )

      expect(result).toBe('version: "1.0"\ntestCases: []')
      expect(console.log).toHaveBeenCalledWith('🔍 Validation issues found:')
      expect(console.log).toHaveBeenCalledWith('Error: Invalid format')
    })

    it('should handle stderr warnings', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, { stdout: 'version: "1.0"\ntestCases: []', stderr: 'warning: something' })
      })

      const result = await generateTestWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        mockContent,
      )

      expect(result).toBe('version: "1.0"\ntestCases: []')
    })

    it('should handle non-warning stderr', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, { stdout: 'version: "1.0"\ntestCases: []', stderr: 'error: something bad' })
      })

      const result = await generateTestWithClaudeCLI(
        mockStateMachine,
        DEFAULT_AI_TIMEOUT_MS,
        mockContent,
      )

      expect(result).toBe('version: "1.0"\ntestCases: []')
      expect(console.warn).toHaveBeenCalledWith('Claude CLI stderr:', 'error: something bad')
    })
  })

  describe('correctFilePaths', () => {
    it('should correct stateMachine path', async () => {
      const input = `version: "1.0"
name: "test-suite"
stateMachine: "./wrong-workflow.asl.json"
baseMock: "./mock.yaml"`

      const result = await correctFilePaths(input, './workflow.asl.json')

      expect(result).toContain('stateMachine: "./workflow.asl.json"')
      expect(result).toContain('baseMock: "./mock.yaml"')
    })

    it('should correct baseMock path', async () => {
      const input = `version: "1.0"
name: "test-suite"
stateMachine: "./workflow.asl.json"
baseMock: "./wrong-mock.yaml"`

      const result = await correctFilePaths(input, undefined, './correct-mock.yaml')

      expect(result).toContain('stateMachine: "./workflow.asl.json"')
      expect(result).toContain('baseMock: "./correct-mock.yaml"')
    })

    it('should handle name-based configuration', async () => {
      mockLoadProjectConfig.mockReturnValue({
        stateMachines: [{ name: 'test-workflow' }],
      })

      const input = `version: "1.0"
name: "test-suite"
stateMachine: "./wrong.asl.json"`

      const result = await correctFilePaths(input, 'test-workflow.asl.json')

      expect(result).toContain('stateMachine: "test-workflow"')
    })

    it('should calculate relative paths when outputPath provided', async () => {
      const input = `version: "1.0"
stateMachine: "./wrong.asl.json"`

      const result = await correctFilePaths(
        input,
        '/project/state-machines/workflow.asl.json',
        undefined,
        '/project/tests/test.yaml',
      )

      expect(result).toContain('stateMachine: "../state-machines/workflow.asl.json"')
    })

    it('should add missing fields', async () => {
      const input = `version: "1.0"
name: "test-suite"`

      const result = await correctFilePaths(input, './workflow.asl.json')

      expect(result).toContain('name: "test-suite"')
      expect(result).toContain('stateMachine: "./workflow.asl.json"')
    })

    it('should handle empty input gracefully', async () => {
      const result = await correctFilePaths('')
      expect(result).toBe('')
    })

    it('should handle same directory relative paths', async () => {
      const input = `version: "1.0"
stateMachine: "./wrong.asl.json"`

      const result = await correctFilePaths(
        input,
        '/project/tests/workflow.asl.json',
        undefined,
        '/project/tests/test.yaml',
      )

      expect(result).toContain('stateMachine: "./workflow.asl.json"')
    })

    it('should handle subdirectory relative paths', async () => {
      const input = `version: "1.0"
stateMachine: "./wrong.asl.json"`

      const result = await correctFilePaths(
        input,
        '/project/tests/subfolder/workflow.asl.json',
        undefined,
        '/project/tests/test.yaml',
      )

      expect(result).toContain('stateMachine: "./subfolder/workflow.asl.json"')
    })
  })

  describe('isClaudeCLIAvailable', () => {
    it('should return true when Claude CLI is available', async () => {
      mockExec.mockImplementation((_command, callback) => {
        callback(null, { stdout: '/usr/local/bin/claude', stderr: '' })
      })

      const result = await isClaudeCLIAvailable()
      expect(result).toBe(true)
    })

    it('should return false when Claude CLI is not available', async () => {
      mockExec.mockImplementation((_command, callback) => {
        callback(new Error('command not found'))
      })

      const result = await isClaudeCLIAvailable()
      expect(result).toBe(false)
    })
  })

  describe('hasNameBasedConfig', () => {
    it('should return true when state machine exists in config', () => {
      mockLoadProjectConfig.mockReturnValue({
        stateMachines: [{ name: 'workflow-a' }, { name: 'workflow-b' }],
      })

      const result = hasNameBasedConfig('workflow-a')
      expect(result).toBe(true)
    })

    it('should return false when state machine does not exist in config', () => {
      mockLoadProjectConfig.mockReturnValue({
        stateMachines: [{ name: 'workflow-a' }],
      })

      const result = hasNameBasedConfig('workflow-b')
      expect(result).toBe(false)
    })

    it('should return false when config has no stateMachines', () => {
      mockLoadProjectConfig.mockReturnValue({})

      const result = hasNameBasedConfig('workflow-a')
      expect(result).toBe(false)
    })

    it('should return false when config loading throws error', () => {
      mockLoadProjectConfig.mockImplementation(() => {
        throw new Error('Config not found')
      })

      const result = hasNameBasedConfig('workflow-a')
      expect(result).toBe(false)
    })

    it('should return false when config is null', () => {
      mockLoadProjectConfig.mockReturnValue(null)

      const result = hasNameBasedConfig('workflow-a')
      expect(result).toBe(false)
    })
  })

  describe('runClaudeCLI output cleaning', () => {
    it('should remove markdown code blocks', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, {
          stdout: '```yaml\nversion: "1.0"\nmocks: []\n```',
          stderr: '',
        })
      })

      const result = await generateMockWithClaudeCLI(
        { StartAt: 'Start', States: {} },
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        1,
      )

      expect(result).toBe('version: "1.0"\nmocks: []')
    })

    it('should remove explanatory text before YAML', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, {
          stdout: 'Here is your mock configuration:\nversion: "1.0"\nmocks: []',
          stderr: '',
        })
      })

      const result = await generateMockWithClaudeCLI(
        { StartAt: 'Start', States: {} },
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        1,
      )

      expect(result).toBe('version: "1.0"\nmocks: []')
    })

    it('should remove explanatory text after YAML', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(null, {
          stdout: 'version: "1.0"\nmocks: []\n\nThis configuration provides basic mocking setup.',
          stderr: '',
        })
      })

      const result = await generateMockWithClaudeCLI(
        { StartAt: 'Start', States: {} },
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        1,
      )

      expect(result).toBe('version: "1.0"\nmocks: []')
    })
  })

  describe('error handling edge cases', () => {
    it('should handle exec error with detailed logging', async () => {
      const customError = new Error('Custom error') as ExecException
      customError.code = 1
      customError.signal = undefined
      customError.killed = false

      mockExec.mockImplementation((_, __, callback) => {
        callback(customError)
      })

      await expect(
        generateMockWithClaudeCLI(
          { StartAt: 'Start', States: {} },
          DEFAULT_AI_TIMEOUT_MS,
          undefined,
          1,
        ),
      ).rejects.toThrow('Custom error')

      expect(console.error).toHaveBeenCalledWith('Claude CLI error details:', {
        code: 1,
        signal: undefined,
        killed: false,
        message: 'Custom error',
      })
    })

    it('should clean up temp file even on error', async () => {
      mockExec.mockImplementation((_, __, callback) => {
        callback(new Error('Test error'))
      })

      await expect(
        generateMockWithClaudeCLI(
          { StartAt: 'Start', States: {} },
          DEFAULT_AI_TIMEOUT_MS,
          undefined,
          1,
        ),
      ).rejects.toThrow('Test error')

      expect(mockUnlinkSync).toHaveBeenCalled()
    })

    it('should ignore unlinkSync errors during cleanup', async () => {
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('Cannot delete file')
      })

      mockExec.mockImplementation((_, __, callback) => {
        callback(null, { stdout: 'version: "1.0"', stderr: '' })
      })

      // Should not throw despite unlinkSync error
      const result = await generateMockWithClaudeCLI(
        { StartAt: 'Start', States: {} },
        DEFAULT_AI_TIMEOUT_MS,
        undefined,
        1,
      )

      expect(result).toBe('version: "1.0"')
    })
  })
})
