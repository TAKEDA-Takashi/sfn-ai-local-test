import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { DEFAULT_COVERAGE_DIR } from '../../constants/defaults'
import type { CoverageReport } from '../../core/coverage/nested-coverage-tracker'
import { CoverageReporter } from '../../core/coverage/reporter'
import type { TestSuiteResult } from '../../types/test'

export interface CoverageDisplayOptions {
  format: string | boolean
  /** HTML出力先ディレクトリ（run.ts用: config?.paths?.coverage） */
  coverageDir?: string
  /** ファイル出力先パス（test.ts用） */
  outputPath?: string
}

export function outputDefaultReport(result: TestSuiteResult, verbose?: boolean): void {
  console.log(chalk.blue(`\n🧪 Test Suite: ${result.suiteName}`))
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

  if (result.failedTests === 0) {
    console.log(chalk.green('\n🎉 All tests passed!'))
  } else {
    console.log(chalk.red(`\n💥 ${result.failedTests} test(s) failed`))
    if (!verbose) {
      console.log(chalk.yellow('\n💡 Run with --verbose for more detailed error information'))
    }
  }
}

export function outputJsonReport(result: TestSuiteResult, outputPath?: string): void {
  const jsonOutput = JSON.stringify(result, null, 2)

  if (outputPath) {
    writeFileSync(outputPath, jsonOutput)
    console.log(chalk.green(`JSON report saved to: ${outputPath}`))
  } else {
    console.log(jsonOutput)
  }
}

export function outputJunitReport(result: TestSuiteResult, outputPath?: string): void {
  const junitXml = generateJunitXml(result)

  if (outputPath) {
    writeFileSync(outputPath, junitXml)
    console.log(chalk.green(`JUnit report saved to: ${outputPath}`))
  } else {
    console.log(junitXml)
  }
}

export function generateJunitXml(result: TestSuiteResult): string {
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

export function getStatusIcon(status: string): string {
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

export function getStatusColor(status: string): (text: string) => string {
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

export function displayCoverageReport(
  coverage: CoverageReport,
  options: CoverageDisplayOptions,
): void {
  if (!(coverage?.topLevel && coverage?.branches && coverage?.paths)) {
    console.error('Invalid coverage data provided to displayCoverageReport')
    return
  }

  // Normalize coverage data to ensure it never exceeds 100%
  const normalizedCoverage: CoverageReport = {
    topLevel: {
      total: coverage.topLevel.total,
      covered: Math.min(coverage.topLevel.covered, coverage.topLevel.total),
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
      covered: Math.min(coverage.branches.covered, coverage.branches.total),
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
  const coverageFormat = typeof options.format === 'string' ? options.format : 'text'

  switch (coverageFormat) {
    case 'json': {
      const jsonReport = reporter.generateJSON()
      if (options.outputPath) {
        writeFileSync(options.outputPath, jsonReport)
        console.log(chalk.green(`📊 JSON coverage report saved to: ${options.outputPath}`))
      } else {
        console.log(jsonReport)
      }
      break
    }
    case 'html': {
      const htmlReport = reporter.generateHTML()
      if (options.outputPath) {
        writeFileSync(options.outputPath, htmlReport)
        console.log(chalk.green(`📊 HTML coverage report saved to: ${options.outputPath}`))
      } else {
        const coverageDir = options.coverageDir || DEFAULT_COVERAGE_DIR
        if (!existsSync(coverageDir)) {
          mkdirSync(coverageDir, { recursive: true })
        }
        const htmlPath = join(coverageDir, 'coverage.html')
        writeFileSync(htmlPath, htmlReport)
        console.log(chalk.green(`\n📊 HTML coverage report saved to: ${htmlPath}`))
      }
      break
    }
    default: {
      const report = reporter.generateText()
      console.log(`\n${report}`)
    }
  }
}
