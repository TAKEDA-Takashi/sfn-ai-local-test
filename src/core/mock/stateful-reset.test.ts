import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/state-factory'
import { TestSuiteExecutor } from '../test/executor'
import { MockEngine } from './engine'

describe('Stateful Mock Reset', () => {
  it('should reset call counts between test cases', async () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'GetData',
      States: {
        GetData: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:GetData',
          End: true,
        },
      },
    })

    const mockConfig = {
      version: '1.0' as const,
      mocks: [
        {
          state: 'GetData',
          type: 'stateful' as const,
          responses: [{ data: 'first' }, { data: 'second' }, { data: 'third' }],
        },
      ],
    }

    const suite = {
      version: '1.0',
      name: 'Test Suite',
      testCases: [
        {
          name: 'Test 1',
          input: {},
          expectedOutput: { data: 'first' },
        },
        {
          name: 'Test 2',
          input: {},
          expectedOutput: { data: 'first' }, // Should get 'first' again, not 'second'
        },
      ],
    }

    const mockEngine = new MockEngine(mockConfig)
    const executor = new TestSuiteExecutor(suite, stateMachine, mockEngine)
    const results = await executor.runSuite()

    expect(results.results).toHaveLength(2)
    expect(results.results[0].status).toBe('passed')
    expect(results.results[1].status).toBe('passed')
  })

  it('should reset call counts for mockOverrides with stateful type', async () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'GetData',
      States: {
        GetData: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:GetData',
          End: true,
        },
      },
    })

    const suite = {
      version: '1.0',
      name: 'Test Suite',
      testCases: [
        {
          name: 'Test 1',
          input: {},
          mockOverrides: [
            {
              state: 'GetData',
              type: 'stateful' as const,
              responses: [{ data: 'override-first' }, { data: 'override-second' }],
            },
          ],
          expectedOutput: { data: 'override-first' },
        },
        {
          name: 'Test 2',
          input: {},
          mockOverrides: [
            {
              state: 'GetData',
              type: 'stateful' as const,
              responses: [{ data: 'new-first' }, { data: 'new-second' }],
            },
          ],
          expectedOutput: { data: 'new-first' }, // Should get 'new-first', not 'new-second'
        },
      ],
    }

    const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
    const executor = new TestSuiteExecutor(suite, stateMachine, mockEngine)
    const results = await executor.runSuite()

    expect(results.results).toHaveLength(2)
    expect(results.results[0].status).toBe('passed')
    expect(results.results[1].status).toBe('passed')
  })

  it('should handle multiple calls within single test case correctly', async () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'Loop',
      States: {
        Loop: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Check',
          Next: 'CheckResult',
        },
        CheckResult: {
          Type: 'Choice',
          Choices: [
            {
              Variable: '$.continue',
              BooleanEquals: true,
              Next: 'Loop',
            },
          ],
          Default: 'Done',
        },
        Done: {
          Type: 'Succeed',
        },
      },
    })

    const mockConfig = {
      version: '1.0' as const,
      mocks: [
        {
          state: 'Loop',
          type: 'stateful' as const,
          responses: [
            { continue: true, iteration: 1 },
            { continue: true, iteration: 2 },
            { continue: false, iteration: 3 }, // Stop on third iteration
          ],
        },
      ],
    }

    const suite = {
      version: '1.0',
      name: 'Test Suite',
      testCases: [
        {
          name: 'Test loop',
          input: {},
          expectedOutput: { continue: false, iteration: 3 },
        },
        {
          name: 'Test loop again',
          input: {},
          // Should restart from first response due to reset
          expectedOutput: { continue: false, iteration: 3 },
        },
      ],
    }

    const mockEngine = new MockEngine(mockConfig)
    const executor = new TestSuiteExecutor(suite, stateMachine, mockEngine)
    const results = await executor.runSuite()

    expect(results.results).toHaveLength(2)
    expect(results.results[0].status).toBe('passed')
    expect(results.results[1].status).toBe('passed')
  })
})
