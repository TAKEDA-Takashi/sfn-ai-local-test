import * as fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoverageReporter } from '../../core/coverage/reporter'
import { TestSuiteRunner } from '../../core/test/suite-runner'
import { testCommand } from './test'

// Mock modules
vi.mock('fs')
vi.mock('../../core/test/suite-runner')
vi.mock('../../core/coverage/reporter')
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  }),
}))

describe('testCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('option validation', () => {
    it('should require --suite option', async () => {
      await expect(testCommand({} as unknown as Parameters<typeof testCommand>[0])).rejects.toThrow(
        'process.exit called',
      )

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('--suite option is required'),
      )
    })
  })

  describe('test execution', () => {
    it('should run test suite successfully', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 10,
        failedTests: 0,
        skippedTests: 1,
        totalTests: 11,
        duration: 1000,
        results: [
          {
            name: 'test1',
            status: 'passed' as const,
            duration: 100,
          },
        ],
        summary: {
          successRate: 90.9,
          averageDuration: 100,
          slowestTest: { name: 'test1', duration: 100 },
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      await testCommand({
        suite: './test-suite.yaml',
      })

      expect(TestSuiteRunner).toHaveBeenCalledWith('./test-suite.yaml')
      expect(mockRunner.runSuite).toHaveBeenCalledWith(false)
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Passed:'))
    })

    it('should handle test failures', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 5,
        failedTests: 3,
        skippedTests: 0,
        totalTests: 8,
        duration: 1500,
        results: [
          {
            name: 'test1',
            status: 'failed' as const,
            duration: 100,
            errorMessage: 'Assertion failed',
          },
        ],
        summary: {
          successRate: 62.5,
          averageDuration: 187.5,
          slowestTest: { name: 'test1', duration: 100 },
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      await expect(
        testCommand({
          suite: './test-suite.yaml',
        }),
      ).rejects.toThrow('process.exit called')

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Failed:'))
    })
  })

  describe('coverage reporting', () => {
    it('should display coverage when --cov option is provided', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 10,
        duration: 1000,
        results: [],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: {
          states: { total: 10, covered: 8, percentage: 80 },
          branches: { total: 5, covered: 4, percentage: 80 },
          uncoveredStates: ['State1'],
          uncoveredBranches: ['Branch1'],
          executionPaths: [],
        },
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      const mockReporter = {
        generateText: vi.fn().mockReturnValue('Coverage: 80%'),
        generateJSON: vi.fn().mockReturnValue('{"coverage": 80}'),
        generateHTML: vi.fn().mockReturnValue('<html>Coverage</html>'),
      }

      vi.mocked(CoverageReporter).mockImplementation(
        () => mockReporter as unknown as CoverageReporter,
      )

      await testCommand({
        suite: './test-suite.yaml',
        cov: true,
      })

      expect(mockRunner.runSuite).toHaveBeenCalledWith(true)
      expect(CoverageReporter).toHaveBeenCalled()
      expect(mockReporter.generateText).toHaveBeenCalled()
      expect(mockReporter.generateText).toHaveBeenCalled()
    })

    it('should save coverage to file when format and output specified', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 10,
        duration: 1000,
        results: [],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: null,
        },
        coverage: {
          states: { total: 10, covered: 10, percentage: 100 },
          branches: { total: 5, covered: 5, percentage: 100 },
          uncoveredStates: [],
          uncoveredBranches: [],
          executionPaths: [],
        },
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      const mockReporter = {
        generateJSON: vi.fn().mockReturnValue('{"coverage": 100}'),
      }

      vi.mocked(CoverageReporter).mockImplementation(
        () => mockReporter as unknown as CoverageReporter,
      )
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await testCommand({
        suite: './test-suite.yaml',
        cov: 'json',
        output: './coverage.json',
      })

      expect(mockReporter.generateJSON).toHaveBeenCalled()
      expect(fs.writeFileSync).toHaveBeenCalledWith('./coverage.json', '{"coverage": 100}')
    })
  })

  describe('reporter options', () => {
    it('should output JSON report when --reporter=json', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 10,
        duration: 1000,
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

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await testCommand({
        suite: './test-suite.yaml',
        reporter: 'json',
        output: './results.json',
      })

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        './results.json',
        expect.stringContaining('"passedTests": 10'),
      )
    })

    it('should output JUnit report when --reporter=junit', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 10,
        duration: 1000,
        results: [
          {
            name: 'test1',
            status: 'passed' as const,
            duration: 100,
          },
        ],
        summary: {
          successRate: 100,
          averageDuration: 100,
          slowestTest: { name: 'test1', duration: 100 },
        },
        coverage: null,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await testCommand({
        suite: './test-suite.yaml',
        reporter: 'junit',
        output: './results.xml',
      })

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        './results.xml',
        expect.stringContaining('<testsuite'),
      )
    })

    it('should display default report to console when no output specified', async () => {
      const mockResult = {
        suiteName: 'Test Suite',
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        totalTests: 10,
        duration: 1000,
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

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      await testCommand({
        suite: './test-suite.yaml',
      })

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Passed:'))
    })
  })

  describe('error handling', () => {
    it('should handle runner errors gracefully', async () => {
      const mockRunner = {
        runSuite: vi.fn().mockRejectedValue(new Error('Failed to load suite')),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      await expect(
        testCommand({
          suite: './test-suite.yaml',
        }),
      ).rejects.toThrow('process.exit called')

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load suite'))
    })
  })
})
