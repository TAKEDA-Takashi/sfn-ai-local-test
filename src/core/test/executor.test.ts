import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionContextConfig } from '../../schemas/config-schema'
import type { TestCase, TestSuite } from '../../schemas/test-schema'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/asl'
import { NestedCoverageTracker } from '../coverage/nested-coverage-tracker'
import { StateMachineExecutor } from '../interpreter/executor'
import { MockEngine } from '../mock/engine'
import { TestAssertions } from './assertions'
import { TestSuiteExecutor } from './executor'

// Mock dependencies
vi.mock('../interpreter/executor')
vi.mock('../mock/engine')
vi.mock('../coverage/nested-coverage-tracker')
vi.mock('./assertions')

describe('TestSuiteExecutor', () => {
  let mockStateMachine: StateMachine
  let mockMockEngine: MockEngine
  let testSuite: TestSuite
  let executor: TestSuiteExecutor

  beforeEach(() => {
    vi.clearAllMocks()

    mockStateMachine = {
      StartAt: 'Start',
      States: {
        Start: StateFactory.createState({ Type: 'Pass', End: true }),
      },
    }

    mockMockEngine = new MockEngine({
      version: '1.0',
      mocks: [],
    })

    testSuite = {
      version: '1.0',
      name: 'Test Suite',
      stateMachine: './test.json',
      testCases: [
        {
          name: 'Basic test',
          input: { test: 'data' },
          expectedOutput: { result: 'success' },
        },
      ],
    }

    executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

    // Mock StateMachineExecutor
    const mockExecutorInstance = {
      execute: vi.fn().mockResolvedValue({
        output: { result: 'success' },
        executionPath: ['Start'],
        success: true,
      }),
    }
    vi.mocked(StateMachineExecutor).mockImplementation(
      () => mockExecutorInstance as unknown as StateMachineExecutor,
    )

    // Mock TestAssertions
    vi.mocked(TestAssertions.performAssertions).mockReturnValue([
      { type: 'output', expected: 'success', actual: 'success', passed: true } as any,
    ])

    // Mock NestedCoverageTracker
    const mockCoverageTracker = {
      trackExecution: vi.fn(),
      trackMapExecutions: vi.fn(),
      trackParallelExecutions: vi.fn(),
      getCoverage: vi.fn().mockReturnValue({
        totalStates: 1,
        coveredStates: 1,
        uncoveredStates: [],
        coveragePercentage: 100,
      }),
    }
    vi.mocked(NestedCoverageTracker).mockImplementation(
      () => mockCoverageTracker as unknown as NestedCoverageTracker,
    )
  })

  describe('runSuite', () => {
    it('should run test suite successfully without coverage', async () => {
      const result = await executor.runSuite(false)

      expect(result.suiteName).toBe('Test Suite')
      expect(result.totalTests).toBe(1)
      expect(result.passedTests).toBe(1)
      expect(result.failedTests).toBe(0)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.status).toBe('passed')
      expect(result.coverage).toBeUndefined()
    })

    it('should run test suite with coverage tracking enabled', async () => {
      const result = await executor.runSuite(true)

      expect(result.suiteName).toBe('Test Suite')
      expect(result.totalTests).toBe(1)
      expect(result.passedTests).toBe(1)
      expect(result.failedTests).toBe(0)
      expect(result.coverage).toBeDefined()
      expect((result.coverage as any)?.coveragePercentage).toBe(100)
    })

    it('should handle parallel execution', async () => {
      testSuite.settings = { parallel: true }
      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const result = await executor.runSuite(false)

      expect(result.totalTests).toBe(1)
      expect(result.passedTests).toBe(1)
    })

    it('should handle stop on failure setting', async () => {
      // Mock a failing test
      vi.mocked(TestAssertions.performAssertions).mockReturnValue([
        { type: 'output', expected: 'success', actual: 'failure', passed: false } as any,
      ])

      testSuite.settings = { stopOnFailure: true }
      testSuite.testCases = [
        {
          name: 'Failing test',
          input: { test: 'data' },
          expectedOutput: { result: 'success' },
        },
        {
          name: 'Second test',
          input: { test: 'data2' },
          expectedOutput: { result: 'success' },
        },
      ]
      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const result = await executor.runSuite(false)

      expect(result.totalTests).toBe(1) // Should stop after first failure
      expect(result.failedTests).toBe(1)
    })

    it('should handle test timeout', async () => {
      const mockExecutorInstance = {
        execute: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      testSuite.settings = { timeout: 50 }
      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const result = await executor.runSuite(false)

      expect(result.results[0]?.status).toBe('failed')
      expect(result.results[0]?.error).toContain('timed out')
    })

    it('should handle runtime errors', async () => {
      const mockExecutorInstance = {
        execute: vi.fn().mockRejectedValue(new Error('Runtime error')),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      const result = await executor.runSuite(false)

      expect(result.results[0]?.status).toBe('failed')
      expect(result.results[0]?.error).toBe('Runtime error')
    })
  })

  describe('getTestCasesToRun', () => {
    it('should return all non-skipped tests by default', () => {
      testSuite.testCases = [
        { name: 'Test 1', input: {}, expectedOutput: {} },
        { name: 'Test 2', input: {}, expectedOutput: {}, skip: true },
        { name: 'Test 3', input: {}, expectedOutput: {} },
      ]
      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const result = (executor as any).getTestCasesToRun()
      expect(result).toHaveLength(2)
      expect(result[0]?.name).toBe('Test 1')
      expect(result[1]?.name).toBe('Test 3')
    })

    it('should return only "only" tests when present', () => {
      testSuite.testCases = [
        { name: 'Test 1', input: {}, expectedOutput: {} },
        { name: 'Test 2', input: {}, expectedOutput: {}, only: true },
        { name: 'Test 3', input: {}, expectedOutput: {}, only: true },
      ]
      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const result = (executor as any).getTestCasesToRun()
      expect(result).toHaveLength(2)
      expect(result[0]?.name).toBe('Test 2')
      expect(result[1]?.name).toBe('Test 3')
    })
  })

  describe('runTestCase', () => {
    it('should run individual test case successfully', async () => {
      const testCase: TestCase = {
        name: 'Individual test',
        input: { test: 'data' },
        expectedOutput: { result: 'success' },
      }

      const result = await (executor as any).runTestCase(testCase)

      expect(result.name).toBe('Individual test')
      expect(result.status).toBe('passed')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should handle mock overrides', async () => {
      const testCase: TestCase = {
        name: 'Test with overrides',
        input: { test: 'data' },
        expectedOutput: { result: 'success' },
        mockOverrides: [
          {
            state: 'TestState',
            type: 'fixed',
            response: { data: 'mocked' },
          },
        ],
      }

      vi.mocked(mockMockEngine.setMockOverrides).mockImplementation(() => {})
      vi.mocked(mockMockEngine.clearMockOverrides).mockImplementation(() => {})

      const result = await (executor as any).runTestCase(testCase)

      expect(result.status).toBe('passed')
      expect(mockMockEngine.setMockOverrides).toHaveBeenCalled()
      expect(mockMockEngine.clearMockOverrides).toHaveBeenCalled()
    })

    it('should handle custom timeout', async () => {
      const mockExecutorInstance = {
        execute: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      const testCase: TestCase = {
        name: 'Timeout test',
        input: { test: 'data' },
        expectedOutput: { result: 'success' },
        timeout: 50,
      }

      const result = await (executor as any).runTestCase(testCase)

      expect(result.status).toBe('failed')
      expect(result.error).toContain('timed out')
    })
  })

  describe('convertMockOverrides', () => {
    it('should convert mock overrides correctly', () => {
      const overrides = [
        {
          state: 'TestState',
          type: 'fixed' as const,
          response: { data: 'test' },
        },
      ]

      const result = executor.convertMockOverrides(overrides)

      expect(result).toHaveLength(1)
      expect(result[0]?.state).toBe('TestState')
      expect(result[0]?.type).toBe('fixed')
      expect((result[0] as any)?.response).toEqual({ data: 'test' })
    })
  })

  describe('ExecutionContext priority', () => {
    it('should pass executionContext from options to StateMachineExecutor', async () => {
      const executionContext: ExecutionContextConfig = {
        name: 'custom-execution',
        startTime: '2024-06-01T12:00:00.000Z',
        roleArn: 'arn:aws:iam::999999999999:role/CustomRole',
      }

      const mockExecutorInstance = {
        execute: vi.fn().mockResolvedValue({
          output: { result: 'success' },
          executionPath: ['Start'],
          success: true,
        }),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      const options = { executionContext }
      const result = await executor.runSuite(false, options)

      expect(result.passedTests).toBe(1)
      expect(mockExecutorInstance.execute).toHaveBeenCalledWith(
        { test: 'data' },
        expect.objectContaining({
          executionContext,
        }),
      )
    })

    it('should prioritize test case executionContext over suite and options', async () => {
      const optionsContext: ExecutionContextConfig = {
        name: 'options-execution',
        startTime: '2024-01-01T00:00:00.000Z',
      }

      const suiteContext: ExecutionContextConfig = {
        name: 'suite-execution',
        startTime: '2024-02-01T00:00:00.000Z',
        region: 'us-west-2',
      }

      const testCaseContext: ExecutionContextConfig = {
        name: 'test-case-execution',
        startTime: '2024-03-01T00:00:00.000Z',
        accountId: '777777777777',
      }

      testSuite.executionContext = suiteContext
      testSuite.testCases = [
        {
          name: 'Test with context',
          input: { test: 'data' },
          expectedOutput: { result: 'success' },
          executionContext: testCaseContext,
        },
      ]

      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const mockExecutorInstance = {
        execute: vi.fn().mockResolvedValue({
          output: { result: 'success' },
          executionPath: ['Start'],
          success: true,
        }),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      const options = { executionContext: optionsContext }
      await executor.runSuite(false, options)

      // Should merge all three with test case taking precedence
      expect(mockExecutorInstance.execute).toHaveBeenCalledWith(
        { test: 'data' },
        expect.objectContaining({
          executionContext: {
            name: 'test-case-execution', // from test case
            startTime: '2024-03-01T00:00:00.000Z', // from test case
            accountId: '777777777777', // from test case
            region: 'us-west-2', // from suite (not overridden)
          },
        }),
      )
    })

    it('should handle executionContext from suite when test case has none', async () => {
      const suiteContext: ExecutionContextConfig = {
        name: 'suite-execution',
        region: 'eu-west-1',
      }

      testSuite.executionContext = suiteContext
      executor = new TestSuiteExecutor(testSuite, mockStateMachine, mockMockEngine)

      const mockExecutorInstance = {
        execute: vi.fn().mockResolvedValue({
          output: { result: 'success' },
          executionPath: ['Start'],
          success: true,
        }),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      await executor.runSuite(false)

      expect(mockExecutorInstance.execute).toHaveBeenCalledWith(
        { test: 'data' },
        expect.objectContaining({
          executionContext: suiteContext,
        }),
      )
    })

    it('should not pass executionContext when none is provided', async () => {
      const mockExecutorInstance = {
        execute: vi.fn().mockResolvedValue({
          output: { result: 'success' },
          executionPath: ['Start'],
          success: true,
        }),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      await executor.runSuite(false)

      expect(mockExecutorInstance.execute).toHaveBeenCalledWith(
        { test: 'data' },
        expect.objectContaining({
          executionContext: undefined,
        }),
      )
    })
  })

  describe('Error message formatting', () => {
    it('should show detailed error in verbose mode', async () => {
      testSuite.testCases[0].stateExpectations = [{ state: 'NonExistentState', output: {} }]

      const mockExecutorInstance = {
        execute: vi.fn().mockResolvedValue({
          output: { result: 'success' },
          executionPath: ['Start'],
          success: true,
          stateExecutions: [],
        }),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      vi.mocked(TestAssertions.performAssertions).mockImplementation(() => {
        throw new Error(
          'Failed to assert state expectations for states [NonExistentState]: no stateExecutions were captured',
        )
      })

      const result = await executor.runSuite(false, { verbose: true })

      expect(result.results[0].status).toBe('failed')
      expect(result.results[0].error).toContain('Assertion failed while checking')
      expect(result.results[0].error).toContain('state expectations')
      expect(result.results[0].error).toContain('Failed to assert state expectations')
    })

    it('should show simplified error in non-verbose mode', async () => {
      testSuite.testCases[0].stateExpectations = [{ state: 'NonExistentState', output: {} }]

      const mockExecutorInstance = {
        execute: vi.fn().mockResolvedValue({
          output: { result: 'success' },
          executionPath: ['Start'],
          success: true,
          stateExecutions: [],
        }),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      vi.mocked(TestAssertions.performAssertions).mockImplementation(() => {
        throw new Error(
          'Failed to assert state expectations for states [NonExistentState]: no stateExecutions were captured',
        )
      })

      const result = await executor.runSuite(false, { verbose: false })

      expect(result.results[0].status).toBe('failed')
      expect(result.results[0].error).toBe(
        'State expectations failed for [NonExistentState]: No state executions captured',
      )
    })

    it('should handle runtime errors differently from assertion errors', async () => {
      const mockExecutorInstance = {
        execute: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      }
      vi.mocked(StateMachineExecutor).mockImplementation(
        () => mockExecutorInstance as unknown as StateMachineExecutor,
      )

      const result = await executor.runSuite(false, { verbose: true })

      expect(result.results[0].status).toBe('failed')
      expect(result.results[0].error).toContain('Runtime error during test execution')
      expect(result.results[0].error).toContain('Connection timeout')
    })
  })
})
