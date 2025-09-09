import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import chalk from 'chalk'
import * as yaml from 'js-yaml'
import ora from 'ora'
import { generateMockWithAI, generateTestWithAI } from '../../ai/agents/index'
import { TestGenerationPipeline } from '../../ai/generation/test-generation-pipeline'
import { generateTestDataFiles } from '../../ai/utils/test-data-generator'
import type { StateMachineConfig } from '../../config/loader'
import {
  findStateMachine,
  loadProjectConfig,
  loadStateMachineDefinition,
  resolveMockPath,
  resolveTestSuitePath,
} from '../../config/loader'
import {
  DEFAULT_ASL_FILENAME,
  DEFAULT_CONFIG_FILE,
  DEFAULT_MOCK_FILENAME,
  DEFAULT_TEST_DATA_DIR,
  DEFAULT_TEST_FILENAME,
} from '../../constants/defaults'
import { type JsonObject, type JsonValue, StateFactory, type StateMachine } from '../../types/asl'
import type { MockConfig } from '../../types/mock'
import { isError, processInParallel } from '../../utils/parallel'

/**
 * Safe file write with automatic directory creation
 */
function safeWriteFileSync(filePath: string, content: string): void {
  const dir = dirname(filePath)

  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(filePath, content)
}

// Adapter function to bridge generateTestWithAI to TestGenerationPipeline
function createTestGeneratorAdapter(
  aiModel: string,
  timeoutMs: number,
): (prompt: string, stateMachine: StateMachine, options?: JsonObject) => Promise<string> {
  return async (
    _prompt: string,
    stateMachine: StateMachine,
    options?: JsonObject,
  ): Promise<string> => {
    return await generateTestWithAI(
      stateMachine,
      aiModel,
      timeoutMs,
      options?.mockContent as string | undefined,
      options?.mockFile as string | undefined,
      options?.aslFile as string | undefined,
      options?.outputPath as string | undefined,
      options?.verbose as boolean | undefined,
    )
  }
}

interface GenerateOptions {
  name?: string
  asl?: string
  cdk?: string
  cdkStateMachine?: string // CDKテンプレート内の特定のステートマシンを指定
  output?: string
  aiModel: string
  timeout?: string
  mock?: string // For test generation, use existing mock file
  maxAttempts?: string // Maximum attempts for generation cycle
  concurrency?: string // Maximum concurrent AI generation operations
  verbose?: boolean // Enable verbose output
}

// Helper function to ensure data is not undefined
function ensureStateMachineData(data: JsonObject | undefined): JsonObject {
  if (!data) {
    throw new Error('State machine data is required')
  }
  return data as JsonObject
}

export async function generateCommand(
  type: string,
  options: GenerateOptions,
  cmd?: { parent?: () => { opts?: () => { config?: string } } },
): Promise<void> {
  const spinner = ora(`Generating ${type}...`).start()

  try {
    let stateMachine: JsonObject | undefined
    let stateMachineInstance: StateMachine | undefined
    let defaultOutputPath: string | undefined
    let configAslFileName: string | undefined
    let configMockFileName: string | undefined
    let outputPath: string = ''
    let testDataPath: string = DEFAULT_TEST_DATA_DIR

    // --name オプションが指定された場合、設定ファイルから読み込みを試みる
    if (options.name) {
      const parentOpts = cmd?.parent as { opts(): { config?: string } } | undefined
      const configPath = parentOpts?.opts()?.config || DEFAULT_CONFIG_FILE
      const config = loadProjectConfig(configPath, false)

      // 設定ファイルが存在し、かつ--nameがステートマシン名として見つかる場合
      if (config) {
        testDataPath = config?.paths?.testData || DEFAULT_TEST_DATA_DIR
        const stateMachineConfig = findStateMachine(config, options.name)

        if (stateMachineConfig) {
          spinner.text = `Loading state machine '${options.name}' from configuration...`
          stateMachine = loadStateMachineDefinition(stateMachineConfig)

          // ファイル名を設定から取得
          configAslFileName = stateMachineConfig.source.path.split('/').pop() || 'workflow.asl.json'
          configMockFileName = `${options.name}.mock.yaml`

          // デフォルトの出力パスを設定
          if (!options.output) {
            defaultOutputPath =
              type === 'mock'
                ? resolveMockPath(config, options.name)
                : resolveTestSuitePath(config, options.name)
          }
        }
      }

      // 設定ファイルが存在しない、または設定内にステートマシンが見つからない場合は
      // --nameをファイル名のプレフィックスとして使用する（後続の処理に任せる）
    }
    // 引数なしの場合のデフォルト動作（runコマンドと同様の自動選択機能）
    else if (!(options.asl || options.cdk)) {
      const parentOpts = cmd?.parent as { opts(): { config?: string } } | undefined
      const configPath = parentOpts?.opts()?.config || DEFAULT_CONFIG_FILE
      const config = loadProjectConfig(configPath, false)

      if (config?.stateMachines && config.stateMachines.length === 1) {
        // ステートマシンが1つだけ定義されている場合は自動選択
        const sm = config.stateMachines[0]
        if (!sm) {
          throw new Error('No state machine configuration found')
        }
        spinner.text = `Auto-selected state machine: ${sm.name}`
        stateMachine = loadStateMachineDefinition(sm)

        // ファイル名を設定から取得
        configAslFileName = sm.source.path.split('/').pop() || 'workflow.asl.json'
        configMockFileName = `${sm.name}.mock.yaml`

        // デフォルトの出力パスを設定
        if (!options.output) {
          defaultOutputPath =
            type === 'mock'
              ? resolveMockPath(config, sm.name)
              : resolveTestSuitePath(config, sm.name)
        }
      } else if (config?.stateMachines && config.stateMachines.length > 1) {
        // 複数ある場合は並列実行または順次実行
        const parsedConcurrency = options.concurrency ? Number.parseInt(options.concurrency, 10) : 1
        const concurrency =
          Number.isNaN(parsedConcurrency) || parsedConcurrency < 1 ? 1 : parsedConcurrency // 無効な値の場合は1にフォールバック
        const mode = concurrency > 1 ? 'parallel' : 'sequential'

        spinner.text = `Processing ${config.stateMachines.length} state machines ${mode === 'parallel' ? `(concurrency: ${concurrency})` : '(sequential)'}...`

        const results = await processInParallel(
          config.stateMachines,
          async (sm: StateMachineConfig, index: number) => {
            const progressText = `${sm.name} (${index + 1}/${config.stateMachines.length})`
            if (mode === 'sequential') {
              spinner.text = `Processing state machine: ${progressText}`
            }

            const currentStateMachineObj = loadStateMachineDefinition(sm)
            // Use StateFactory to properly create a StateMachine with all nested states
            const currentStateMachine = StateFactory.createStateMachine(
              currentStateMachineObj as JsonObject,
            )
            const currentConfigMockFileName = `${sm.name}.mock.yaml`

            const currentDefaultOutputPath =
              type === 'mock'
                ? resolveMockPath(config, sm.name)
                : resolveTestSuitePath(config, sm.name)

            let result: string
            switch (type) {
              case 'mock': {
                const maxAttempts = options.maxAttempts
                  ? Number.parseInt(options.maxAttempts, 10)
                  : 2
                result = await generateMockWithAI(
                  currentStateMachine, // Pass StateMachine directly (already has State instances)
                  options.aiModel,
                  options.timeout ? Number.parseInt(options.timeout, 10) : 300000,
                  maxAttempts,
                )
                break
              }
              case 'test': {
                // Load mock file and parse mock config if available
                let mockContent: string | undefined
                let mockConfig: MockConfig | undefined
                let mockFileName: string | undefined

                const autoMockPath = resolveMockPath(config, sm.name)
                if (existsSync(autoMockPath)) {
                  try {
                    mockContent = readFileSync(autoMockPath, 'utf-8')
                    mockConfig = yaml.load(mockContent) as MockConfig
                    mockFileName = autoMockPath
                  } catch (_err) {
                    // エラーの場合は静かに無視（モックなしで続行）
                  }
                }

                if (mockConfig) {
                  // Use TestGenerationPipeline for execution-based validation and correction
                  const generator = createTestGeneratorAdapter(
                    options.aiModel,
                    options.timeout ? Number.parseInt(options.timeout, 10) : 300000,
                  )
                  const pipeline = new TestGenerationPipeline(generator)
                  const pipelineResult = await pipeline.generateTest({
                    stateMachine: currentStateMachine,
                    maxAttempts: options.maxAttempts ? Number.parseInt(options.maxAttempts, 10) : 2,
                    mockFile: mockFileName ? `${sm.name}.mock.yaml` : currentConfigMockFileName,
                    aslFile: sm.name,
                    timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
                    enableExecutionValidation: true,
                    mockConfig,
                    basePath: testDataPath,
                    verbose: options.verbose,
                  })

                  result = pipelineResult.content

                  // Log corrections if any were made
                  if (
                    pipelineResult.executionCorrections &&
                    pipelineResult.executionCorrections.length > 0
                  ) {
                    console.log(
                      chalk.cyan(
                        `\n✨ Improved ${pipelineResult.executionCorrections.length} test expectation(s) through execution validation`,
                      ),
                    )
                    if (options.verbose) {
                      pipelineResult.executionCorrections.forEach((correction) => {
                        console.log(
                          chalk.gray(
                            `  • ${correction.testCase} - ${correction.state}: ${correction.reason}`,
                          ),
                        )
                      })
                    }
                  }
                } else {
                  // Fallback to static generation without execution validation
                  const aslPath = sm.name
                  const mockPath = mockFileName ? `${sm.name}.mock.yaml` : currentConfigMockFileName

                  result = await generateTestWithAI(
                    currentStateMachine, // Pass StateMachine directly (already has State instances)
                    options.aiModel,
                    options.timeout ? Number.parseInt(options.timeout, 10) : 300000,
                    mockContent,
                    mockPath,
                    aslPath,
                    currentDefaultOutputPath,
                    options.verbose,
                  )
                }
                break
              }
              default:
                throw new Error(`Unknown generation type: ${type}`)
            }

            safeWriteFileSync(currentDefaultOutputPath, result)

            // Generate test data files for ItemReader if mock type
            if (type === 'mock' && currentStateMachine) {
              try {
                const dataFiles = generateTestDataFiles(currentStateMachine, result)
                if (dataFiles.length > 0 && options.verbose) {
                  console.log(
                    chalk.cyan(
                      `\n📦 Generated ${dataFiles.length} test data file(s) for ItemReader:`,
                    ),
                  )
                  dataFiles.forEach((file) => {
                    console.log(chalk.green(`  ✓ ${file.path} (${file.format})`))
                  })
                }
              } catch (error) {
                if (mode === 'sequential') {
                  console.warn(chalk.yellow('⚠️ Could not generate test data files:', error))
                }
              }
            }

            return {
              stateMachine: sm,
              outputPath: currentDefaultOutputPath,
              result,
            }
          },
          concurrency,
        )

        // Process results
        let successCount = 0
        let failureCount = 0

        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          const sm = config.stateMachines[i]

          if (!sm) {
            console.error(chalk.red(`✗ State machine at index ${i} is undefined`))
            failureCount++
            continue
          }

          if (isError(result)) {
            console.error(
              chalk.red(`✗ Failed to generate ${type} for ${sm.name}: ${result.message}`),
            )
            failureCount++
          } else if (result) {
            console.log(chalk.green(`✓ Generated ${type} for ${sm.name}: ${result.outputPath}`))
            successCount++
          } else {
            console.error(chalk.red(`✗ No result returned for ${sm.name}`))
            failureCount++
          }
        }

        const totalSummary = `Completed ${successCount + failureCount}/${config.stateMachines.length} state machines`
        const resultSummary =
          successCount > 0 && failureCount === 0
            ? chalk.green(`${totalSummary} (all succeeded)`)
            : successCount > 0 && failureCount > 0
              ? chalk.yellow(`${totalSummary} (${successCount} succeeded, ${failureCount} failed)`)
              : chalk.red(`${totalSummary} (all failed)`)

        spinner.succeed(resultSummary)
        return
      }
    }

    if (!stateMachine) {
      if (options.asl) {
        const content = readFileSync(options.asl, 'utf-8')
        stateMachine = JSON.parse(content)
      } else if (options.cdk) {
        spinner.text = 'Extracting state machine from CDK output...'
        const cdkContent = readFileSync(options.cdk, 'utf-8')
        const cdkTemplate = JSON.parse(cdkContent)
        stateMachine = extractStateMachineFromCDK(
          cdkTemplate,
          options.cdkStateMachine,
          options.verbose,
        )
      } else if (options.name) {
        // エラーをcatchブロックで処理するため、ここでthrow
        throw new Error(`State machine "${options.name}" not found in configuration`)
      } else {
        // エラーをcatchブロックで処理するため、ここでthrow
        throw new Error('Either --name, --asl, or --cdk option is required')
      }
    }

    let result: string
    switch (type) {
      case 'mock': {
        spinner.text = 'Generating mock configuration with AI...'
        const maxAttempts = options.maxAttempts ? Number.parseInt(options.maxAttempts, 10) : 2
        if (maxAttempts > 1) {
          spinner.text = `Generating mock with up to ${maxAttempts} attempts...`
        }
        stateMachineInstance = StateFactory.createStateMachine(ensureStateMachineData(stateMachine))
        result = await generateMockWithAI(
          stateMachineInstance, // Pass StateMachine directly
          options.aiModel,
          options.timeout ? Number.parseInt(options.timeout, 10) : 300000,
          maxAttempts,
        )
        break
      }
      case 'test': {
        spinner.text = 'Generating test cases with AI...'
        // Load mock file if provided
        let mockContent: string | undefined
        let mockConfig: MockConfig | undefined
        let mockFileName: string | undefined

        // --mockオプションが明示的に指定された場合
        if (options.mock) {
          try {
            mockContent = readFileSync(options.mock, 'utf-8')
            mockConfig = yaml.load(mockContent) as MockConfig
            // Keep the full path for correct relative path calculation
            mockFileName = options.mock
            spinner.text = 'Generating test cases with AI using provided mock...'
          } catch (_err) {
            console.warn(
              chalk.yellow(
                `Warning: Could not read mock file ${options.mock}, generating without it`,
              ),
            )
          }
        }
        // --nameオプションが指定され、--mockが指定されていない場合は自動検索
        else if (options.name && !options.mock) {
          const parentOpts2 = cmd?.parent as { opts(): { config?: string } } | undefined
          const configPath2 = parentOpts2?.opts()?.config || DEFAULT_CONFIG_FILE
          const config = loadProjectConfig(configPath2, false)
          if (config) {
            const autoMockPath = resolveMockPath(config, options.name)
            if (existsSync(autoMockPath)) {
              try {
                mockContent = readFileSync(autoMockPath, 'utf-8')
                mockConfig = yaml.load(mockContent) as MockConfig
                mockFileName = autoMockPath
                spinner.text = `Generating test cases with AI using auto-detected mock: ${autoMockPath}...`
                if (options.verbose) {
                  console.log(chalk.gray(`  Auto-detected mock file: ${autoMockPath}`))
                }
              } catch (_err) {
                // エラーの場合は静かに無視（モックなしで続行）
              }
            }
          }
        }

        // パス情報の決定：name指定の場合は名前を使用、それ以外はパスを使用
        // optionsから渡されたパスはそのまま使用（相対パスまたは絶対パス）
        const aslPath =
          options.asl || (options.name ? options.name : configAslFileName) || DEFAULT_ASL_FILENAME
        const mockPath =
          options.mock ||
          (options.name && mockFileName ? `${options.name}.mock.yaml` : mockFileName) ||
          (options.name ? `${options.name}.mock.yaml` : configMockFileName)

        // 出力パスを先に決定（generateTestWithAIに渡すため）
        outputPath =
          options.output ||
          defaultOutputPath ||
          (type === 'test' ? DEFAULT_TEST_FILENAME : DEFAULT_MOCK_FILENAME)

        stateMachineInstance = StateFactory.createStateMachine(ensureStateMachineData(stateMachine))

        if (mockConfig) {
          // Use TestGenerationPipeline for execution-based validation and correction
          spinner.text = 'Generating and validating test cases with execution-based correction...'
          const generator = createTestGeneratorAdapter(
            options.aiModel,
            options.timeout ? Number.parseInt(options.timeout, 10) : 300000,
          )
          const pipeline = new TestGenerationPipeline(generator)
          const pipelineResult = await pipeline.generateTest({
            stateMachine: stateMachineInstance,
            maxAttempts: options.maxAttempts ? Number.parseInt(options.maxAttempts, 10) : 2,
            mockFile: mockPath,
            aslFile: aslPath,
            timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
            enableExecutionValidation: true,
            mockConfig,
            verbose: options.verbose,
          })

          result = pipelineResult.content

          // Log corrections if any were made
          if (
            pipelineResult.executionCorrections &&
            pipelineResult.executionCorrections.length > 0
          ) {
            console.log(
              chalk.cyan(
                `\n🔧 Auto-corrected ${pipelineResult.executionCorrections.length} expectation(s) based on actual execution:`,
              ),
            )
            pipelineResult.executionCorrections.forEach((correction) => {
              console.log(
                chalk.gray(
                  `  • ${correction.testCase} - ${correction.state}: ${correction.reason}`,
                ),
              )
            })
          }

          if (pipelineResult.staticIssues.length > 0) {
            console.log(
              chalk.yellow(
                `\n⚠️ Note: Some static validation warnings remain (auto-correction applied where possible)`,
              ),
            )
          }
        } else {
          // Fallback to static generation without execution validation
          result = await generateTestWithAI(
            stateMachineInstance, // Pass StateMachine directly
            options.aiModel,
            options.timeout ? Number.parseInt(options.timeout, 10) : 300000,
            mockContent,
            mockPath,
            aslPath,
            outputPath,
            options.verbose,
          )
        }
        break
      }
      default:
        throw new Error(`Unknown generation type: ${type}`)
    }

    // mockタイプの場合はoutputPathを設定
    if (type === 'mock') {
      outputPath =
        options.output ||
        defaultOutputPath ||
        (type === 'mock' ? DEFAULT_MOCK_FILENAME : DEFAULT_TEST_FILENAME)
    }

    safeWriteFileSync(outputPath, result)

    // Generate test data files for ItemReader if mock type
    if (type === 'mock' && stateMachineInstance) {
      try {
        // stateMachineInstance is a StateMachine with State instances
        const dataFiles = generateTestDataFiles(stateMachineInstance, result)
        if (dataFiles.length > 0 && options.verbose) {
          console.log(
            chalk.cyan(`\n📦 Generated ${dataFiles.length} test data file(s) for ItemReader:`),
          )
          dataFiles.forEach((file) => {
            console.log(chalk.green(`  ✓ ${file.path} (${file.format})`))
          })
        }
      } catch (error) {
        console.warn(chalk.yellow('⚠️ Could not generate test data files:', error))
      }
    }

    spinner.succeed(chalk.green(`Generated ${type} file: ${outputPath}`))
  } catch (error: unknown) {
    const errorObj = error as { message?: string }
    spinner.fail(chalk.red(`Failed to generate ${type}`))

    // 特定のエラーメッセージをチェック
    if (
      errorObj.message?.includes('State machine') &&
      errorObj.message?.includes('not found in configuration')
    ) {
      console.error(chalk.red(errorObj.message))
      process.exit(1)
    }

    if (errorObj.message === 'Either --name, --asl, or --cdk option is required') {
      console.error(chalk.red(errorObj.message))
      process.exit(1)
    }

    // Claude CLIもAPIキーも利用できない場合、テンプレートを提供
    if (errorObj.message?.includes('Neither Claude CLI nor ANTHROPIC_API_KEY')) {
      console.log(`\n${chalk.yellow('💡 Tip: You can use one of the following:')}`)
      console.log('1. Install Claude Code and login: https://claude.ai/code')
      console.log('2. Get an API key at: https://console.anthropic.com')
      console.log('3. Create files manually using examples in ./examples/')
      console.log('')

      // サンプルファイルを生成
      const outputPath =
        options.output || (type === 'mock' ? DEFAULT_MOCK_FILENAME : DEFAULT_TEST_FILENAME)
      let sampleContent: string

      if (type === 'mock') {
        sampleContent = `version: "1.0"
description: "Manual mock configuration template"
mocks:
  # Lambda task mock (with Payload wrapping)
  - state: "YourTaskStateName"
    type: "fixed"
    response:
      ExecutedVersion: "$LATEST"
      Payload:
        # Your Lambda function response here
        result: "success"
        data: "example"
      StatusCode: 200
  
  # Simple task mock (without Lambda)
  - state: "SimpleTask"
    type: "fixed"
    response:
      result: "processed"
  
  # Conditional mock
  - state: "ConditionalTask"
    type: "conditional"
    conditions:
      - when:
          input:
            amount: { "$gt": 100 }
        response:
          approved: true
      - default:
          approved: false
  
  # Error simulation
  - state: "ErrorTask"
    type: "error"
    error:
      type: "States.TaskFailed"
      cause: "Simulated error"`
      } else {
        sampleContent = `version: "1.0"
name: "Manual test suite template"
stateMachine: "./your-state-machine.asl.json"
baseMock: "./sfn-test.mock.yaml"

testCases:
  - name: "Success case"
    input:
      # Your test input
      userId: "test-user"
      amount: 100
    expectedOutput:
      # Expected final output
      status: "success"
    expectedPath:
      # Expected execution path
      - "FirstState"
      - "SecondState"
      - "FinalState"
  
  - name: "Error case"
    input:
      userId: "test-user"
      amount: -1
    mockOverrides:
      - state: "ValidationState"
        type: "error"
        error:
          type: "ValidationError"
          cause: "Invalid amount"
    expectedPath:
      - "FirstState"
      - "ValidationState"
      - "ErrorHandler"

settings:
  timeout: 10000
  verbose: false

assertions:
  outputMatching: "partial"
  pathMatching: "exact"`
      }

      safeWriteFileSync(outputPath, sampleContent)
      console.log(chalk.green(`\n✅ Template file created: ${outputPath}`))
      console.log('Edit this file to match your state machine requirements.')
    } else {
      console.error(error)
    }
    process.exit(1)
  }
}

function extractStateMachineFromCDK(
  cdkTemplate: JsonObject,
  stateMachineName?: string,
  verbose = false,
): JsonObject {
  const resources = cdkTemplate.Resources || {}
  const stateMachines: { [key: string]: JsonObject } = {}

  // すべてのステートマシンを収集
  for (const [logicalId, resource] of Object.entries(resources)) {
    const res = resource as JsonObject
    if (res.Type === 'AWS::StepFunctions::StateMachine') {
      stateMachines[logicalId] = res
    }
  }

  const stateMachineCount = Object.keys(stateMachines).length

  if (stateMachineCount === 0) {
    throw new Error('No Step Functions state machine found in CDK template')
  }

  // 特定のステートマシンが指定されている場合
  if (stateMachineName) {
    const resource = stateMachines[stateMachineName]
    if (!resource) {
      const availableNames = Object.keys(stateMachines).join(', ')
      throw new Error(`State machine '${stateMachineName}' not found. Available: ${availableNames}`)
    }
    const resourceObj = resource as {
      Properties?: { Definition?: JsonValue; DefinitionString?: JsonValue }
    }
    const definition =
      resourceObj.Properties?.Definition || resourceObj.Properties?.DefinitionString
    if (typeof definition === 'string') {
      return JSON.parse(definition)
    }
    return definition as JsonObject
  }

  // ステートマシンが1つだけの場合は自動的に選択
  if (stateMachineCount === 1) {
    const entry = Object.entries(stateMachines)[0]
    if (!entry) {
      throw new Error('No state machine found')
    }
    const [logicalId, resource] = entry
    if (verbose) {
      console.log(chalk.gray(`  Auto-selected state machine: ${logicalId}`))
    }
    const resourceObj2 = resource as {
      Properties?: { Definition?: JsonValue; DefinitionString?: JsonValue }
    }
    const definition2 =
      resourceObj2.Properties?.Definition || resourceObj2.Properties?.DefinitionString
    if (typeof definition2 === 'string') {
      return JSON.parse(definition2)
    }
    return definition2 as JsonObject
  }

  // 複数のステートマシンがある場合はエラー
  const availableNames = Object.keys(stateMachines).join(', ')
  throw new Error(
    `Multiple state machines found in CDK template. Please specify one with --cdk-state-machine option.\n` +
      `Available: ${availableNames}`,
  )
}
