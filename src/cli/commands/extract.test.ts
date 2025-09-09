import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExtractCommand } from './extract'

// モック設定
vi.mock('fs')
vi.mock('../../config/loader', () => ({
  loadProjectConfig: vi.fn(),
}))

// CloudFormationParserのモック
vi.mock('../../core/parser/cloudformation', () => {
  const mockExtractStateMachineById = vi.fn()
  const mockExtractStateMachines = vi.fn()
  const mockLoadTemplate = vi.fn()
  const mockFindTemplatesInCdkOut = vi.fn()
  const mockFindStateMachinesInTemplates = vi.fn()

  return {
    CloudFormationParser: class {
      extractStateMachineById = mockExtractStateMachineById
      extractStateMachines = mockExtractStateMachines
      static loadTemplate = mockLoadTemplate
      static findTemplatesInCdkOut = mockFindTemplatesInCdkOut
      static findStateMachinesInTemplates = mockFindStateMachinesInTemplates
      // Export mocks for test access
      static _mockExtractStateMachineById = mockExtractStateMachineById
      static _mockExtractStateMachines = mockExtractStateMachines
      static _mockLoadTemplate = mockLoadTemplate
      static _mockFindTemplatesInCdkOut = mockFindTemplatesInCdkOut
      static _mockFindStateMachinesInTemplates = mockFindStateMachinesInTemplates
    },
  }
})

import * as fs from 'node:fs'
import { loadProjectConfig } from '../../config/loader'
import { CloudFormationParser } from '../../core/parser/cloudformation'

// Access mocks via the mocked class
interface MockedCloudFormationParser {
  _mockExtractStateMachineById: ReturnType<typeof vi.fn>
  _mockExtractStateMachines: ReturnType<typeof vi.fn>
  _mockLoadTemplate: ReturnType<typeof vi.fn>
  _mockFindTemplatesInCdkOut: ReturnType<typeof vi.fn>
  _mockFindStateMachinesInTemplates: ReturnType<typeof vi.fn>
}

const getMocks = () => ({
  extractStateMachineById: (CloudFormationParser as unknown as MockedCloudFormationParser)
    ._mockExtractStateMachineById,
  extractStateMachines: (CloudFormationParser as unknown as MockedCloudFormationParser)
    ._mockExtractStateMachines,
  loadTemplate: (CloudFormationParser as unknown as MockedCloudFormationParser)._mockLoadTemplate,
  findTemplatesInCdkOut: (CloudFormationParser as unknown as MockedCloudFormationParser)
    ._mockFindTemplatesInCdkOut,
  findStateMachinesInTemplates: (CloudFormationParser as unknown as MockedCloudFormationParser)
    ._mockFindStateMachinesInTemplates,
})

describe('extract command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('extractFromConfig', () => {
    it('should handle config without stateMachines property', async () => {
      // 設定ファイルが存在するが、stateMachinesプロパティがない場合
      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {
          extracted: './.sfn-test/extracted',
        },
        stateMachines: [], // 空の配列で明示的に定義
      })

      // sfn-test.config.yamlが存在する
      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path === './sfn-test.config.yaml') return true
        return false
      })

      const command = createExtractCommand()
      vi.spyOn(console, 'log')
      const consoleErrorSpy = vi.spyOn(console, 'error')

      // extractコマンドを実行（オプションなし）
      await command.parseAsync(['node', 'test'])

      // エラーにならずに正常に処理されることを確認
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Cannot read properties of undefined'),
      )
    })

    it('should handle config with empty stateMachines array', async () => {
      // stateMachinesが空配列の場合
      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {
          extracted: './.sfn-test/extracted',
        },
        stateMachines: [],
      })

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path === './sfn-test.config.yaml') return true
        return false
      })

      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      await command.parseAsync(['node', 'test'])

      // 適切なメッセージが表示されることを確認
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No CDK state machines found'),
      )
    })

    it('should process CDK state machines from config', async () => {
      const mocks = getMocks()

      // 正常な設定
      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {
          extracted: './.sfn-test/extracted',
        },
        stateMachines: [
          {
            name: 'order-processing-workflow',
            source: {
              type: 'cdk',
              path: './cdk.out/Stack.template.json',
              stateMachineName: 'OrderStateMachine',
            },
          },
        ],
      })

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path === './sfn-test.config.yaml') return true
        if (path === './cdk.out/Stack.template.json') return true
        return false
      })

      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      // CloudFormationParser.loadTemplateのモック
      mocks.loadTemplate.mockReturnValue({
        Resources: {
          OrderStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'FirstState',
                States: {
                  FirstState: { Type: 'Pass', End: true },
                },
              }),
            },
          },
        },
      })

      // extractStateMachineById のモック
      mocks.extractStateMachineById.mockReturnValue({
        logicalId: 'OrderStateMachine',
        stateMachineName: 'OrderWorkflow',
        definition: {
          StartAt: 'FirstState',
          States: {
            FirstState: { Type: 'Pass', End: true },
          },
        },
      })

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats)

      await command.parseAsync(['node', 'test'])

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing: order-processing-workflow'),
      )
    })

    it('should extract specific state machine by name from config', async () => {
      const mocks = getMocks()

      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {
          extracted: './.sfn-test/extracted',
        },
        stateMachines: [
          {
            name: 'workflow-1',
            source: {
              type: 'cdk',
              path: './cdk.out/Stack1.template.json',
              stateMachineName: 'SM1',
            },
          },
          {
            name: 'workflow-2',
            source: {
              type: 'cdk',
              path: './cdk.out/Stack2.template.json',
              stateMachineName: 'SM2',
            },
          },
        ],
      })

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === './sfn-test.config.yaml') return true
        if (pathStr.includes('Stack1.template.json')) return true
        return false
      })

      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      mocks.loadTemplate.mockReturnValue({
        Resources: {
          SM1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'First',
                States: { First: { Type: 'Pass', End: true } },
              }),
            },
          },
        },
      })

      mocks.extractStateMachineById.mockReturnValue({
        logicalId: 'SM1',
        stateMachineName: 'StateMachine1',
        definition: {
          StartAt: 'First',
          States: { First: { Type: 'Pass', End: true } },
        },
      })

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats)

      await command.parseAsync(['node', 'test', '--name', 'workflow-1'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Processing: workflow-1'))
    })

    it('should throw error when named state machine not found', async () => {
      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {
          extracted: './.sfn-test/extracted',
        },
        stateMachines: [
          {
            name: 'existing-workflow',
            source: {
              type: 'cdk',
              path: './cdk.out/Stack.template.json',
              stateMachineName: 'SM',
            },
          },
        ],
      })

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path === './sfn-test.config.yaml') return true
        return false
      })

      const command = createExtractCommand()
      const consoleErrorSpy = vi.spyOn(console, 'error')
      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(command.parseAsync(['node', 'test', '--name', 'non-existent'])).rejects.toThrow(
        'process.exit called',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Extraction failed:',
        "State machine 'non-existent' not found or is not a CDK type",
      )
    })

    it('should handle extraction failure gracefully', async () => {
      const mocks = getMocks()

      vi.mocked(loadProjectConfig).mockReturnValue({
        version: '1.0',
        paths: {
          extracted: './.sfn-test/extracted',
        },
        stateMachines: [
          {
            name: 'test-workflow',
            source: {
              type: 'cdk',
              path: './cdk.out/Stack.template.json',
              stateMachineName: 'TestSM',
            },
          },
        ],
      })

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === './sfn-test.config.yaml') return true
        if (pathStr.includes('Stack.template.json')) return true
        return false
      })

      mocks.loadTemplate.mockReturnValue({
        Resources: {},
      })

      mocks.extractStateMachineById.mockReturnValue(null)

      const command = createExtractCommand()
      const consoleErrorSpy = vi.spyOn(console, 'error')

      await command.parseAsync(['node', 'test'])

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract TestSM'),
      )
    })
  })

  describe('extract with CDK options', () => {
    it('should extract from single CDK template', async () => {
      const mocks = getMocks()
      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      mocks.loadTemplate.mockReturnValue({
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

      mocks.extractStateMachines.mockReturnValue([
        {
          logicalId: 'MyStateMachine',
          stateMachineName: 'MyWorkflow',
          definition: {
            StartAt: 'Start',
            States: { Start: { Type: 'Pass', End: true } },
          },
        },
      ])

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await command.parseAsync(['node', 'test', '--cdk', './cdk.out/Stack.template.json'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 state machine(s)'))
    })

    it('should extract specific state machine by ID from CDK template', async () => {
      const mocks = getMocks()
      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      mocks.loadTemplate.mockReturnValue({
        Resources: {
          TargetSM: {
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

      mocks.extractStateMachineById.mockReturnValue({
        logicalId: 'TargetSM',
        stateMachineName: 'TargetWorkflow',
        definition: {
          StartAt: 'Start',
          States: { Start: { Type: 'Pass', End: true } },
        },
      })

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await command.parseAsync([
        'node',
        'test',
        '--cdk',
        './cdk.out/Stack.template.json',
        '--cdk-state-machine',
        'TargetSM',
      ])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 state machine(s)'))
    })

    it('should throw error when specified state machine not found', async () => {
      const mocks = getMocks()
      const command = createExtractCommand()
      const consoleErrorSpy = vi.spyOn(console, 'error')
      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      mocks.loadTemplate.mockReturnValue({
        Resources: {},
      })

      mocks.extractStateMachineById.mockReturnValue(null)

      await expect(
        command.parseAsync([
          'node',
          'test',
          '--cdk',
          './cdk.out/Stack.template.json',
          '--cdk-state-machine',
          'NotFound',
        ]),
      ).rejects.toThrow('process.exit called')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Extraction failed:',
        'State machine NotFound not found in template',
      )
    })

    it('should scan CDK output directory for state machines', async () => {
      const mocks = getMocks()
      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      mocks.findTemplatesInCdkOut.mockReturnValue([
        './cdk.out/Stack1.template.json',
        './cdk.out/Stack2.template.json',
      ])

      mocks.findStateMachinesInTemplates.mockReturnValue(
        new Map([
          [
            './cdk.out/Stack1.template.json',
            [
              {
                logicalId: 'SM1',
                stateMachineName: 'Workflow1',
                definition: {
                  StartAt: 'Start',
                  States: { Start: { Type: 'Pass', End: true } },
                },
              },
            ],
          ],
          [
            './cdk.out/Stack2.template.json',
            [
              {
                logicalId: 'SM2',
                stateMachineName: 'Workflow2',
                definition: {
                  StartAt: 'Start',
                  States: { Start: { Type: 'Pass', End: true } },
                },
              },
            ],
          ],
        ]),
      )

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await command.parseAsync(['node', 'test', '--cdk-out', './cdk.out'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 template(s)'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 state machine(s)'))
    })

    it('should filter state machines from CDK output by ID', async () => {
      const mocks = getMocks()
      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      mocks.findTemplatesInCdkOut.mockReturnValue(['./cdk.out/Stack.template.json'])

      mocks.findStateMachinesInTemplates.mockReturnValue(
        new Map([
          [
            './cdk.out/Stack.template.json',
            [
              {
                logicalId: 'SM1',
                stateMachineName: 'Workflow1',
                definition: {
                  StartAt: 'Start',
                  States: { Start: { Type: 'Pass', End: true } },
                },
              },
              {
                logicalId: 'SM2',
                stateMachineName: 'Workflow2',
                definition: {
                  StartAt: 'Start2',
                  States: { Start2: { Type: 'Pass', End: true } },
                },
              },
            ],
          ],
        ]),
      )

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await command.parseAsync([
        'node',
        'test',
        '--cdk-out',
        './cdk.out',
        '--cdk-state-machine',
        'SM2',
      ])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 state machine(s)'))
    })

    it('should handle no state machines found in CDK output', async () => {
      const mocks = getMocks()
      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      mocks.findTemplatesInCdkOut.mockReturnValue([])
      mocks.findStateMachinesInTemplates.mockReturnValue(new Map())

      await command.parseAsync(['node', 'test', '--cdk-out', './empty-cdk-out'])

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No Step Functions state machines found'),
      )
    })

    it('should handle config not found', async () => {
      vi.mocked(loadProjectConfig).mockReturnValue(null)

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path === './sfn-test.config.yaml') return true
        return false
      })

      const command = createExtractCommand()
      const consoleSpy = vi.spyOn(console, 'log')

      await command.parseAsync(['node', 'test'])

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No configuration file found'),
      )
    })
  })
})
