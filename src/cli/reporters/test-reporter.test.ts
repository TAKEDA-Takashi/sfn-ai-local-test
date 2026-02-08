import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverageReport } from '../../core/coverage/nested-coverage-tracker'
import { CoverageReporter } from '../../core/coverage/reporter'
import type { TestSuiteResult } from '../../types/test'
import {
  displayCoverageReport,
  generateJunitXml,
  getStatusColor,
  getStatusIcon,
  outputDefaultReport,
  outputJsonReport,
  outputJunitReport,
} from './test-reporter'

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  }
})

vi.mock('../../core/coverage/reporter', () => {
  const MockCoverageReporter = vi.fn()
  MockCoverageReporter.prototype.generateText = vi.fn().mockReturnValue('text report')
  MockCoverageReporter.prototype.generateJSON = vi.fn().mockReturnValue('{"coverage": "json"}')
  MockCoverageReporter.prototype.generateHTML = vi.fn().mockReturnValue('<html>coverage</html>')
  return { CoverageReporter: MockCoverageReporter }
})

function createMockResult(overrides: Partial<TestSuiteResult> = {}): TestSuiteResult {
  return {
    suiteName: 'Test Suite',
    totalTests: 3,
    passedTests: 2,
    failedTests: 1,
    skippedTests: 0,
    duration: 500,
    results: [
      {
        name: 'test passed',
        status: 'passed',
        duration: 100,
      },
      {
        name: 'test failed',
        status: 'failed',
        duration: 200,
        errorMessage: 'Expected true but got false',
        error: 'Assertion error',
        assertions: [
          {
            type: 'output' as const,
            passed: false,
            message: 'Expected true but got false',
            expected: true,
            actual: false,
          },
        ],
      },
      {
        name: 'test passed 2',
        status: 'passed',
        duration: 200,
      },
    ],
    summary: {
      successRate: 66.7,
      averageDuration: 166.7,
      slowestTest: {
        name: 'test failed',
        status: 'failed',
        duration: 200,
      },
    },
    ...overrides,
  }
}

function createMockCoverage(): CoverageReport {
  return {
    topLevel: {
      total: 10,
      covered: 7,
      percentage: 70,
      uncovered: ['State3', 'State4', 'State5'],
    },
    nested: {},
    branches: {
      total: 4,
      covered: 3,
      percentage: 75,
      uncovered: ['Branch2'],
    },
    paths: {
      total: 5,
      unique: 3,
    },
  }
}

describe('test-reporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Re-setup prototype mocks after clearAllMocks
    vi.mocked(CoverageReporter.prototype.generateText).mockReturnValue('text report')
    vi.mocked(CoverageReporter.prototype.generateJSON).mockReturnValue('{"coverage": "json"}')
    vi.mocked(CoverageReporter.prototype.generateHTML).mockReturnValue('<html>coverage</html>')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStatusIcon', () => {
    it('should return correct icon for passed', () => {
      expect(getStatusIcon('passed')).toBe('\u2705')
    })

    it('should return correct icon for failed', () => {
      expect(getStatusIcon('failed')).toBe('\u274C')
    })

    it('should return correct icon for skipped', () => {
      expect(getStatusIcon('skipped')).toBe('\u23ED\uFE0F')
    })

    it('should return correct icon for timeout', () => {
      expect(getStatusIcon('timeout')).toBe('\u23F0')
    })

    it('should return question mark for unknown status', () => {
      expect(getStatusIcon('unknown')).toBe('\u2753')
    })
  })

  describe('getStatusColor', () => {
    it('should return a function for each status', () => {
      expect(typeof getStatusColor('passed')).toBe('function')
      expect(typeof getStatusColor('failed')).toBe('function')
      expect(typeof getStatusColor('skipped')).toBe('function')
      expect(typeof getStatusColor('timeout')).toBe('function')
      expect(typeof getStatusColor('unknown')).toBe('function')
    })

    it('should apply color to text', () => {
      const colorFn = getStatusColor('passed')
      const result = colorFn('test')
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })
  })

  describe('generateJunitXml', () => {
    it('should generate valid XML structure', () => {
      const result = createMockResult()
      const xml = generateJunitXml(result)

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(xml).toContain('<testsuite')
      expect(xml).toContain('name="Test Suite"')
      expect(xml).toContain('tests="3"')
      expect(xml).toContain('failures="1"')
      expect(xml).toContain('</testsuite>')
    })

    it('should include failure elements for failed tests', () => {
      const result = createMockResult()
      const xml = generateJunitXml(result)

      expect(xml).toContain('<failure')
      expect(xml).toContain('Expected true but got false')
    })

    it('should include skipped elements for skipped tests', () => {
      const result = createMockResult({
        results: [{ name: 'skipped test', status: 'skipped', duration: 0 }],
      })
      const xml = generateJunitXml(result)

      expect(xml).toContain('<skipped/>')
    })

    it('should escape XML special characters', () => {
      const result = createMockResult({
        suiteName: 'Suite <with> "special" & \'chars\'',
      })
      const xml = generateJunitXml(result)

      expect(xml).toContain('&amp;')
      expect(xml).toContain('&lt;')
      expect(xml).toContain('&gt;')
      expect(xml).toContain('&quot;')
      expect(xml).toContain('&apos;')
    })
  })

  describe('outputDefaultReport', () => {
    it('should output test suite name', () => {
      const result = createMockResult()
      outputDefaultReport(result)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Suite'))
    })

    it('should output pass/fail counts', () => {
      const result = createMockResult()
      outputDefaultReport(result)

      const allCalls = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(allCalls).toContain('Passed:')
      expect(allCalls).toContain('Failed:')
    })

    it('should show error details for failed tests', () => {
      const result = createMockResult()
      outputDefaultReport(result)

      const allCalls = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(allCalls).toContain('Assertion error')
    })

    it('should show verbose assertion details when verbose is true', () => {
      const result = createMockResult()
      outputDefaultReport(result, true)

      const allCalls = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(allCalls).toContain('Expected:')
      expect(allCalls).toContain('Actual:')
    })

    it('should show skipped count when there are skipped tests', () => {
      const result = createMockResult({ skippedTests: 2 })
      outputDefaultReport(result)

      const allCalls = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(allCalls).toContain('Skipped:')
    })

    it('should show all passed message when no failures', () => {
      const result = createMockResult({ failedTests: 0 })
      outputDefaultReport(result)

      const allCalls = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(allCalls).toContain('All tests passed!')
    })

    it('should show verbose hint when not verbose and tests failed', () => {
      const result = createMockResult()
      outputDefaultReport(result, false)

      const allCalls = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(allCalls).toContain('--verbose')
    })
  })

  describe('outputJsonReport', () => {
    it('should output JSON to console when no outputPath', () => {
      const result = createMockResult()
      outputJsonReport(result)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"suiteName"'))
    })

    it('should write JSON to file when outputPath is provided', () => {
      const result = createMockResult()
      outputJsonReport(result, '/tmp/report.json')

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/report.json',
        expect.stringContaining('"suiteName"'),
      )
    })
  })

  describe('outputJunitReport', () => {
    it('should output JUnit XML to console when no outputPath', () => {
      const result = createMockResult()
      outputJunitReport(result)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('<?xml'))
    })

    it('should write JUnit XML to file when outputPath is provided', () => {
      const result = createMockResult()
      outputJunitReport(result, '/tmp/report.xml')

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/report.xml',
        expect.stringContaining('<?xml'),
      )
    })
  })

  describe('displayCoverageReport', () => {
    it('should display text coverage report by default', () => {
      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: true })

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should display text coverage report when format is "text"', () => {
      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: 'text' })

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should display JSON coverage report', () => {
      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: 'json' })

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should write HTML coverage to coverageDir', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: 'html', coverageDir: '/tmp/coverage' })

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('coverage.html'),
        expect.any(String),
      )
    })

    it('should create coverageDir if it does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: 'html', coverageDir: '/tmp/coverage' })

      expect(mkdirSync).toHaveBeenCalledWith('/tmp/coverage', { recursive: true })
    })

    it('should write to outputPath when provided for JSON', () => {
      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: 'json', outputPath: '/tmp/coverage.json' })

      expect(writeFileSync).toHaveBeenCalledWith('/tmp/coverage.json', expect.any(String))
    })

    it('should write to outputPath when provided for HTML', () => {
      const coverage = createMockCoverage()
      displayCoverageReport(coverage, { format: 'html', outputPath: '/tmp/coverage.html' })

      expect(writeFileSync).toHaveBeenCalledWith('/tmp/coverage.html', expect.any(String))
    })

    it('should handle invalid coverage data gracefully', () => {
      const invalidCoverage = {} as CoverageReport
      displayCoverageReport(invalidCoverage, { format: 'text' })

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid coverage data'))
    })

    it('should normalize coverage data exceeding 100%', () => {
      const overCoverage = createMockCoverage()
      overCoverage.topLevel.covered = 15 // exceeds total of 10
      overCoverage.topLevel.percentage = 150

      displayCoverageReport(overCoverage, { format: 'text' })

      // Should not throw and should be called with normalized data
      expect(consoleSpy).toHaveBeenCalled()
    })
  })
})
