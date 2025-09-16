import { writeFileSync } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import type { CoverageReport } from '../../core/coverage/nested-coverage-tracker'
import { CoverageReporter } from '../../core/coverage/reporter'
import { TestSuiteRunner } from '../../core/test/suite-runner'
import type { TestSuiteResult } from '../../types/test'

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
      displayCoverageReport(result.coverage, options.cov, options.output)
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

function outputDefaultReport(result: TestSuiteResult, verbose?: boolean): void {
  console.log(chalk.blue(`\\n🧪 Test Suite: ${result.suiteName}`))
  console.log(chalk.gray('─'.repeat(50)))

  for (const testResult of result.results) {
    const icon = getStatusIcon(testResult.status)
    const color = getStatusColor(testResult.status)
    const duration = `(${testResult.duration}ms)`

    console.log(`${icon} ${color(testResult.name)} ${chalk.gray(duration)}`)

    if (verbose || testResult.status === 'failed') {
      if (testResult.error) {
        console.log(chalk.red(`   ❌ ${testResult.error}`))
      }

      if (testResult.assertions) {
        for (const assertion of testResult.assertions) {
          if (!assertion.passed) {
            console.log(chalk.red(`   ❌ ${assertion.message}`))
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
  if (result.failedTests === 0) {
    console.log(chalk.green('\n🎉 All tests passed!'))
  } else {
    console.log(chalk.red(`\n💥 ${result.failedTests} test(s) failed`))
    if (!verbose) {
      console.log(chalk.yellow('\n💡 Run with --verbose for more detailed error information'))
    }
  }
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

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\\n`
  xml += `<testsuite name="${escapeXml(result.suiteName)}" `
  xml += `tests="${result.totalTests}" `
  xml += `failures="${result.failedTests}" `
  xml += `skipped="${result.skippedTests}" `
  xml += `time="${(result.duration / 1000).toFixed(3)}">\\n`

  for (const testResult of result.results) {
    xml += `  <testcase name="${escapeXml(testResult.name)}" `
    xml += `time="${(testResult.duration / 1000).toFixed(3)}">`

    if (testResult.status === 'failed') {
      xml += `\\n    <failure message="${escapeXml(testResult.errorMessage || 'Test failed')}">`
      xml += escapeXml(testResult.errorMessage || '')
      xml += `</failure>\\n  `
    } else if (testResult.status === 'skipped') {
      xml += `\\n    <skipped/>\\n  `
    }

    xml += `</testcase>\\n`
  }

  xml += `</testsuite>\\n`
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
  outputPath?: string,
): void {
  const reporter = new CoverageReporter(coverage)

  const coverageFormat = typeof format === 'string' ? format : 'text'

  switch (coverageFormat) {
    case 'json': {
      const jsonReport = reporter.generateJSON()
      if (outputPath) {
        writeFileSync(outputPath, jsonReport)
        console.log(chalk.green(`📊 JSON coverage report saved to: ${outputPath}`))
      } else {
        console.log(jsonReport)
      }
      break
    }
    case 'html': {
      const htmlReport = reporter.generateHTML()
      const filename = outputPath || `coverage-${Date.now()}.html`
      writeFileSync(filename, htmlReport)
      console.log(chalk.green(`📊 HTML coverage report saved to: ${filename}`))
      break
    }
    default:
      console.log(reporter.generateText())
      break
  }
}
