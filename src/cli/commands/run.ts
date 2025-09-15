import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
  DEFAULT_COVERAGE_DIR,
  DEFAULT_TEST_DATA_DIR,
  DEFAULT_TEST_SUITES_DIR,
} from '../../constants/defaults'
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
import type { TestSuiteResult } from '../../types/test'
import { isJsonObject } from '../../types/type-guards'

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
  cdkStateMachine?: string // CDKテンプレート内の特定のステートマシンを指定
  mock?: string
  input?: string

  // 共通オプション
  verbose?: boolean
  quiet?: boolean
  cov?: string | boolean
}

// Helper function to convert raw state machine data to StateMachine type

export async function runCommand(options: RunOptions): Promise<void> {
  // テストスイート実行モード
  if (options.suite) {
    // --suite が名前だけの場合、デフォルトパスを構築
    let suitePath = options.suite

    // パス区切り文字やファイル拡張子が含まれていない場合は名前として扱う
    if (
      !(
        suitePath.includes('/') ||
        suitePath.includes('\\') ||
        suitePath.endsWith('.yaml') ||
        suitePath.endsWith('.yml')
      )
    ) {
      // デフォルトのテストスイートディレクトリから探す
      const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null
      const testSuitesDir = config?.paths?.testSuites || DEFAULT_TEST_SUITES_DIR

      // .test.yaml または .test.yml を試す
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

    // パスが決定したらテストスイートを実行
    options.suite = suitePath
    return await runTestSuite(options)
  }

  // --nameオプションが指定された場合、対応するテストスイートを探す
  if (options.name && !options.suite) {
    const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null

    // まず設定ファイルにステートマシンが定義されているか確認
    if (!config) {
      throw new Error(`Configuration file not found: ${DEFAULT_CONFIG_FILE}`)
    }

    const stateMachineConfig = findStateMachine(config, options.name)
    if (!stateMachineConfig) {
      throw new Error(`State machine '${options.name}' not found in configuration`)
    }

    const testSuitesDir = config?.paths?.testSuites || DEFAULT_TEST_SUITES_DIR

    // テストスイートファイルを探す
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
      // テストスイートが見つからない場合はエラー
      throw new Error(
        `Test suite not found for '${options.name}'.\n` +
          `Expected to find one of:\n` +
          `  - ${yamlPath}\n` +
          `  - ${ymlPath}\n` +
          `Please create a test suite file or use --asl/--cdk options for direct execution.`,
      )
    }
  }

  // 引数なしの場合のデフォルト動作
  if (!(options.name || options.asl || options.cdk || options.suite)) {
    return await runDefaultMode(options)
  }

  // 単一実行モード
  return await runSingleExecution(options)
}

async function runDefaultMode(options: RunOptions): Promise<void> {
  // Load config once at the beginning
  const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null

  // テストスイートディレクトリを確認
  const testSuitesDir = config?.paths?.testSuites || DEFAULT_TEST_SUITES_DIR

  if (existsSync(testSuitesDir)) {
    // すべての .test.yaml ファイルを検索
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

          // カバレッジを統合
          if (result.coverage) {
            // Skip coverage processing if it's in old format or missing nested property
            if (!result.coverage?.topLevel) {
              continue // Skip if no coverage data or not in hierarchical format
            }

            if (combinedCoverage) {
              // Merge with existing coverage using simple addition approach
              if (!combinedCoverage.topLevel) {
                console.error('combinedCoverage missing topLevel structure:', combinedCoverage)
                continue
              }

              // For hierarchical coverage, we sum the totals and covered counts
              // This is simpler and avoids the complex state name mapping issues
              const newTotal: number =
                combinedCoverage.topLevel.total + result.coverage.topLevel.total
              const newCovered: number = Math.min(
                combinedCoverage.topLevel.covered + result.coverage.topLevel.covered,
                newTotal, // Never exceed total
              )

              combinedCoverage = {
                topLevel: {
                  total: newTotal,
                  covered: newCovered,
                  percentage: newTotal > 0 ? (newCovered / newTotal) * 100 : 100,
                  uncovered: [
                    ...(result.coverage.topLevel.uncovered || []),
                    ...(combinedCoverage.topLevel.uncovered || []),
                  ].filter((v, i, a) => a.indexOf(v) === i),
                },
                nested: {
                  // Merge nested coverage from both reports
                  ...(combinedCoverage.nested && typeof combinedCoverage.nested === 'object'
                    ? combinedCoverage.nested
                    : {}),
                  ...(result.coverage.nested && typeof result.coverage.nested === 'object'
                    ? result.coverage.nested
                    : {}),
                },
                branches: {
                  total: combinedCoverage.branches.total + result.coverage.branches.total,
                  covered: Math.min(
                    combinedCoverage.branches.covered + result.coverage.branches.covered,
                    combinedCoverage.branches.total + result.coverage.branches.total,
                  ),
                  percentage:
                    combinedCoverage.branches.total + result.coverage.branches.total > 0
                      ? ((combinedCoverage.branches.covered + result.coverage.branches.covered) /
                          (combinedCoverage.branches.total + result.coverage.branches.total)) *
                        100
                      : 100,
                  uncovered: [
                    ...(result.coverage.branches.uncovered || []),
                    ...(combinedCoverage.branches.uncovered || []),
                  ].filter((v, i, a) => a.indexOf(v) === i),
                },
                paths: {
                  total: (combinedCoverage.paths.total || 0) + (result.coverage.paths.total || 0),
                  unique:
                    (combinedCoverage.paths.unique || 0) + (result.coverage.paths.unique || 0),
                },
              }
            } else {
              combinedCoverage = result.coverage
            }
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
        displayCoverageReport(combinedCoverage, options.cov === true ? 'text' : options.cov, config)
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
          extractStateMachineFromCDK(cdkTemplate, options.cdkStateMachine),
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

    // Save execution path for coverage tracking
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

      // Track Map executions if present
      if (result.mapExecutions) {
        tracker.trackMapExecutions(
          result.mapExecutions.filter(isJsonObject).map((exec) => ({
            state: typeof exec.state === 'string' ? exec.state : '',
            iterationPaths:
              Array.isArray(exec.iterationPaths) &&
              exec.iterationPaths.every(
                (path: unknown) =>
                  Array.isArray(path) && path.every((p: unknown) => typeof p === 'string'),
              )
                ? exec.iterationPaths
                : undefined,
          })),
        )
      }

      // Track Parallel executions if present
      if (result.parallelExecutions) {
        tracker.trackParallelExecutions(
          result.parallelExecutions.filter(isJsonObject).map((exec) => ({
            type: typeof exec.type === 'string' ? exec.type : 'parallel',
            state: typeof exec.state === 'string' ? exec.state : '',
            branchCount: typeof exec.branchCount === 'number' ? exec.branchCount : 0,
            branchPaths:
              Array.isArray(exec.branchPaths) &&
              exec.branchPaths.every(
                (path: unknown) =>
                  Array.isArray(path) && path.every((p: unknown) => typeof p === 'string'),
              )
                ? exec.branchPaths
                : [],
          })),
        )
      }

      // Load all saved executions
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

function extractStateMachineFromCDK(
  cdkTemplate: JsonObject,
  stateMachineName?: string,
): JsonObject {
  const resources = cdkTemplate.Resources || {}
  const stateMachines: { [key: string]: JsonObject } = {}

  // すべてのステートマシンを収集
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (!isJsonObject(resource)) continue
    if (resource.Type === 'AWS::StepFunctions::StateMachine') {
      stateMachines[logicalId] = resource
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
    const properties = isJsonObject(resource.Properties) ? resource.Properties : undefined
    const definition = properties?.Definition || properties?.DefinitionString
    if (typeof definition === 'string') {
      return JSON.parse(definition)
    }
    if (isJsonObject(definition)) {
      return definition
    }
    throw new Error(`Invalid state machine definition in resource '${stateMachineName}'`)
  }

  // ステートマシンが1つだけの場合は自動的に選択
  if (stateMachineCount === 1) {
    const entry = Object.entries(stateMachines)[0]
    if (!entry) {
      throw new Error('No state machine found')
    }
    const [logicalId, resource] = entry
    console.log(chalk.gray(`  Auto-selected state machine: ${logicalId}`))
    const properties = isJsonObject(resource.Properties) ? resource.Properties : undefined
    const definition = properties?.Definition || properties?.DefinitionString
    if (typeof definition === 'string') {
      return JSON.parse(definition)
    }
    if (isJsonObject(definition)) {
      return definition
    }
    throw new Error(`Invalid state machine definition in resource '${logicalId}'`)
  }

  // 複数のステートマシンがある場合はエラー
  const availableNames = Object.keys(stateMachines).join(', ')
  throw new Error(
    `Multiple state machines found in CDK template. Please specify one with --cdk-state-machine option.\n` +
      `Available: ${availableNames}`,
  )
}

// テストスイート実行関数
async function runTestSuite(options: RunOptions): Promise<void> {
  const spinner = ora('Loading test suite...').start()

  try {
    // Load config file if it exists to get executionContext
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

    // Generate report based on reporter type
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
      // Load config for coverage path
      const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null
      displayCoverageReport(result.coverage, options.cov, config)
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

function outputDefaultReport(result: TestSuiteResult, verbose?: boolean): void {
  console.log(chalk.blue(`\n🧪 Test Suite: ${result.suiteName}`))
  console.log(chalk.gray('─'.repeat(50)))

  // Test results summary
  for (const testResult of result.results) {
    const icon = getStatusIcon(testResult.status)
    const color = getStatusColor(testResult.status)
    const duration = `(${testResult.duration}ms)`

    console.log(`${icon} ${color(testResult.name)} ${chalk.gray(duration)}`)

    if (verbose || testResult.status === 'failed') {
      if (testResult.errorMessage) {
        console.log(chalk.red(`   ❌ ${testResult.errorMessage}`))
      }

      if (testResult.assertions) {
        for (const assertion of testResult.assertions) {
          if (!assertion.passed) {
            // Handle multi-line messages (e.g., from DiffFormatter)
            const messageLines = (assertion.message || '').split('\n')
            console.log(chalk.red(`   ❌ ${messageLines[0]}`))
            for (let i = 1; i < messageLines.length; i++) {
              console.log(chalk.red(`      ${messageLines[i]}`))
            }
            if (verbose) {
              console.log(
                chalk.gray(`      Expected: ${JSON.stringify(assertion.expected, null, 2)}`),
              )
              console.log(
                chalk.gray(`      Actual:   ${JSON.stringify(assertion.actual, null, 2)}`),
              )
            }
          }
        }
      }
    }
  }

  // Summary
  console.log(chalk.gray('─'.repeat(50)))
  console.log(`📊 ${chalk.bold('Test Results:')}`)
  console.log(`   ${chalk.green('✅ Passed:')} ${result.passedTests}`)
  console.log(`   ${chalk.red('❌ Failed:')} ${result.failedTests}`)
  if (result.skippedTests > 0) {
    console.log(`   ${chalk.yellow('⏭️  Skipped:')} ${result.skippedTests}`)
  }
  console.log(`   ${chalk.blue('📈 Success Rate:')} ${result.summary.successRate.toFixed(1)}%`)
  console.log(`   ${chalk.blue('⏱️  Total Duration:')} ${result.duration}ms`)
  console.log(
    `   ${chalk.blue('📊 Average Duration:')} ${result.summary.averageDuration.toFixed(1)}ms`,
  )

  if (result.summary.slowestTest) {
    console.log(
      `   ${chalk.blue('🐌 Slowest Test:')} ${
        result.summary.slowestTest.name
      } (${result.summary.slowestTest.duration}ms)`,
    )
  }

  // Final status
  const finalStatus =
    result.failedTests === 0
      ? chalk.green('\n🎉 All tests passed!')
      : chalk.red(`\n💥 ${result.failedTests} test(s) failed`)

  console.log(finalStatus)
}

function outputJsonReport(result: TestSuiteResult, outputPath?: string): void {
  const jsonOutput = JSON.stringify(result, null, 2)

  if (outputPath) {
    writeFileSync(outputPath, jsonOutput)
    console.log(chalk.green(`JSON report saved to: ${outputPath}`))
  } else {
    console.log(jsonOutput)
  }
}

function outputJunitReport(result: TestSuiteResult, outputPath?: string): void {
  const junitXml = generateJunitXml(result)

  if (outputPath) {
    writeFileSync(outputPath, junitXml)
    console.log(chalk.green(`JUnit report saved to: ${outputPath}`))
  } else {
    console.log(junitXml)
  }
}

function generateJunitXml(result: TestSuiteResult): string {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<testsuite name="${escapeXml(result.suiteName)}" `
  xml += `tests="${result.totalTests}" `
  xml += `failures="${result.failedTests}" `
  xml += `skipped="${result.skippedTests}" `
  xml += `time="${(result.duration / 1000).toFixed(3)}">\n`

  for (const testResult of result.results) {
    xml += `  <testcase name="${escapeXml(testResult.name)}" `
    xml += `time="${(testResult.duration / 1000).toFixed(3)}">`

    if (testResult.status === 'failed') {
      xml += `\n    <failure message="${escapeXml(testResult.errorMessage || 'Test failed')}">`
      xml += escapeXml(testResult.errorMessage || '')
      xml += `</failure>\n  `
    } else if (testResult.status === 'skipped') {
      xml += `\n    <skipped/>\n  `
    }

    xml += `</testcase>\n`
  }

  xml += `</testsuite>\n`
  return xml
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✅'
    case 'failed':
      return '❌'
    case 'skipped':
      return '⏭️'
    case 'timeout':
      return '⏰'
    default:
      return '❓'
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'passed':
      return chalk.green
    case 'failed':
      return chalk.red
    case 'skipped':
      return chalk.yellow
    case 'timeout':
      return chalk.magenta
    default:
      return chalk.gray
  }
}

function displayCoverageReport(
  coverage: CoverageReport,
  format: string | boolean,
  config?: ProjectConfig | null,
): void {
  // Check if coverage data is valid
  if (!(coverage?.topLevel && coverage?.branches && coverage?.paths)) {
    console.error('Invalid coverage data provided to displayCoverageReport')
    return
  }

  // Normalize coverage data to ensure it never exceeds 100%
  const normalizedCoverage: CoverageReport = {
    topLevel: {
      total: coverage.topLevel.total,
      covered: Math.min(coverage.topLevel.covered, coverage.topLevel.total), // Ensure covered <= total
      percentage:
        coverage.topLevel.total > 0
          ? (Math.min(coverage.topLevel.covered, coverage.topLevel.total) /
              coverage.topLevel.total) *
            100
          : 100,
      uncovered: coverage.topLevel.uncovered,
    },
    nested: coverage.nested || {},
    branches: {
      total: coverage.branches.total,
      covered: Math.min(coverage.branches.covered, coverage.branches.total), // Ensure covered <= total
      percentage:
        coverage.branches.total > 0
          ? (Math.min(coverage.branches.covered, coverage.branches.total) /
              coverage.branches.total) *
            100
          : 100,
      uncovered: coverage.branches.uncovered,
    },
    paths: coverage.paths,
  }

  const reporter = new CoverageReporter(normalizedCoverage)

  // Determine coverage format
  const coverageFormat = typeof format === 'string' ? format : 'text'

  let report: string
  switch (coverageFormat) {
    case 'json':
      report = reporter.generateJSON()
      console.log(report)
      break
    case 'html': {
      report = reporter.generateHTML()
      // Get coverage path from config or use default
      const coverageDir = config?.paths?.coverage || DEFAULT_COVERAGE_DIR
      if (!existsSync(coverageDir)) {
        mkdirSync(coverageDir, { recursive: true })
      }
      const htmlPath = join(coverageDir, 'coverage.html')
      writeFileSync(htmlPath, report)
      console.log(chalk.green(`\n📊 HTML coverage report saved to: ${htmlPath}`))
      break
    }
    default:
      report = reporter.generateText()
      console.log(`\n${report}`)
  }
}
