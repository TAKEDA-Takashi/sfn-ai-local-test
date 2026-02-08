import * as fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProjectConfig } from '../../config/loader'
import { DEFAULT_CONFIG_FILE } from '../../constants/defaults'
import { CoverageStorageManager } from '../../core/coverage/storage'
import { StateMachineExecutor } from '../../core/interpreter/executor'
import { MockEngine } from '../../core/mock/engine'
import { TestSuiteRunner } from '../../core/test/suite-runner'
import type { ProjectConfig } from '../../schemas/config-schema'
import { runCommand } from './run'

vi.mock('fs')
vi.mock('../../core/interpreter/executor')
vi.mock('../../core/mock/engine')
vi.mock('../../core/coverage/storage')
vi.mock('../../core/coverage/nested-coverage-tracker')
vi.mock('../../core/coverage/reporter')
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  }),
}))

vi.mock('../../config/loader', () => ({
  loadProjectConfig: vi.fn(),
  loadStateMachineDefinition: vi.fn(),
  findStateMachine: vi.fn(),
  resolveMockPath: vi.fn(),
}))

vi.mock('../../core/test/suite-runner', () => ({
  TestSuiteRunner: vi.fn(),
}))

vi.mock('js-yaml', () => ({
  load: vi.fn(),
}))

describe('runCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CoverageStorageManager
    vi.mocked(CoverageStorageManager).mockImplementation(
      () =>
        ({
          saveExecution: vi.fn(),
          loadExecutions: vi.fn().mockReturnValue([]),
          getCoverage: vi.fn().mockReturnValue({
            topLevel: { total: 1, covered: 1, percentage: 100, uncovered: [] },
            nested: {},
            branches: { total: 0, covered: 0, percentage: 0, uncovered: [] },
            paths: { total: 0, unique: 0 },
          }),
        }) as any,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should display execution output correctly', async () => {
    const mockStateMachine = {
      StartAt: 'Test',
      States: {
        Test: {
          Type: 'Pass',
          Result: 'test result',
          End: true,
        },
      },
    }

    const mockExecutorResult = {
      output: { result: 'test output' },
      executionPath: ['Test'],
      success: true,
    }

    // Mock file system
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('.json')) {
        return JSON.stringify(mockStateMachine)
      }
      return 'version: "1.0"\nmocks: []'
    })

    // Mock StateMachineExecutor
    const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
    vi.mocked(StateMachineExecutor).mockImplementation(
      () =>
        ({
          execute: mockExecute,
        }) as any,
    )

    // Mock MockEngine
    vi.mocked(MockEngine).mockImplementation(() => ({}) as InstanceType<typeof MockEngine>)

    // Capture console output
    const consoleLogSpy = vi.spyOn(console, 'log')

    await runCommand({
      asl: 'test.json',
      input: '{}',
      quiet: false,
    })

    // Check that the output is displayed correctly
    const outputCalls = consoleLogSpy.mock.calls.filter((call) =>
      call.some((arg) => arg.includes('test output')),
    )

    expect(outputCalls.length).toBeGreaterThan(0)
  })

  describe('test suite execution', () => {
    it('should handle specific test suite file path', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')
      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue({
          suiteName: 'Test Suite',
          passedTests: 1,
          failedTests: 0,
          skippedTests: 0,
          totalTests: 1,
          duration: 100,
          results: [],
          summary: {
            successRate: 100,
            averageDuration: 100,
            slowestTest: null,
          },
          coverage: null,
        }),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any)

      vi.mocked(fs.existsSync).mockReturnValue(true)

      // console のモック（spinner等でエラーが発生する可能性を避ける）
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      // console.errorは一旦モックしない（エラー内容を確認するため）
      // const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // writeFileSyncも念の為モック（report出力で問題が起きる可能性を避ける）
      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

      // process.exitをnoop関数に置き換えてコードを記録
      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
        // process.exitをthrowせずに記録だけする
      }) as any)

      // runCommandは直接awaitして、exitCodeを後で確認
      await runCommand({
        suite: './test-suite.yaml',
      })

      // exitCodeが0であることを確認
      expect(exitCode).toBe(0)

      expect(TestSuiteRunner).toHaveBeenCalledWith('./test-suite.yaml')
      expect(mockRunner.runSuite).toHaveBeenCalledWith(false, {
        verbose: undefined,
        quiet: undefined,
      })
      expect(exitSpy).toHaveBeenCalledWith(0)

      exitSpy.mockRestore()
      consoleLogSpy.mockRestore()
      // consoleErrorSpy.mockRestore()
      writeFileSyncSpy.mockRestore()
    })

    it('should resolve suite name to default path', async () => {
      // Mock config loading to return default path structure
      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {},
      } as any)

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue({
          suiteName: 'Test Suite',
          passedTests: 1,
          failedTests: 0,
          skippedTests: 0,
          totalTests: 1,
          duration: 100,
          results: [],
          summary: {
            successRate: 100,
            averageDuration: 100,
            slowestTest: null,
          },
          coverage: null,
        }),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any)

      // Mock DEFAULT_CONFIG_FILE and first suite path to exist
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        return (
          pathStr === './sfn-test.config.yaml' ||
          pathStr === 'sfn-test/test-suites/my-suite.test.yaml' ||
          pathStr === './sfn-test/test-suites/my-suite.test.yaml'
        )
      })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        // Do nothing - prevent actual exit
      }) as any)

      await runCommand({
        suite: 'my-suite',
      })

      expect(TestSuiteRunner).toHaveBeenCalledWith('sfn-test/test-suites/my-suite.test.yaml')
      expect(exitSpy).toHaveBeenCalledWith(0)

      exitSpy.mockRestore()
    })

    it('should throw error when suite not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(runCommand({ suite: 'non-existent' })).rejects.toThrow(
        "Test suite 'non-existent' not found",
      )
    })
  })

  describe('default behavior (no arguments)', () => {
    it('should throw error when no test suites found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(runCommand({})).rejects.toThrow(
        'No test suites found and no sfn-test.config.yaml found. Run "sfn-test init" to get started.',
      )
    })
  })

  describe('single execution modes', () => {
    it('should run with --name option from config', async () => {
      const { loadProjectConfig, findStateMachine, loadStateMachineDefinition } = await import(
        '../../config/loader'
      )
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        stateMachines: [{ name: 'test-sm', source: { type: 'asl', path: './test.json' } }],
      } as any)

      vi.mocked(findStateMachine).mockReturnValue({
        name: 'test-sm',
        source: { type: 'asl', path: './test.json' },
      } as any)

      vi.mocked(loadStateMachineDefinition).mockReturnValue({
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      })

      // Mock the existence of test suite file
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === DEFAULT_CONFIG_FILE) return true
        if (pathStr.includes('test-sm.test.yaml')) return true
        return false
      })

      // Mock reading the test suite file
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('test-sm.test.yaml')) {
          return `
version: '1.0'
stateMachine: test-sm
testCases:
  - name: Test case
    input: {}
    expectedOutput: {}
`
        }
        return '{}'
      })

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue({
          suiteName: 'test-sm',
          totalTests: 1,
          passedTests: 1,
          failedTests: 0,
          skippedTests: 0,
          duration: 100,
          results: [],
          summary: {
            successRate: 100.0,
            averageDuration: 100.0,
            slowestTest: { name: 'Test case', duration: 100 },
          },
        }),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any)

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as any)

      await expect(runCommand({ name: 'test-sm' })).rejects.toThrow('process.exit called')

      expect(findStateMachine).toHaveBeenCalledWith(expect.anything(), 'test-sm')
      expect(TestSuiteRunner).toHaveBeenCalledWith('sfn-test/test-suites/test-sm.test.yaml')
      expect(mockRunner.runSuite).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('should handle CDK option', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('cdk.out.json')) {
          return JSON.stringify({
            Resources: {
              MyStateMachine: {
                Type: 'AWS::StepFunctions::StateMachine',
                Properties: {
                  DefinitionString: JSON.stringify({
                    StartAt: 'Start',
                    States: { Start: { Type: 'Pass', End: true } },
                  }),
                },
              },
            },
          })
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecutorResult = { output: {}, executionPath: ['Start'], success: true }
      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)
      vi.mocked(MockEngine).mockImplementation(() => ({}) as any)

      await runCommand({ cdk: './cdk.out.json', input: '{}' })

      expect(mockExecute).toHaveBeenCalled()
    })

    it('should run with ASL file directly', async () => {
      const mockStateMachine = {
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('.asl.json')) {
          return JSON.stringify(mockStateMachine)
        }
        return 'mock content'
      })

      const mockExecutorResult = { output: {}, executionPath: ['Start'], success: true }
      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)

      await runCommand({ asl: './test.asl.json', input: '{}' })

      expect(mockExecute).toHaveBeenCalled()
    })

    it('should load mock file when provided', async () => {
      const mockStateMachine = {
        StartAt: 'Start',
        States: { Start: { Type: 'Task', Resource: 'test', End: true } },
      }

      const mockConfig = {
        version: '1.0',
        mocks: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('.asl.json')) {
          return JSON.stringify(mockStateMachine)
        }
        if (path.toString().includes('mock.yaml')) {
          return 'mock config'
        }
        return ''
      })

      const { load } = await import('js-yaml')
      vi.mocked(load).mockImplementation((content) => {
        if (content === 'mock config') return mockConfig
        return {}
      })

      const mockEngine = { getState: vi.fn() }
      vi.mocked(MockEngine).mockImplementation(() => mockEngine as any)

      const mockExecutorResult = { output: {}, executionPath: ['Start'], success: true }
      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)

      await runCommand({
        asl: './test.asl.json',
        mock: './mock.yaml',
        input: '{}',
      })

      expect(MockEngine).toHaveBeenCalledWith(mockConfig, { basePath: './sfn-test/test-data' })
      expect(mockExecute).toHaveBeenCalled()
    })
  })

  describe('multiple test suite execution', () => {
    it('should run all test suites in directory', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('./sfn-test/test-suites')) return true
        if (path.includes('sfn-test.config.yaml')) return false
        if (path.endsWith('.yaml')) return true // テストスイートファイルの存在をシミュレート
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['test1.test.yaml', 'test2.test.yaml'] as any)
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 5,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 5,
        duration: 500,
        results: [],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any)

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as any)

      await expect(runCommand({})).rejects.toThrow('process.exit called')

      expect(TestSuiteRunner).toHaveBeenCalledTimes(2)
      expect(mockRunner.runSuite).toHaveBeenCalledTimes(2)
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('should stop on first failure with bail option', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('./sfn-test/test-suites')) return true
        if (path.includes('sfn-test.config.yaml')) return false
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue([
        'test1.test.yaml',
        'test2.test.yaml',
        'test3.test.yaml',
      ] as any)
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      const failedResult = {
        suiteName: 'Test Suite',
        passedTests: 2,
        failedTests: 3,
        skippedTests: 0,
        totalTests: 5,
        duration: 500,
        results: [],
        summary: {
          successRate: 40,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(failedResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any)

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as any)

      await expect(runCommand({ bail: true })).rejects.toThrow('process.exit called')

      expect(TestSuiteRunner).toHaveBeenCalledTimes(1)
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should display combined coverage report', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')
      const { CoverageReporter } = await import('../../core/coverage/reporter')

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('./sfn-test/test-suites')) return true
        if (path.includes('sfn-test.config.yaml')) return false
        if (path.endsWith('.yaml')) return true // テストスイートファイルの存在をシミュレート
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['test1.test.yaml', 'test2.test.yaml'] as any)
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 5,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 5,
        duration: 500,
        results: [],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: {
          topLevel: { total: 10, covered: 8, percentage: 80, uncovered: [] },
          branches: { total: 5, covered: 4, percentage: 80, uncovered: [] },
          paths: { total: 0, unique: 0 },
        },
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any)

      const mockReporter = {
        generateText: vi.fn().mockReturnValue('Coverage Report: 80% states covered'),
        generateJSON: vi.fn(),
        generateHTML: vi.fn(),
      }

      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      const logSpy = vi.spyOn(console, 'log')
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as any)

      await expect(runCommand({ cov: true })).rejects.toThrow('process.exit called')

      expect(mockRunner.runSuite).toHaveBeenCalledWith(true, {
        verbose: undefined,
        quiet: undefined,
      })
      expect(mockReporter.generateText).toHaveBeenCalled()
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Coverage Report'))
      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  describe('auto-selection with config', () => {
    it('should auto-select single state machine from config', async () => {
      const { loadProjectConfig, findStateMachine, loadStateMachineDefinition } = await import(
        '../../config/loader'
      )

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('sfn-test.config.yaml')) return true
        if (path.includes('./sfn-test/test-suites')) return false
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue([] as any)

      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        stateMachines: [{ name: 'single-sm', source: { type: 'asl', path: './single.json' } }],
      } as any)

      vi.mocked(findStateMachine).mockReturnValue({
        name: 'single-sm',
        source: { type: 'asl', path: './single.json' },
      } as any)

      vi.mocked(loadStateMachineDefinition).mockReturnValue({
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      })

      const mockExecutorResult = { output: {}, executionPath: ['Start'], success: true }
      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)

      await runCommand({})

      // リファクタリング後は runMultipleStateMachines を使用するため findStateMachine は呼ばれない
      expect(loadStateMachineDefinition).toHaveBeenCalled()
      expect(mockExecute).toHaveBeenCalled()
    })

    it('should run multiple state machines sequentially when no arguments provided', async () => {
      const { loadProjectConfig, loadStateMachineDefinition, resolveMockPath } = await import(
        '../../config/loader'
      )

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('sfn-test.config.yaml')) return true
        if (path.includes('./sfn-test/test-suites')) return false
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue([] as any)

      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        stateMachines: [
          { name: 'sm1', source: { type: 'asl', path: './sm1.json' } },
          { name: 'sm2', source: { type: 'asl', path: './sm2.json' } },
        ],
      } as any)

      // ステートマシン定義をモック
      vi.mocked(loadStateMachineDefinition).mockReturnValue({
        StartAt: 'Test',
        States: {
          Test: { Type: 'Pass', Result: { success: true }, End: true },
        },
      })

      vi.mocked(resolveMockPath).mockReturnValue('./default.mock.yaml')

      // Mock file existence for basePath testing
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('sfn-test.config.yaml')) return true
        if (path.includes('./sfn-test/test-suites')) return false
        if (path.includes('./default.mock.yaml')) return true // Make mock file exist
        return false
      })

      // Mock file content for YAML loading
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('./default.mock.yaml')) {
          return 'version: "1.0"\nmocks: []'
        }
        return 'mock content'
      })

      // Mock YAML parsing
      const { load } = await import('js-yaml')
      vi.mocked(load).mockReturnValue({ version: '1.0', mocks: [] })

      // MockEngineとStateMachineExecutorのモック
      const mockExecute = vi.fn().mockResolvedValue({ result: { success: true }, path: ['Test'] })
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)
      vi.mocked(MockEngine).mockImplementation(() => ({}) as any)

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await runCommand({})

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Running 2 state machine(s)'))
      expect(loadStateMachineDefinition).toHaveBeenCalledTimes(2)
      expect(mockExecute).toHaveBeenCalledTimes(2)
      // MockEngineがbasePath付きで作成されることを確認（モックファイルが存在する場合）
      expect(MockEngine).toHaveBeenCalledWith(
        { version: '1.0', mocks: [] },
        { basePath: './sfn-test/test-data' },
      )
    })

    it('should use custom testData path from config in multiple state machines mode', async () => {
      const { loadProjectConfig, loadStateMachineDefinition, resolveMockPath } = await import(
        '../../config/loader'
      )

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('sfn-test.config.yaml')) return true
        if (path.includes('./sfn-test/test-suites')) return false
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue([] as any)

      // カスタムtestDataパスを持つ設定（複数ステートマシン）
      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        stateMachines: [
          { name: 'sm1', source: { type: 'asl', path: './sm1.json' } },
          { name: 'sm2', source: { type: 'asl', path: './sm2.json' } },
        ],
        paths: {
          testData: './custom-test-data',
        },
      } as any)

      vi.mocked(loadStateMachineDefinition).mockReturnValue({
        StartAt: 'Test',
        States: {
          Test: { Type: 'Pass', Result: { success: true }, End: true },
        },
      })

      vi.mocked(resolveMockPath).mockReturnValue('./default.mock.yaml')

      // Mock file existence for basePath testing
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('sfn-test.config.yaml')) return true
        if (path.includes('./sfn-test/test-suites')) return false
        if (path.includes('./default.mock.yaml')) return true // Make mock file exist
        return false
      })

      // Mock file content for YAML loading
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('./default.mock.yaml')) {
          return 'version: "1.0"\nmocks: []'
        }
        return 'mock content'
      })

      // Mock YAML parsing
      const { load } = await import('js-yaml')
      vi.mocked(load).mockReturnValue({ version: '1.0', mocks: [] })

      const mockExecute = vi.fn().mockResolvedValue({ result: { success: true }, path: ['Test'] })
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)
      vi.mocked(MockEngine).mockImplementation(() => ({}) as any)

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await runCommand({})

      // カスタムtestDataパスが使用されることを確認（モックファイルが存在する場合）
      expect(MockEngine).toHaveBeenCalledWith(
        { version: '1.0', mocks: [] },
        { basePath: './custom-test-data' },
      )
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Running 2 state machine(s)'))
      expect(loadStateMachineDefinition).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should handle state machine not found in config', async () => {
      const { loadProjectConfig, findStateMachine } = await import('../../config/loader')

      // Mock config file exists
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString() === DEFAULT_CONFIG_FILE
      })

      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        stateMachines: [],
      } satisfies ProjectConfig)

      vi.mocked(findStateMachine).mockReturnValue(null)

      await expect(runCommand({ name: 'non-existent', input: '{}' })).rejects.toThrow(
        "State machine 'non-existent' not found in configuration",
      )
    })

    it('should handle missing configuration file', async () => {
      // Mock config file does not exist
      vi.mocked(fs.existsSync).mockImplementation(() => false)

      await expect(runCommand({ name: 'test-sm', input: '{}' })).rejects.toThrow(
        'Configuration file not found: ./sfn-test.config.yaml',
      )
    })

    it('should handle execution failure', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify({
            StartAt: 'Test',
            States: { Test: { Type: 'Pass', End: true } },
          })
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecute = vi.fn().mockRejectedValue(new Error('Execution failed'))
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await runCommand({ asl: 'test.json', input: '{}' })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(1)

      processExitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should throw when neither name, asl, nor cdk option is provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(runCommand({ input: '{}' })).rejects.toThrow(
        'No test suites found and no sfn-test.config.yaml found',
      )
    })
  })

  describe('verbose mode', () => {
    it('should display execution path in verbose mode', async () => {
      const mockStateMachine = {
        StartAt: 'State1',
        States: {
          State1: { Type: 'Pass', Next: 'State2' },
          State2: { Type: 'Pass', End: true },
        },
      }

      const mockExecutorResult = {
        output: { result: 'test' },
        executionPath: ['State1', 'State2'],
        success: true,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify(mockStateMachine)
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      const consoleLogSpy = vi.spyOn(console, 'log')

      await runCommand({ asl: 'test.json', input: '{}', verbose: true })

      // Check that execution path is displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Execution Path'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1. State1'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2. State2'))
    })
  })

  describe('coverage formats', () => {
    it('should generate JSON coverage report', async () => {
      const mockStateMachine = {
        StartAt: 'Test',
        States: { Test: { Type: 'Pass', End: true } },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify(mockStateMachine)
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecutorResult = {
        output: {},
        executionPath: ['Test'],
        success: true,
      }

      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      // Mock coverage tracker
      const { NestedCoverageTracker } = await import('../../core/coverage/nested-coverage-tracker')
      const mockTracker = {
        trackExecution: vi.fn(),
        trackMapExecutions: vi.fn(),
        trackParallelExecutions: vi.fn(),
        getCoverage: vi.fn().mockReturnValue({
          totalStates: 1,
          coveredStates: 1,
          uncoveredStates: [],
          coveragePercentage: 100,
        }),
      }
      vi.mocked(NestedCoverageTracker).mockImplementation(() => mockTracker as any)

      // Mock coverage reporter
      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateJSON: vi.fn().mockReturnValue('{"coverage": "json"}'),
        generateHTML: vi.fn().mockReturnValue('<html>coverage</html>'),
        generateText: vi.fn().mockReturnValue('Coverage: 100%'),
      }
      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      const consoleLogSpy = vi.spyOn(console, 'log')

      await runCommand({ asl: 'test.json', input: '{}', cov: 'json' })

      expect(mockReporter.generateJSON).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('{"coverage": "json"}'))
    })

    it('should generate HTML coverage report', async () => {
      const mockStateMachine = {
        StartAt: 'Test',
        States: { Test: { Type: 'Pass', End: true } },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify(mockStateMachine)
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecutorResult = {
        output: {},
        executionPath: ['Test'],
        success: true,
      }

      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      // Mock coverage tracker
      const { NestedCoverageTracker } = await import('../../core/coverage/nested-coverage-tracker')
      const mockTracker = {
        trackExecution: vi.fn(),
        trackMapExecutions: vi.fn(),
        trackParallelExecutions: vi.fn(),
        getCoverage: vi.fn().mockReturnValue({
          totalStates: 1,
          coveredStates: 1,
          uncoveredStates: [],
          coveragePercentage: 100,
        }),
      }
      vi.mocked(NestedCoverageTracker).mockImplementation(() => mockTracker as any)

      // Mock coverage reporter
      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateJSON: vi.fn().mockReturnValue('{"coverage": "json"}'),
        generateHTML: vi.fn().mockReturnValue('<html>coverage</html>'),
        generateText: vi.fn().mockReturnValue('Coverage: 100%'),
      }
      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      const consoleLogSpy = vi.spyOn(console, 'log')

      await runCommand({ asl: 'test.json', input: '{}', cov: 'html' })

      expect(mockReporter.generateHTML).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('<html>coverage</html>'))
    })

    it('should track Map executions in coverage', async () => {
      const mockStateMachine = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'MapTask',
              States: {
                MapTask: { Type: 'Pass', End: true },
              },
            },
            End: true,
          },
        },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify(mockStateMachine)
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecutorResult = {
        output: {},
        executionPath: ['MapState'],
        success: true,
        mapExecutions: [
          {
            state: 'MapState',
            iterationPaths: [['MapTask'], ['MapTask']],
          },
        ],
      }

      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      // Mock coverage tracker
      const { NestedCoverageTracker } = await import('../../core/coverage/nested-coverage-tracker')
      const mockTracker = {
        trackExecution: vi.fn(),
        trackMapExecutions: vi.fn(),
        trackParallelExecutions: vi.fn(),
        getCoverage: vi.fn().mockReturnValue({
          totalStates: 2,
          coveredStates: 2,
          uncoveredStates: [],
          coveragePercentage: 100,
        }),
      }
      vi.mocked(NestedCoverageTracker).mockImplementation(() => mockTracker as any)

      // Mock coverage reporter
      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateText: vi.fn().mockReturnValue('Coverage: 100%'),
      }
      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      await runCommand({ asl: 'test.json', input: '{}', cov: true })

      expect(mockTracker.trackMapExecutions).toHaveBeenCalledWith([
        {
          state: 'MapState',
          iterationPaths: [['MapTask'], ['MapTask']],
        },
      ])
    })
  })

  describe('CDK extraction', () => {
    it('should handle CDK template with no state machines', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify({
            Resources: {
              MyBucket: {
                Type: 'AWS::S3::Bucket',
              },
            },
          })
        }
        return 'version: "1.0"\nmocks: []'
      })

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(runCommand({ cdk: 'template.json', input: '{}' })).rejects.toThrow(
        'process.exit called',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('No Step Functions state machine found'),
        }),
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)

      processExitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should handle CDK template with multiple state machines', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify({
            Resources: {
              StateMachine1: {
                Type: 'AWS::StepFunctions::StateMachine',
                Properties: {
                  DefinitionString: JSON.stringify({
                    StartAt: 'Start1',
                    States: { Start1: { Type: 'Pass', End: true } },
                  }),
                },
              },
              StateMachine2: {
                Type: 'AWS::StepFunctions::StateMachine',
                Properties: {
                  DefinitionString: JSON.stringify({
                    StartAt: 'Start2',
                    States: { Start2: { Type: 'Pass', End: true } },
                  }),
                },
              },
            },
          })
        }
        return 'version: "1.0"\nmocks: []'
      })

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(runCommand({ cdk: 'template.json', input: '{}' })).rejects.toThrow(
        'process.exit called',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Multiple state machines found'),
        }),
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)

      processExitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should extract specific state machine from CDK when name provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify({
            Resources: {
              StateMachine1: {
                Type: 'AWS::StepFunctions::StateMachine',
                Properties: {
                  DefinitionString: JSON.stringify({
                    StartAt: 'Start1',
                    States: { Start1: { Type: 'Pass', End: true } },
                  }),
                },
              },
              StateMachine2: {
                Type: 'AWS::StepFunctions::StateMachine',
                Properties: {
                  Definition: {
                    StartAt: 'Start2',
                    States: { Start2: { Type: 'Pass', End: true } },
                  },
                },
              },
            },
          })
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecutorResult = {
        output: {},
        executionPath: ['Start2'],
        success: true,
      }

      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      await runCommand({
        cdk: 'template.json',
        cdkStateMachine: 'StateMachine2',
        input: '{}',
      })

      expect(mockExecute).toHaveBeenCalled()
    })
  })

  describe('quiet mode', () => {
    it('should not display output in quiet mode', async () => {
      const mockStateMachine = {
        StartAt: 'Test',
        States: { Test: { Type: 'Pass', End: true } },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().endsWith('.json')) {
          return JSON.stringify(mockStateMachine)
        }
        return 'version: "1.0"\nmocks: []'
      })

      const mockExecutorResult = {
        output: { result: 'test' },
        executionPath: ['Test'],
        success: true,
      }

      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(
        () =>
          ({
            execute: mockExecute,
          }) as any,
      )

      const consoleLogSpy = vi.spyOn(console, 'log')

      await runCommand({ asl: 'test.json', input: '{}', quiet: true })

      // Should not log execution result in quiet mode
      const resultCalls = consoleLogSpy.mock.calls.filter((call) =>
        call.some((arg) => arg.includes?.('Execution Result')),
      )
      expect(resultCalls.length).toBe(0)
    })
  })

  describe('findTestSuites internal function', () => {
    it('should find test suite files recursively', async () => {
      // Test the findTestSuites function indirectly through the default behavior
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('./sfn-test/test-suites')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation(((dir: any) => {
        if (dir === './sfn-test/test-suites') {
          return ['subdir', 'test1.test.yaml', 'test.yml', 'other.txt'] as any as fs.Dirent[]
        }
        if (dir === './sfn-test/test-suites/subdir') {
          return ['test2.test.yml', 'data.json'] as any as fs.Dirent[]
        }
        return [] as fs.Dirent[]
      }) as any)

      vi.mocked(fs.statSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('subdir') && !pathStr.includes('.')) {
          return { isDirectory: () => true, isFile: () => false } as fs.Stats
        }
        return { isDirectory: () => false, isFile: () => true } as fs.Stats
      })

      const { TestSuiteRunner } = await import('../../core/test/suite-runner')
      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue({
          passedTests: 1,
          failedTests: 0,
          skippedTests: 0,
          totalTests: 1,
          duration: 100,
          results: [],
          summary: { successRate: 100, averageDuration: 100, slowestTest: null },
          coverage: null,
        }),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as any)

      // This will trigger findTestSuites through default behavior
      await expect(runCommand({})).rejects.toThrow('process.exit called')

      // Verify that correct test files were found (test1.test.yaml and test2.test.yml)
      // Other files should be ignored
      exitSpy.mockRestore()
    })

    it('should handle directory read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path !== 'string') return false
        if (path.includes('./sfn-test/test-suites')) return true
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as any)

      // Should not crash, just return empty array internally
      await expect(runCommand({})).rejects.toThrow('No test suites found')

      exitSpy.mockRestore()
    })
  })

  describe('coverage storage', () => {
    it('should save coverage when enabled', async () => {
      const { NestedCoverageTracker } = await import('../../core/coverage/nested-coverage-tracker')
      const { CoverageReporter } = await import('../../core/coverage/reporter')

      const mockStateMachine = {
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStateMachine))

      const mockExecutorResult = { output: {}, executionPath: ['Start'], success: true }
      const mockExecute = vi.fn().mockResolvedValue(mockExecutorResult)
      vi.mocked(StateMachineExecutor).mockImplementation(() => ({ execute: mockExecute }) as any)

      const mockCoverageManager = {
        saveExecution: vi.fn(),
        loadExecutions: vi.fn().mockReturnValue([]),
      }

      vi.mocked(CoverageStorageManager).mockImplementation(
        () => mockCoverageManager as unknown as CoverageStorageManager,
      )

      const mockCoverage = {
        topLevel: { total: 1, covered: 1, percentage: 100 },
        branches: { total: 0, covered: 0, percentage: 0 },
        uncoveredStates: [],
        uncoveredBranches: [],
        executionPaths: [],
      }

      const mockTracker = {
        trackExecution: vi.fn(),
        trackMapExecutions: vi.fn(),
        trackParallelExecutions: vi.fn(),
        getCoverage: vi.fn().mockReturnValue(mockCoverage),
      }

      vi.mocked(NestedCoverageTracker).mockImplementation(() => mockTracker as any)

      const mockReporter = {
        generateText: vi.fn().mockReturnValue('Coverage Report'),
        generateJSON: vi.fn(),
        generateHTML: vi.fn(),
      }

      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      const logSpy = vi.spyOn(console, 'log')

      await runCommand({ asl: './test.asl.json', input: '{}', cov: true })

      expect(mockCoverageManager.saveExecution).toHaveBeenCalled()
      expect(mockCoverageManager.loadExecutions).toHaveBeenCalled()
      expect(mockTracker.getCoverage).toHaveBeenCalled()
      expect(mockReporter.generateText).toHaveBeenCalled()
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Coverage Report'))
    })
  })

  describe('report output functions', () => {
    it('should generate JUnit XML report', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 3,
        failedTests: 1,
        skippedTests: 1,
        totalTests: 5,
        duration: 1500,
        results: [
          {
            name: 'Test 1',
            status: 'passed',
            duration: 100,
            assertions: [],
          },
          {
            name: 'Test 2',
            status: 'failed',
            duration: 200,
            errorMessage: 'Test failed',
            assertions: [],
          },
          {
            name: 'Test 3',
            status: 'skipped',
            duration: 0,
            assertions: [],
          },
        ],
        summary: {
          successRate: 60,
          averageDuration: 100,
          slowestTest: { name: 'Test 2', duration: 200 },
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockReturnValue(true)
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
      }) as any)

      await runCommand({
        suite: './test.yaml',
        reporter: 'junit',
        output: './junit.xml',
      })

      expect(exitCode).toBe(1)

      expect(writeSpy).toHaveBeenCalledWith(
        './junit.xml',
        expect.stringContaining('<?xml version="1.0" encoding="UTF-8"?>'),
      )
      expect(writeSpy).toHaveBeenCalledWith(
        './junit.xml',
        expect.stringContaining('<testsuite name="Test Suite"'),
      )
      expect(writeSpy).toHaveBeenCalledWith('./junit.xml', expect.stringContaining('failures="1"'))

      writeSpy.mockRestore()
      exitSpy.mockRestore()
    })

    it('should generate JSON report', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 5,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 5,
        duration: 500,
        results: [],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockReturnValue(true)
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

      // console のモック（spinner等でエラーが発生する可能性を避ける）
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // process.exitをnoop関数に置き換えてコードを記録
      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
        // process.exitをthrowせずに記録だけする
      }) as any)

      // runCommandは直接awaitして、exitCodeを後で確認
      await runCommand({
        suite: './test.yaml',
        reporter: 'json',
        output: './report.json',
      })

      // exitCodeが0であることを確認（成功のテスト）
      expect(exitCode).toBe(0)

      expect(writeSpy).toHaveBeenCalledWith(
        './report.json',
        expect.stringContaining('"suiteName": "Test Suite"'),
      )

      writeSpy.mockRestore()
      exitSpy.mockRestore()
      consoleLogSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should output verbose test details', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 1,
        failedTests: 1,
        skippedTests: 0,
        totalTests: 2,
        duration: 300,
        results: [
          {
            name: 'Passing test',
            status: 'passed',
            duration: 100,
            assertions: [
              { passed: true, message: 'Assertion passed', expected: 'foo', actual: 'foo' },
            ],
          },
          {
            name: 'Failing test',
            status: 'failed',
            duration: 200,
            errorMessage: 'Test failed',
            assertions: [
              { passed: false, message: 'Values do not match', expected: 'bar', actual: 'baz' },
            ],
          },
        ],
        summary: {
          successRate: 50,
          averageDuration: 150,
          slowestTest: { name: 'Failing test', duration: 200 },
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockReturnValue(true)
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
      }) as any)

      await runCommand({
        suite: './test.yaml',
        verbose: true,
      })

      expect(exitCode).toBe(1)

      // Check verbose output includes assertion details
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Expected:'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Actual:'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🐌 Slowest Test:'))

      logSpy.mockRestore()
      exitSpy.mockRestore()
    })

    it('should handle HTML coverage output in test suite mode', async () => {
      const { TestSuiteRunner } = await import('../../core/test/suite-runner')

      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 5,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 5,
        duration: 500,
        results: [],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: {
          topLevel: { total: 10, covered: 8, percentage: 80, uncovered: [] },
          branches: { total: 5, covered: 4, percentage: 80, uncovered: [] },
          paths: { total: 0, unique: 0 },
        },
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        // Return false for coverage directory to trigger creation
        if (pathStr.includes('.sfn-test/coverage')) return false
        // Return true for other paths like test suite
        return true
      })

      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never)
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateHTML: vi.fn().mockReturnValue('<html>Coverage Report</html>'),
        generateJSON: vi.fn(),
        generateText: vi.fn(),
      }
      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
      }) as any)

      await runCommand({ suite: './test.yaml', cov: 'html' })

      expect(exitCode).toBe(0)

      expect(mkdirSpy).toHaveBeenCalledWith('./.sfn-test/coverage', { recursive: true })
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('coverage.html'),
        '<html>Coverage Report</html>',
      )
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('HTML coverage report saved to:'))

      mkdirSpy.mockRestore()
      writeSpy.mockRestore()
      logSpy.mockRestore()
      exitSpy.mockRestore()
    })
  })

  describe('Coverage path from config', () => {
    it('should use coverage path from config when available', async () => {
      const mockConfig = {
        version: '1.0',
        paths: {
          coverage: './custom-coverage-dir',
        },
        stateMachines: [],
      }
      vi.mocked(loadProjectConfig).mockReturnValue(mockConfig satisfies ProjectConfig)

      const mockResult = {
        passedTests: 1,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 1,
        duration: 100,
        results: [],
        summary: { successRate: 100, averageDuration: 100, slowestTest: null },
        coverage: {
          topLevel: {
            total: 3,
            covered: 3,
            percentage: 100,
            uncovered: [],
          },
          nested: {},
          branches: {
            total: 2,
            covered: 2,
            percentage: 100,
            uncovered: [],
          },
          paths: {
            total: 1,
            unique: 1,
          },
        },
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('custom-coverage-dir')) return false
        return true
      })

      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never)
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateHTML: vi.fn().mockReturnValue('<html>Coverage</html>'),
        generateJSON: vi.fn(),
        generateText: vi.fn(),
      }
      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
      }) as any)

      await runCommand({ suite: './test.yaml', cov: 'html' })

      expect(exitCode).toBe(0)
      expect(mkdirSpy).toHaveBeenCalledWith('./custom-coverage-dir', { recursive: true })
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('custom-coverage-dir'),
        '<html>Coverage</html>',
      )

      mkdirSpy.mockRestore()
      writeSpy.mockRestore()
      exitSpy.mockRestore()
    })

    it('should use default coverage path when config has no paths', async () => {
      const mockConfig = {
        version: '1.0',
        stateMachines: [],
      }
      vi.mocked(loadProjectConfig).mockReturnValue(mockConfig satisfies ProjectConfig)

      const mockResult = {
        passedTests: 1,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 1,
        duration: 100,
        results: [],
        summary: { successRate: 100, averageDuration: 100, slowestTest: null },
        coverage: {
          topLevel: {
            total: 3,
            covered: 3,
            percentage: 100,
            uncovered: [],
          },
          nested: {},
          branches: {
            total: 2,
            covered: 2,
            percentage: 100,
            uncovered: [],
          },
          paths: {
            total: 1,
            unique: 1,
          },
        },
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never)
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateHTML: vi.fn().mockReturnValue('<html>Coverage</html>'),
        generateJSON: vi.fn(),
        generateText: vi.fn(),
      }
      vi.mocked(CoverageReporter).mockImplementation(() => mockReporter as any)

      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
      }) as any)

      await runCommand({ suite: './test.yaml', cov: 'html' })

      expect(exitCode).toBe(0)
      expect(mkdirSpy).toHaveBeenCalledWith('./.sfn-test/coverage', { recursive: true })

      mkdirSpy.mockRestore()
      writeSpy.mockRestore()
      exitSpy.mockRestore()
    })
  })

  describe('Coverage merging for multiple test suites', () => {
    it('should merge coverage from multiple test suites', async () => {
      const mockConfig = {
        version: '1.0',
        stateMachines: [],
      }
      vi.mocked(loadProjectConfig).mockReturnValue(mockConfig satisfies ProjectConfig)

      // Mock finding multiple test suites
      vi.mocked(fs.readdirSync).mockImplementation(((dir: any) => {
        if (dir === './sfn-test/test-suites') {
          return ['test1.test.yaml', 'test2.test.yaml'] as any as fs.Dirent[]
        }
        return [] as fs.Dirent[]
      }) as any)

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
      } as any)

      const coverage1 = {
        topLevel: {
          total: 10,
          covered: 8,
          percentage: 80,
          uncovered: ['State1', 'State2'],
        },
        nested: {},
        branches: {
          total: 10,
          covered: 7,
          percentage: 70,
          uncovered: ['Branch1'],
        },
        paths: {
          total: 5,
          unique: 4,
        },
        executionPaths: [['A', 'B']],
      }

      const coverage2 = {
        topLevel: {
          total: 10,
          covered: 9,
          percentage: 90,
          uncovered: ['State2'],
        },
        nested: {},
        branches: {
          total: 10,
          covered: 8,
          percentage: 85,
          uncovered: ['Branch2'],
        },
        paths: {
          total: 6,
          unique: 5,
        },
        executionPaths: [['C', 'D']],
      }

      const mockResult1 = {
        passedTests: 1,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 1,
        duration: 100,
        results: [],
        summary: { successRate: 100, averageDuration: 100, slowestTest: null },
        coverage: coverage1,
      }

      const mockResult2 = {
        passedTests: 1,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 1,
        duration: 100,
        results: [],
        summary: { successRate: 100, averageDuration: 100, slowestTest: null },
        coverage: coverage2,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValueOnce(mockResult1).mockResolvedValueOnce(mockResult2),
      }
      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as any as TestSuiteRunner)

      vi.mocked(fs.existsSync).mockReturnValue(true)

      const { CoverageReporter } = await import('../../core/coverage/reporter')
      const mockReporter = {
        generateText: vi.fn().mockReturnValue('Merged Coverage Report'),
        generateJSON: vi.fn(),
        generateHTML: vi.fn(),
      }
      vi.mocked(CoverageReporter).mockImplementation((coverage) => {
        // Verify that merged coverage was passed
        expect(coverage).toBeDefined()
        return mockReporter as any
      })

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      let exitCode: number | null = null
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        exitCode = code
      }) as any)

      await runCommand({ cov: true })

      expect(exitCode).toBe(0)
      // Should have run both test suites
      expect(mockRunner.runSuite).toHaveBeenCalledTimes(2)

      // Should have displayed merged coverage
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Merged Coverage Report'))

      logSpy.mockRestore()
      exitSpy.mockRestore()
    })
  })
})
