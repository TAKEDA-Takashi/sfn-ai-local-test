import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as aiAgents from '../../ai/agents/index'
import * as configLoader from '../../config/loader'
import type { JsonObject } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { generateCommand } from './generate'

// モック設定
vi.mock('node:fs')
vi.mock('../../config/loader')
vi.mock('../../ai/agents/index')
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  })),
}))

// process.exitのモック
const mockExit = vi.fn()
vi.stubGlobal('process', { ...process, exit: mockExit })

const mockedExistsSync = vi.mocked(existsSync)
const mockedReadFileSync = vi.mocked(readFileSync)
const mockedWriteFileSync = vi.mocked(writeFileSync)
const mockedLoadProjectConfig = vi.mocked(configLoader.loadProjectConfig)
const mockedLoadStateMachineDefinition = vi.mocked(configLoader.loadStateMachineDefinition)
const mockedResolveMockPath = vi.mocked(configLoader.resolveMockPath)
const mockedResolveTestSuitePath = vi.mocked(configLoader.resolveTestSuitePath)
const mockedGenerateMockWithAI = vi.mocked(aiAgents.generateMockWithAI)
const mockedGenerateTestWithAI = vi.mocked(aiAgents.generateTestWithAI)

describe('generateCommand - auto config resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExit.mockClear()
    // デフォルトの成功パスを設定
    mockedGenerateMockWithAI.mockResolvedValue('mock: generated')
    mockedGenerateTestWithAI.mockResolvedValue('test: generated')
    mockedWriteFileSync.mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('when no options are provided', () => {
    const mockConfig = {
      version: '1.0',
      stateMachines: [
        {
          name: 'my-workflow',
          source: { type: 'asl' as const, path: './workflows/my-workflow.asl.json' },
        },
      ],
    }

    const mockStateMachine = {
      Comment: 'Test workflow',
      StartAt: 'FirstState',
      States: {
        FirstState: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:::function:TestFunction',
          End: true,
        },
      },
    }

    it('should auto-detect state machine from config for mock generation', async () => {
      // 設定ファイルと単一のステートマシンをセットアップ
      mockedLoadProjectConfig.mockReturnValue(mockConfig)
      mockedLoadStateMachineDefinition.mockReturnValue(mockStateMachine)
      mockedResolveMockPath.mockReturnValue('./mocks/my-workflow.mock.yaml')

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      expect(mockedLoadProjectConfig).toHaveBeenCalledWith('./sfn-test.config.yaml', false)
      // findStateMachineは呼ばれない（単一ステートマシン自動選択）
      expect(mockedLoadStateMachineDefinition).toHaveBeenCalledWith(
        mockConfig.stateMachines[0] as any,
      )
      // StateMachineインスタンスが渡されることを期待
      const expectedStateMachine = StateFactory.createStateMachine(mockStateMachine as JsonObject)
      expect(mockedGenerateMockWithAI).toHaveBeenCalledWith(
        expectedStateMachine,
        'claude-sonnet',
        300000,
        2,
      )
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        './mocks/my-workflow.mock.yaml',
        'mock: generated',
      )
    })

    it('should auto-detect state machine from config for test generation', async () => {
      // 設定ファイルと単一のステートマシンをセットアップ
      mockedLoadProjectConfig.mockReturnValue(mockConfig)
      mockedLoadStateMachineDefinition.mockReturnValue(mockStateMachine)
      mockedResolveTestSuitePath.mockReturnValue('./tests/my-workflow.test.yaml')
      mockedResolveMockPath.mockReturnValue('./mocks/my-workflow.mock.yaml')
      mockedExistsSync.mockImplementation((path) => {
        return path === './mocks/my-workflow.mock.yaml' // mockファイルのみ存在する
      })
      mockedReadFileSync.mockReturnValue('mock: content')

      await generateCommand('test', { aiModel: 'claude-sonnet' })

      expect(mockedLoadProjectConfig).toHaveBeenCalledWith('./sfn-test.config.yaml', false)
      // findStateMachineは呼ばれない（単一ステートマシン自動選択）
      expect(mockedLoadStateMachineDefinition).toHaveBeenCalledWith(
        mockConfig.stateMachines[0] as any,
      )
      // StateMachineインスタンスが渡されることを期待
      const expectedStateMachine = StateFactory.createStateMachine(mockStateMachine as JsonObject)
      expect(mockedGenerateTestWithAI).toHaveBeenCalledWith(
        expectedStateMachine,
        'claude-sonnet',
        300000,
        undefined, // mockContentは単一ステートマシン自動選択では読み込まれない
        'my-workflow.mock.yaml', // mockPathはフルパスではなくファイル名のみ
        'my-workflow.asl.json',
        './tests/my-workflow.test.yaml',
        undefined, // verbose
      )
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        './tests/my-workflow.test.yaml',
        'test: generated',
      )
    })

    it('should handle case when config file does not exist', async () => {
      mockedLoadProjectConfig.mockReturnValue(null)

      // process.exitが呼ばれることを期待するため、テストではconsole.errorをモック
      const consoleMock = vi.spyOn(console, 'error').mockImplementation(() => {})

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockedLoadProjectConfig).toHaveBeenCalledWith('./sfn-test.config.yaml', false)
      expect(consoleMock).toHaveBeenCalledWith(
        expect.stringContaining('Either --name, --asl, or --cdk option is required'),
      )

      consoleMock.mockRestore()
    })

    it('should handle case when multiple state machines exist (sequential processing)', async () => {
      const configWithMultiple = {
        version: '1.0',
        stateMachines: [
          { name: 'workflow-1', source: { type: 'asl' as const, path: './w1.asl.json' } },
          { name: 'workflow-2', source: { type: 'asl' as const, path: './w2.asl.json' } },
        ],
      }
      mockedLoadProjectConfig.mockReturnValue(configWithMultiple)
      mockedLoadStateMachineDefinition.mockReturnValue(mockStateMachine)
      mockedResolveMockPath.mockReturnValue('./mock.yaml')

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      // 複数ステートマシンが順次処理されることを確認
      expect(mockedLoadStateMachineDefinition).toHaveBeenCalledTimes(2)
      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(2)
      expect(mockedWriteFileSync).toHaveBeenCalledTimes(2)
      // process.exitは呼ばれない（成功時）
      expect(mockExit).not.toHaveBeenCalled()
    })

    it('should handle case when only one state machine exists (auto-select)', async () => {
      const configWithSingleStateMachine = {
        version: '1.0',
        stateMachines: [
          {
            name: 'only-workflow',
            source: { type: 'asl' as const, path: './only-workflow.asl.json' },
          },
        ],
      }
      mockedLoadProjectConfig.mockReturnValue(configWithSingleStateMachine)
      mockedLoadStateMachineDefinition.mockReturnValue(mockStateMachine)
      mockedResolveMockPath.mockReturnValue('./only-workflow.mock.yaml')

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      // 単一ステートマシンが自動選択される
      expect(mockedLoadStateMachineDefinition).toHaveBeenCalledWith(
        configWithSingleStateMachine.stateMachines[0],
      )
      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(1)
      expect(mockedWriteFileSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('when config file handling', () => {
    it('should use default config path when no cmd is provided', async () => {
      const mockConfig = {
        version: '1.0',
        stateMachines: [
          {
            name: 'default-workflow',
            source: { type: 'asl' as const, path: './default.asl.json' },
          },
        ],
      }

      mockedLoadProjectConfig.mockReturnValue(mockConfig)
      mockedLoadStateMachineDefinition.mockReturnValue({
        StartAt: 'PassState',
        States: {
          PassState: {
            Type: 'Pass',
            End: true,
          },
        },
      })
      mockedResolveMockPath.mockReturnValue('./default.mock.yaml')

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      expect(mockedLoadProjectConfig).toHaveBeenCalledWith('./sfn-test.config.yaml', false)
      expect(mockedLoadStateMachineDefinition).toHaveBeenCalledWith(mockConfig.stateMachines[0])
    })
  })
})
