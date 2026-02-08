import chalk from 'chalk'
import ora from 'ora'
import { TestSuiteRunner } from '../../core/test/suite-runner'
import {
  displayCoverageReport,
  outputDefaultReport,
  outputJsonReport,
  outputJunitReport,
} from '../reporters/test-reporter'

interface TestOptions {
  suite: string
  verbose?: boolean
  reporter?: 'default' | 'json' | 'junit'
  output?: string
  bail?: boolean
  cov?: string | boolean
}

export async function testCommand(options: TestOptions): Promise<void> {
  if (!options.suite) {
    console.error(chalk.red('Error: --suite option is required'))
    process.exit(1)
  }

  const spinner = ora('Loading test suite...').start()

  try {
    const runner = new TestSuiteRunner(options.suite)
    spinner.text = 'Running tests...'

    const enableCoverage = !!options.cov
    const result = await runner.runSuite(enableCoverage)
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

    if (options.cov && result.coverage) {
      displayCoverageReport(result.coverage, {
        format: options.cov,
        outputPath: options.output,
      })
    }

    if (result.failedTests > 0) {
      process.exit(1)
    }
  } catch (error) {
    spinner.fail(chalk.red('Test execution failed'))
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
