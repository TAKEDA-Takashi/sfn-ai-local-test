import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { load } from 'js-yaml'
import ora from 'ora'
import {
  findStateMachine,
  loadProjectConfig,
  loadStateMachineDefinition,
  resolveMockPath,
} from '../../config/loader'
import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_TEST_DATA_DIR,
  DEFAULT_TEST_SUITES_DIR,
} from '../../constants/defaults'
import {
  transformMapExecutions,
  transformParallelExecutions,
} from '../../core/coverage/execution-transformer'
import { mergeCoverageReports } from '../../core/coverage/merge-reports'
import type { CoverageReport } from '../../core/coverage/nested-coverage-tracker'
import { NestedCoverageTracker } from '../../core/coverage/nested-coverage-tracker'
import { CoverageReporter } from '../../core/coverage/reporter'
import { CoverageStorageManager } from '../../core/coverage/storage'
import { type ExecutionResult, StateMachineExecutor } from '../../core/interpreter/executor'
import { MockEngine } from '../../core/mock/engine'
import { TestSuiteRunner } from '../../core/test/suite-runner'
import type { ProjectConfig } from '../../schemas/config-schema'
import { mockConfigSchema } from '../../schemas/mock-schema'
import type { JsonObject, StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { extractStateMachineFromCDK } from '../../utils/cdk-extractor'
import {
  displayCoverageReport,
  outputDefaultReport,
  outputJsonReport,
  outputJunitReport,
} from '../reporters/test-reporter'

interface RunOptions {
  // テストスイート実行用
  suite?: string
  reporter?: 'default' | 'json' | 'junit'
  output?: string
  bail?: boolean

  // 単一実行用
  name?: string
  asl?: string
  cdk?: string
  /** CDKテンプレート内の特定のステートマシンを指定 */
  cdkStateMachine?: string
  mock?: string
  input?: string

  // 共通オプション
  verbose?: boolean
  quiet?: boolean
  cov?: string | boolean
}

/**
 * runコマンドのメインエントリポイント
 */
export async function runCommand(options: RunOptions): Promise<void> {
  if (options.suite) {
    let suitePath = options.suite

    if (
      !(
        suitePath.includes('/') ||
        suitePath.includes('\\') ||
        suitePath.endsWith('.yaml') ||
        suitePath.endsWith('.yml')
      )
    ) {
      const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null
      const testSuitesDir = config?.paths?.testSuites || DEFAULT_TEST_SUITES_DIR

      const yamlPath = join(testSuitesDir, `${suitePath}.test.yaml`)
      const ymlPath = join(testSuitesDir, `${suitePath}.test.yml`)

      if (existsSync(yamlPath)) {
        suitePath = yamlPath
      } else if (existsSync(ymlPath)) {
        suitePath = ymlPath
      } else {
        throw new Error(`Test suite '${suitePath}' not found in ${testSuitesDir}`)
      }
    }

    options.suite = suitePath
    return await runTestSuite(options)
  }

  if (options.name && !options.suite) {
    const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null

    if (!config) {
      throw new Error(`Configuration file not found: ${DEFAULT_CONFIG_FILE}`)
    }

    const stateMachineConfig = findStateMachine(config, options.name)
    if (!stateMachineConfig) {
      throw new Error(`State machine '${options.name}' not found in configuration`)
    }

    const testSuitesDir = config?.paths?.testSuites || DEFAULT_TEST_SUITES_DIR

    const yamlPath = join(testSuitesDir, `${options.name}.test.yaml`)
    const ymlPath = join(testSuitesDir, `${options.name}.test.yml`)

    if (existsSync(yamlPath)) {
      console.log(chalk.gray(`Found test suite: ${yamlPath}`))
      options.suite = yamlPath
      return await runTestSuite(options)
    } else if (existsSync(ymlPath)) {
      console.log(chalk.gray(`Found test suite: ${ymlPath}`))
      options.suite = ymlPath
      return await runTestSuite(options)
    } else {
      throw new Error(
        `Test suite not found for '${options.name}'.\n` +
          `Expected to find one of:\n` +
          `  - ${yamlPath}\n` +
          `  - ${ymlPath}\n` +
          `Please create a test suite file or use --asl/--cdk options for direct execution.`,
      )
    }
  }

  if (!(options.name || options.asl || options.cdk || options.suite)) {
    return await runDefaultMode(options)
  }

  return await runSingleExecution(options)
}

/**
 * デフォルトモードで実行（引数なしの場合）
 */
async function runDefaultMode(options: RunOptions): Promise<void> {
  const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null

  const testSuitesDir = config?.paths?.testSuites || DEFAULT_TEST_SUITES_DIR

  if (existsSync(testSuitesDir)) {
    const testFiles = findTestSuites(testSuitesDir)

    if (testFiles.length > 0) {
      console.log(chalk.blue(`🧪 Running ${testFiles.length} test suite(s)...`))
      console.log(chalk.gray('─'.repeat(50)))

      // 各テストスイートを順次実行
      let totalPassed = 0
      let totalFailed = 0
      let totalSkipped = 0
      const startTime = Date.now()
      let combinedCoverage: CoverageReport | null = null

      for (const testFile of testFiles) {
        console.log(chalk.cyan(`\n📁 ${testFile}`))
        const startTime = Date.now()
        options.suite = testFile

        try {
          const runner = new TestSuiteRunner(testFile)
          const enableCoverage = !!options.cov
          const result = await runner.runSuite(enableCoverage, {
            verbose: options.verbose,
            quiet: options.quiet,
            executionContext: config?.executionContext,
          })
          const elapsed = Date.now() - startTime
          console.log(chalk.gray(`  ⏱  Completed in ${elapsed}ms`))

          totalPassed += result.passedTests
          totalFailed += result.failedTests
          totalSkipped += result.skippedTests

          if (result.coverage?.topLevel) {
            combinedCoverage = combinedCoverage
              ? mergeCoverageReports(combinedCoverage, result.coverage)
              : result.coverage
          }

          // 簡潔な結果表示
          const status =
            result.failedTests === 0
              ? chalk.green(`✅ ${result.passedTests} passed`)
              : chalk.red(`❌ ${result.failedTests} failed`)
          console.log(`   ${status}`)

          // verboseモードまたは失敗時は詳細表示
          if (options.verbose || result.failedTests > 0) {
            outputDefaultReport(result, options.verbose)
          }

          // bailオプションが有効で失敗があれば停止
          if (options.bail && result.failedTests > 0) {
            break
          }
        } catch (error) {
          console.error(chalk.red(`   ❌ Failed to run suite: ${error}`))
          totalFailed++
          if (options.bail) break
        }
      }

      // 全体のサマリー
      const duration = Date.now() - startTime
      console.log(chalk.gray(`\n${'═'.repeat(50)}`))
      console.log(chalk.bold('📊 Overall Results:'))
      console.log(`   ${chalk.green('✅ Passed:')} ${totalPassed}`)
      console.log(`   ${chalk.red('❌ Failed:')} ${totalFailed}`)
      if (totalSkipped > 0) {
        console.log(`   ${chalk.yellow('⏭️  Skipped:')} ${totalSkipped}`)
      }
      console.log(`   ${chalk.blue('⏱️  Duration:')} ${duration}ms`)

      // カバレッジレポートを表示
      if (options.cov && combinedCoverage) {
        // options.covがtrueまたは有効なフォーマット文字列の場合のみ表示
        displayCoverageReport(combinedCoverage, {
          format: options.cov === true ? 'text' : options.cov,
          coverageDir: config?.paths?.coverage,
        })
      }

      // 失敗があれば非ゼロで終了
      if (totalFailed > 0) {
        process.exit(1)
      } else {
        process.exit(0)
      }
      return
    }
  }

  // テストスイートが見つからない場合は、ステートマシンを確認
  if (config) {
    if (config.stateMachines && config.stateMachines.length >= 1) {
      // 1つでも複数でも統一的に処理
      if (config.stateMachines.length === 1) {
        const sm = config.stateMachines[0]
        console.log(chalk.gray(`No test suites found. Auto-selected state machine: ${sm?.name}`))
      }
      return runMultipleStateMachines(config, options)
    } else {
      throw new Error('No test suites found and no state machines defined in sfn-test.config.yaml')
    }
  } else {
    throw new Error(
      'No test suites found and no sfn-test.config.yaml found. Run "sfn-test init" to get started.',
    )
  }
}

/**
 * 共通のステートマシン実行ロジック
 */
async function executeStateMachine(
  stateMachine: StateMachine,
  mockPath: string | undefined,
  input: JsonObject,
  options: Pick<RunOptions, 'verbose' | 'quiet'>,
  config?: ProjectConfig | null,
): Promise<ExecutionResult> {
  // test-dataパスを設定から取得（デフォルト値あり）
  const testDataPath = config?.paths?.testData || DEFAULT_TEST_DATA_DIR

  let mockEngine: MockEngine | undefined
  if (mockPath) {
    const mockContent = readFileSync(mockPath, 'utf-8')
    const rawConfig = load(mockContent)
    const mockConfig = mockConfigSchema.parse(rawConfig)
    mockEngine = new MockEngine(mockConfig, { basePath: testDataPath })
  } else {
    // Create empty mock engine to enable default mocks for AWS service integrations
    mockEngine = new MockEngine({ version: '1.0', mocks: [] }, { basePath: testDataPath })
  }

  const executor = new StateMachineExecutor(stateMachine, mockEngine)
  return await executor.execute(input, {
    verbose: options.verbose,
    quiet: options.quiet,
  })
}

async function runMultipleStateMachines(config: ProjectConfig, options: RunOptions): Promise<void> {
  const stateMachines = config.stateMachines
  // 複数ある場合は全て順次実行
  console.log(chalk.blue(`🧪 Running ${stateMachines.length} state machine(s)...`))
  console.log(chalk.gray('─'.repeat(50)))

  let successCount = 0
  let failureCount = 0

  for (const sm of stateMachines) {
    try {
      console.log(
        chalk.cyan(
          `\n🔄 Running state machine: ${sm.name} (${successCount + failureCount + 1}/${stateMachines.length})`,
        ),
      )

      const stateMachine = StateFactory.createStateMachine(loadStateMachineDefinition(sm))

      // モックファイルパスが指定されていない場合、デフォルトパスを使用
      let mockPath = options.mock
      if (!mockPath) {
        const defaultMockPath = resolveMockPath(config, sm.name)
        if (existsSync(defaultMockPath)) {
          mockPath = defaultMockPath
          console.log(chalk.gray(`  Using mock file: ${defaultMockPath}`))
        }
      }

      // 実行パラメータの準備
      let input: JsonObject = {}
      if (options.input) {
        const inputContent = readFileSync(options.input, 'utf-8')
        input = JSON.parse(inputContent)
      }

      // 共通の実行ロジックを使用
      const result = await executeStateMachine(stateMachine, mockPath, input, options, config)

      console.log(chalk.green(`✓ Successfully executed ${sm.name}`))
      if (!options.quiet) {
        console.log(`  Final output:`, JSON.stringify(result.output, null, 2))
        console.log(`  Execution path:`, result.executionPath?.join(' → ') || 'N/A')
      }
      successCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`✗ Failed to run ${sm.name}: ${message}`))
      failureCount++
    }
  }

  const totalSummary = `Completed ${successCount + failureCount}/${stateMachines.length} state machines`
  const resultSummary =
    successCount > 0 && failureCount === 0
      ? chalk.green(`${totalSummary} (all succeeded)`)
      : successCount > 0 && failureCount > 0
        ? chalk.yellow(`${totalSummary} (${successCount} succeeded, ${failureCount} failed)`)
        : chalk.red(`${totalSummary} (all failed)`)

  console.log(chalk.gray('─'.repeat(50)))
  console.log(resultSummary)
}

// テストスイートファイルを再帰的に検索
function findTestSuites(dir: string): string[] {
  const testFiles: string[] = []

  try {
    const entries = readdirSync(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        // サブディレクトリも検索
        testFiles.push(...findTestSuites(fullPath))
      } else if (entry.endsWith('.test.yaml') || entry.endsWith('.test.yml')) {
        testFiles.push(fullPath)
      }
    }
  } catch (_error) {
    // ディレクトリが読めない場合は無視
  }

  return testFiles.sort() // アルファベット順にソート
}

async function runSingleExecution(options: RunOptions): Promise<void> {
  const spinner = ora('Loading state machine...').start()

  try {
    let stateMachine: StateMachine | undefined
    let mockPath = options.mock

    // --name オプションが指定された場合、設定ファイルから読み込み
    if (options.name) {
      const config = loadProjectConfig()
      if (!config) {
        throw new Error('No configuration file found (sfn-test.config.yaml)')
      }
      const stateMachineConfig = findStateMachine(config, options.name)

      if (!stateMachineConfig) {
        throw new Error(`State machine '${options.name}' not found in configuration`)
      }

      spinner.text = `Loading state machine '${options.name}' from configuration...`
      stateMachine = StateFactory.createStateMachine(loadStateMachineDefinition(stateMachineConfig))

      // モックファイルパスが指定されていない場合、デフォルトパスを使用
      if (!mockPath) {
        const defaultMockPath = resolveMockPath(config, options.name)
        if (existsSync(defaultMockPath)) {
          mockPath = defaultMockPath
          spinner.text = `Using mock file: ${defaultMockPath}`
        }
      }
    } else if (options.asl || options.cdk) {
      // 既存の --asl や --cdk オプションの処理
      if (options.asl) {
        const content = readFileSync(options.asl, 'utf-8')
        stateMachine = StateFactory.createStateMachine(JSON.parse(content))
      } else if (options.cdk) {
        spinner.text = 'Extracting state machine from CDK output...'
        const cdkContent = readFileSync(options.cdk, 'utf-8')
        const cdkTemplate = JSON.parse(cdkContent)
        stateMachine = StateFactory.createStateMachine(
          extractStateMachineFromCDK(cdkTemplate, {
            stateMachineName: options.cdkStateMachine,
          }),
        )
      }
    } else {
      throw new Error('Either --name, --asl, or --cdk option is required')
    }

    const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null
    const input = options.input ? JSON.parse(options.input) : {}

    if (mockPath) {
      spinner.text = 'Loading mock configuration...'
    }
    spinner.text = 'Executing state machine...'

    if (!stateMachine) {
      throw new Error('State machine not loaded')
    }

    // 共通の実行ロジックを使用
    const result = await executeStateMachine(stateMachine, mockPath, input, options, config)

    spinner.succeed(chalk.green('Execution completed successfully'))

    const coverageManager = new CoverageStorageManager()
    if (stateMachine) {
      coverageManager.saveExecution(
        stateMachine,
        result.executionPath,
        input,
        result.output,
        result.success,
      )
    }

    if (!options.quiet) {
      console.log(`\n${chalk.blue('Execution Result:')}`)
      console.log(JSON.stringify(result.output, null, 2))

      if (options.verbose) {
        console.log(`\n${chalk.blue('Execution Path:')}`)
        result.executionPath.forEach((state, index) => {
          console.log(chalk.gray(`${index + 1}. ${state}`))
        })
      }
    }

    // Show coverage if requested
    if (options.cov) {
      if (!stateMachine) {
        throw new Error('State machine is undefined')
      }
      const tracker = new NestedCoverageTracker(stateMachine)

      // Track current execution
      tracker.trackExecution(result.executionPath)

      // Track Map/Parallel executions if present
      tracker.trackMapExecutions(transformMapExecutions(result.mapExecutions))
      tracker.trackParallelExecutions(transformParallelExecutions(result.parallelExecutions))

      const allExecutions = coverageManager.loadExecutions(stateMachine)
      for (const execution of allExecutions) {
        tracker.trackExecution(execution.executionPath)
      }

      const coverage = tracker.getCoverage()
      const reporter = new CoverageReporter(coverage)

      const format = typeof options.cov === 'string' ? options.cov : 'text'
      let report: string
      switch (format) {
        case 'json':
          report = reporter.generateJSON()
          break
        case 'html':
          report = reporter.generateHTML()
          break
        default:
          report = reporter.generateText()
          break
      }

      console.log(`\n${report}`)
    }
  } catch (error) {
    spinner.fail(chalk.red('Execution failed'))
    console.error(error)
    process.exit(1)
  }
}

// テストスイート実行関数
async function runTestSuite(options: RunOptions): Promise<void> {
  const spinner = ora('Loading test suite...').start()

  try {
    const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null

    const runner = new TestSuiteRunner(options.suite || '')
    spinner.text = 'Running tests...'

    const enableCoverage = !!options.cov
    const result = await runner.runSuite(enableCoverage, {
      verbose: options.verbose,
      quiet: options.quiet,
      executionContext: config?.executionContext,
    })
    spinner.stop()

    switch (options.reporter) {
      case 'json':
        outputJsonReport(result, options.output)
        break
      case 'junit':
        outputJunitReport(result, options.output)
        break
      default:
        outputDefaultReport(result, options.verbose)
    }

    // Display coverage report if enabled
    if (options.cov && result.coverage) {
      const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null
      displayCoverageReport(result.coverage, {
        format: options.cov,
        coverageDir: config?.paths?.coverage,
      })
    }

    // Exit with error code if tests failed
    if (result.failedTests > 0) {
      process.exit(1)
    } else {
      // Exit successfully
      process.exit(0)
    }
  } catch (error) {
    spinner.fail(chalk.red('Test execution failed'))
    console.error(error)
    process.exit(1)
  }
}
