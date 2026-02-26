import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestSuiteRunner } from '../../core/test/suite-runner'
import {
  displayCoverageReport,
  outputDefaultReport,
  outputJsonReport,
  outputJunitReport,
} from '../reporters/test-reporter'
import { testCommand } from './test'

// Mock modules
vi.mock('../../core/test/suite-runner')
vi.mock('../reporters/test-reporter', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reporters/test-reporter')>()
  return {
    ...original,
    displayCoverageReport: vi.fn(),
    outputDefaultReport: vi.fn(),
    outputJsonReport: vi.fn(),
    outputJunitReport: vi.fn(),
  }
})
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
      expect(outputDefaultReport).toHaveBeenCalledWith(
        expect.objectContaining({ passedTests: 10 }),
        undefined,
      )
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

      expect(outputDefaultReport).toHaveBeenCalledWith(
        expect.objectContaining({ failedTests: 3 }),
        undefined,
      )
    })
  })

  describe('coverage reporting', () => {
    it('should display coverage when --cov option is provided', async () => {
      const mockCoverage = {
        states: { total: 10, covered: 8, percentage: 80 },
        branches: { total: 5, covered: 4, percentage: 80 },
        uncoveredStates: ['State1'],
        uncoveredBranches: ['Branch1'],
        executionPaths: [],
      }
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
        coverage: mockCoverage,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      await testCommand({
        suite: './test-suite.yaml',
        cov: true,
      })

      expect(mockRunner.runSuite).toHaveBeenCalledWith(true)
      expect(displayCoverageReport).toHaveBeenCalledWith(mockCoverage, {
        format: true,
        outputPath: undefined,
      })
    })

    it('should save coverage to file when format and output specified', async () => {
      const mockCoverage = {
        states: { total: 10, covered: 10, percentage: 100 },
        branches: { total: 5, covered: 5, percentage: 100 },
        uncoveredStates: [],
        uncoveredBranches: [],
        executionPaths: [],
      }
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
        coverage: mockCoverage,
      }

      const mockRunner = {
        runSuite: vi.fn().mockResolvedValue(mockResult),
      }

      vi.mocked(TestSuiteRunner).mockImplementation(() => mockRunner as unknown as TestSuiteRunner)

      await testCommand({
        suite: './test-suite.yaml',
        cov: 'json',
        output: './coverage.json',
      })

      expect(displayCoverageReport).toHaveBeenCalledWith(mockCoverage, {
        format: 'json',
        outputPath: './coverage.json',
      })
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

      await testCommand({
        suite: './test-suite.yaml',
        reporter: 'json',
        output: './results.json',
      })

      expect(outputJsonReport).toHaveBeenCalledWith(
        expect.objectContaining({ passedTests: 10 }),
        './results.json',
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

      await testCommand({
        suite: './test-suite.yaml',
        reporter: 'junit',
        output: './results.xml',
      })

      expect(outputJunitReport).toHaveBeenCalledWith(
        expect.objectContaining({ suiteName: 'Test Suite' }),
        './results.xml',
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

      expect(outputDefaultReport).toHaveBeenCalledWith(
        expect.objectContaining({ passedTests: 10 }),
        undefined,
      )
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
