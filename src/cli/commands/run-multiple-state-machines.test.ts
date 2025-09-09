import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as configLoader from '../../config/loader'
import { runCommand } from './run'

// モック設定
vi.mock('node:fs')
vi.mock('../../config/loader')
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  })),
}))

// StateMachineExecutorのモック
vi.mock('../../core/interpreter/executor')

// MockEngineのモック
const mockLoadMocks = vi.fn()
vi.mock('../../core/mock/engine', () => ({
  MockEngine: vi.fn().mockImplementation(() => ({
    loadMocks: mockLoadMocks,
  })),
}))

// process.exitのモック
const mockExit = vi.fn()
vi.stubGlobal('process', { ...process, exit: mockExit })

const mockedExistsSync = vi.mocked(existsSync)
const mockedReadFileSync = vi.mocked(readFileSync)
const mockedLoadProjectConfig = vi.mocked(configLoader.loadProjectConfig)
const mockedLoadStateMachineDefinition = vi.mocked(configLoader.loadStateMachineDefinition)
const mockedResolveMockPath = vi.mocked(configLoader.resolveMockPath)

// StateMachineExecutorのモック参照
const mockExecute = vi.fn()

describe('runCommand - multiple state machines', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockExit.mockClear()
    mockExecute.mockClear()
    mockLoadMocks.mockImplementation(() => {})

    // StateMachineExecutorのモックを設定
    const { StateMachineExecutor } = await import('../../core/interpreter/executor')
    const mockedStateMachineExecutor = vi.mocked(StateMachineExecutor)
    mockedStateMachineExecutor.mockImplementation(
      () =>
        ({
          execute: mockExecute,
        }) as any,
    )
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

    it('should run all state machines sequentially without arguments', async () => {
      // DEFAULT_CONFIG_FILEの存在をシミュレート
      mockedExistsSync
        .mockReturnValueOnce(true) // DEFAULT_CONFIG_FILE exists (first call in runDefaultMode)
        .mockReturnValueOnce(false) // testSuitesDir does not exist -> go to stateMachines logic
        .mockReturnValue(true) // Mock files exist

      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedLoadStateMachineDefinition
        .mockReturnValueOnce(mockStateMachine1)
        .mockReturnValueOnce(mockStateMachine2)
        .mockReturnValueOnce(mockStateMachine3)

      mockedResolveMockPath
        .mockReturnValueOnce('./mocks/workflow-1.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-2.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-3.mock.yaml')

      mockedReadFileSync
        .mockReturnValueOnce('mock1: content')
        .mockReturnValueOnce('mock2: content')
        .mockReturnValueOnce('mock3: content')

      mockExecute
        .mockResolvedValueOnce({ result: 'success1', path: ['State1'] })
        .mockResolvedValueOnce({ result: 'success2', path: ['State2'] })
        .mockResolvedValueOnce({ result: 'success3', path: ['State3'] })

      await runCommand({})

      // 3つのステートマシンが順番に読み込まれることを確認
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

      // 3つのステートマシンが順番に実行されることを確認
      expect(mockExecute).toHaveBeenCalledTimes(3)
    })

    it('should handle errors in one state machine and continue with others', async () => {
      // DEFAULT_CONFIG_FILEの存在をシミュレート
      mockedExistsSync
        .mockReturnValueOnce(true) // DEFAULT_CONFIG_FILE exists (first call in runDefaultMode)
        .mockReturnValueOnce(false) // testSuitesDir does not exist -> go to stateMachines logic
        .mockReturnValue(true) // Mock files exist

      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedLoadStateMachineDefinition
        .mockReturnValueOnce(mockStateMachine1)
        .mockReturnValueOnce(mockStateMachine2)
        .mockReturnValueOnce(mockStateMachine3)

      mockedResolveMockPath
        .mockReturnValueOnce('./mocks/workflow-1.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-2.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-3.mock.yaml')

      mockedReadFileSync
        .mockReturnValueOnce('mock1: content')
        .mockReturnValueOnce('mock2: content')
        .mockReturnValueOnce('mock3: content')

      mockExecute
        .mockResolvedValueOnce({ result: 'success1', path: ['State1'] })
        .mockRejectedValueOnce(new Error('Failed to run workflow-2'))
        .mockResolvedValueOnce({ result: 'success3', path: ['State3'] })

      // コンソールログのモック
      const consoleMock = vi.spyOn(console, 'error').mockImplementation(() => {})
      const consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => {})

      await runCommand({})

      // エラーが発生したworkflow-2についてエラーログが出力されることを確認
      expect(consoleMock).toHaveBeenCalledWith(expect.stringContaining('Failed to run workflow-2'))

      // 3つのステートマシンすべてが実行を試みることを確認（1つがエラーになっても継続）
      expect(mockExecute).toHaveBeenCalledTimes(3)

      consoleMock.mockRestore()
      consoleLogMock.mockRestore()
    })

    it('should use default input "{}" when no input is provided for multiple state machines', async () => {
      // DEFAULT_CONFIG_FILEの存在をシミュレート
      mockedExistsSync
        .mockReturnValueOnce(true) // DEFAULT_CONFIG_FILE exists (first call in runDefaultMode)
        .mockReturnValueOnce(false) // testSuitesDir does not exist
        .mockReturnValue(false) // Mock files do not exist

      mockedLoadProjectConfig.mockReturnValue(multipleStateMachinesConfig)
      mockedLoadStateMachineDefinition
        .mockReturnValueOnce(mockStateMachine1)
        .mockReturnValueOnce(mockStateMachine2)
        .mockReturnValueOnce(mockStateMachine3)

      mockedResolveMockPath
        .mockReturnValueOnce('./mocks/workflow-1.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-2.mock.yaml')
        .mockReturnValueOnce('./mocks/workflow-3.mock.yaml')

      mockExecute
        .mockResolvedValueOnce({ result: 'success1', path: ['State1'] })
        .mockResolvedValueOnce({ result: 'success2', path: ['State2'] })
        .mockResolvedValueOnce({ result: 'success3', path: ['State3'] })

      await runCommand({})

      // デフォルトの空の入力 "{}" で実行されることを確認
      expect(mockExecute).toHaveBeenCalledTimes(3)
      expect(mockExecute).toHaveBeenCalledWith({}, expect.anything())
    })
  })
})
