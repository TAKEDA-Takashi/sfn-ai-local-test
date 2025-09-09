import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as aiAgents from '../../ai/agents/index'
import * as configLoader from '../../config/loader'
import type { JsonObject } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { generateCommand } from './generate'

// モック設定
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))
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

describe('generateCommand - multiple state machines', () => {
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

  describe('when multiple state machines are configured', () => {
    const multipleStateMachinesConfig = {
      version: '1.0',
      stateMachines: [
        {
          name: 'workflow-1',
          source: { type: 'asl' as const, path: './workflows/workflow-1.asl.json' },
        },
        {
          name: 'workflow-2',
          source: { type: 'asl' as const, path: './workflows/workflow-2.asl.json' },
        },
        {
          name: 'workflow-3',
          source: { type: 'asl' as const, path: './workflows/workflow-3.asl.json' },
        },
      ],
    }

    const mockStateMachine1 = {
      Comment: 'Workflow 1',
      StartAt: 'State1',
      States: { State1: { Type: 'Pass', End: true } },
    }

    const mockStateMachine2 = {
      Comment: 'Workflow 2',
      StartAt: 'State2',
      States: { State2: { Type: 'Pass', End: true } },
    }

    const mockStateMachine3 = {
      Comment: 'Workflow 3',
      StartAt: 'State3',
      States: { State3: { Type: 'Pass', End: true } },
    }

    it('should generate mocks for all state machines sequentially', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedLoadStateMachineDefinition
        .mockReturnValueOnce(mockStateMachine1)
        .mockReturnValueOnce(mockStateMachine2)
        .mockReturnValueOnce(mockStateMachine3)

      mockedResolveMockPath
        .mockReturnValueOnce('./mocks/workflow-1.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-2.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-3.mock.yaml')

      mockedGenerateMockWithAI
        .mockResolvedValueOnce('mock1: generated')
        .mockResolvedValueOnce('mock2: generated')
        .mockResolvedValueOnce('mock3: generated')

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      // 3回の読み込みが順番に呼ばれることを確認
      expect(mockedLoadStateMachineDefinition).toHaveBeenCalledTimes(3)
      expect(mockedLoadStateMachineDefinition).toHaveBeenNthCalledWith(
        1,
        multipleStateMachinesConfig.stateMachines[0],
      )
      expect(mockedLoadStateMachineDefinition).toHaveBeenNthCalledWith(
        2,
        multipleStateMachinesConfig.stateMachines[1],
      )
      expect(mockedLoadStateMachineDefinition).toHaveBeenNthCalledWith(
        3,
        multipleStateMachinesConfig.stateMachines[2],
      )

      // AI生成が3回呼ばれることを確認
      expect(mockedGenerateMockWithAI).toHaveBeenCalledTimes(3)
      // StateMachineインスタンスが渡されることを期待
      const expectedStateMachine1 = StateFactory.createStateMachine(mockStateMachine1 as JsonObject)
      const expectedStateMachine2 = StateFactory.createStateMachine(mockStateMachine2 as JsonObject)
      const expectedStateMachine3 = StateFactory.createStateMachine(mockStateMachine3 as JsonObject)

      expect(mockedGenerateMockWithAI).toHaveBeenNthCalledWith(
        1,
        expectedStateMachine1,
        'claude-sonnet',
        300000,
        2,
      )
      expect(mockedGenerateMockWithAI).toHaveBeenNthCalledWith(
        2,
        expectedStateMachine2,
        'claude-sonnet',
        300000,
        2,
      )
      expect(mockedGenerateMockWithAI).toHaveBeenNthCalledWith(
        3,
        expectedStateMachine3,
        'claude-sonnet',
        300000,
        2,
      )

      // ファイル書き込みが3回呼ばれることを確認
      expect(mockedWriteFileSync).toHaveBeenCalledTimes(3)
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        1,
        './mocks/workflow-1.mock.yaml',
        'mock1: generated',
      )
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        2,
        './mocks/workflow-2.mock.yaml',
        'mock2: generated',
      )
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        3,
        './mocks/workflow-3.mock.yaml',
        'mock3: generated',
      )
    })

    it('should generate tests for all state machines sequentially', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedLoadStateMachineDefinition
        .mockReturnValueOnce(mockStateMachine1)
        .mockReturnValueOnce(mockStateMachine2)
        .mockReturnValueOnce(mockStateMachine3)

      mockedResolveTestSuitePath
        .mockReturnValueOnce('./tests/workflow-1.test.yaml')
        .mockReturnValueOnce('./tests/workflow-2.test.yaml')
        .mockReturnValueOnce('./tests/workflow-3.test.yaml')

      mockedResolveMockPath
        .mockReturnValueOnce('./mocks/workflow-1.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-2.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-3.mock.yaml')

      // 全てのモックファイルが存在すると設定
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync
        .mockReturnValueOnce('mock1: content')
        .mockReturnValueOnce('mock2: content')
        .mockReturnValueOnce('mock3: content')

      mockedGenerateTestWithAI
        .mockResolvedValueOnce('test1: generated')
        .mockResolvedValueOnce('test2: generated')
        .mockResolvedValueOnce('test3: generated')

      await generateCommand('test', { aiModel: 'claude-sonnet' })

      // AI生成が3回呼ばれることを確認
      expect(mockedGenerateTestWithAI).toHaveBeenCalledTimes(3)
      // StateMachineインスタンスが渡されることを期待
      const expectedStateMachine1 = StateFactory.createStateMachine(mockStateMachine1 as JsonObject)
      const expectedStateMachine2 = StateFactory.createStateMachine(mockStateMachine2 as JsonObject)
      const expectedStateMachine3 = StateFactory.createStateMachine(mockStateMachine3 as JsonObject)

      // Verify the most important aspects: StateMachine, aslPath, and that it was called correctly
      expect(mockedGenerateTestWithAI).toHaveBeenCalledTimes(3)
      const calls = vi.mocked(mockedGenerateTestWithAI).mock.calls

      expect(calls[0][0]).toEqual(expectedStateMachine1) // StateMachine 1
      expect(calls[0][1]).toBe('claude-sonnet') // model
      expect(calls[0][5]).toBe('workflow-1') // aslPath should be the name

      expect(calls[1][0]).toEqual(expectedStateMachine2) // StateMachine 2
      expect(calls[1][1]).toBe('claude-sonnet') // model
      expect(calls[1][5]).toBe('workflow-2') // aslPath should be the name

      expect(calls[2][0]).toEqual(expectedStateMachine3) // StateMachine 3
      expect(calls[2][1]).toBe('claude-sonnet') // model
      expect(calls[2][5]).toBe('workflow-3') // aslPath should be the name

      // ファイル書き込みが3回呼ばれることを確認
      expect(mockedWriteFileSync).toHaveBeenCalledTimes(3)
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        1,
        './tests/workflow-1.test.yaml',
        'test1: generated',
      )
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        2,
        './tests/workflow-2.test.yaml',
        'test2: generated',
      )
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        3,
        './tests/workflow-3.test.yaml',
        'test3: generated',
      )
    })

    it('should handle errors in one state machine and continue with others', async () => {
      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedLoadStateMachineDefinition
        .mockReturnValueOnce(mockStateMachine1)
        .mockImplementationOnce(() => {
          throw new Error('Failed to load workflow-2')
        })
        .mockReturnValueOnce(mockStateMachine3)

      // resolveMockPathは成功したケースのみ呼ばれる
      mockedResolveMockPath
        .mockReturnValueOnce('./mocks/workflow-1.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-3.mock.yaml') // workflow-2はスキップされる

      mockedGenerateMockWithAI
        .mockResolvedValueOnce('mock1: generated')
        .mockResolvedValueOnce('mock3: generated')

      // コンソールログのモック
      const consoleMock = vi.spyOn(console, 'error').mockImplementation(() => {})
      const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await generateCommand('mock', { aiModel: 'claude-sonnet' })

      // エラーが発生したworkflow-2についてエラーログが出力されることを確認
      expect(consoleMock).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate mock for workflow-2'),
      )

      // 成功したものについてはファイルが書き込まれることを確認
      expect(mockedWriteFileSync).toHaveBeenCalledTimes(2)
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        1,
        './mocks/workflow-1.mock.yaml',
        'mock1: generated',
      )
      expect(mockedWriteFileSync).toHaveBeenNthCalledWith(
        2,
        './mocks/workflow-3.mock.yaml',
        'mock3: generated',
      )

      // process.exitは呼ばれない（エラーがあっても継続）
      expect(mockExit).not.toHaveBeenCalled()

      consoleMock.mockRestore()
      consoleWarnMock.mockRestore()
    })
  })
})
