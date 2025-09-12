import { describe, expect, it } from 'vitest'
import type { TestCase } from '../../schemas/test-schema'
import type { ExecutionResult } from '../interpreter/executor'
import { TestAssertions } from './assertions'

describe('TestAssertions with DiffFormatter', () => {
  it('should format output mismatch with diff (exact matching)', () => {
    const testCase: TestCase = {
      name: 'Test output diff',
      input: {},
      expectedOutput: {
        accountId: '123456789012',
        region: 'us-east-1',
        status: 'active',
        executionId: 'execution-1757653509569',
        traceId: 'execution-1757653509569',
      },
    }

    const result: ExecutionResult = {
      output: {
        accountId: '123456789012',
        region: 'us-east-1',
        status: 'active',
        executionId: 'execution-1757654166290',
        traceId: 'execution-1757654166290',
      },
      executionPath: [],
      success: true,
    }

    const assertions = TestAssertions.performAssertions(testCase, result, {
      outputMatching: 'exact',
    })

    expect(assertions).toHaveLength(1)
    expect(assertions[0].passed).toBe(false)
    expect(assertions[0].message).toContain('Output mismatch:')
    expect(assertions[0].message).toContain('Changed fields:')
    expect(assertions[0].message).toContain('executionId:')
    expect(assertions[0].message).toContain('- Expected: "execution-1757653509569"')
    expect(assertions[0].message).toContain('+ Actual:   "execution-1757654166290"')
  })

  it('should format state output mismatch with diff', () => {
    const testCase: TestCase = {
      name: 'Test state diff',
      input: {},
      stateExpectations: [
        {
          state: 'TestState',
          output: {
            status: 'pending',
            count: 10,
          },
        },
      ],
    }

    const result: ExecutionResult = {
      output: {},
      executionPath: ['TestState'],
      success: true,
      stateExecutions: [
        {
          state: 'TestState',
          statePath: ['TestState'],
          input: {},
          output: {
            status: 'completed',
            count: 15,
          },
        },
      ],
    }

    const assertions = TestAssertions.performAssertions(testCase, result)

    const outputAssertion = assertions.find((a) => a.message?.includes('output mismatch'))
    expect(outputAssertion).toBeDefined()
    expect(outputAssertion?.passed).toBe(false)
    expect(outputAssertion?.message).toContain('State TestState output mismatch:')
    expect(outputAssertion?.message).toContain('Changed fields:')
    expect(outputAssertion?.message).toContain('status:')
    expect(outputAssertion?.message).toContain('- Expected: "pending"')
    expect(outputAssertion?.message).toContain('+ Actual:   "completed"')
  })

  it('should format variable mismatch with diff', () => {
    const testCase: TestCase = {
      name: 'Test variable diff',
      input: {},
      stateExpectations: [
        {
          state: 'TestState',
          variables: {
            complexVar: {
              nested: {
                value: 'old',
                count: 5,
              },
            },
          },
        },
      ],
    }

    const result: ExecutionResult = {
      output: {},
      executionPath: ['TestState'],
      success: true,
      stateExecutions: [
        {
          state: 'TestState',
          statePath: ['TestState'],
          input: {},
          output: {},
          variablesAfter: {
            complexVar: {
              nested: {
                value: 'new',
                count: 5,
              },
            },
          },
        },
      ],
    }

    const assertions = TestAssertions.performAssertions(testCase, result)

    const varAssertion = assertions.find((a) => a.message?.includes('variable complexVar'))
    expect(varAssertion).toBeDefined()
    expect(varAssertion?.passed).toBe(false)
    expect(varAssertion?.message).toContain('State TestState variable complexVar mismatch:')
    expect(varAssertion?.message).toContain('Changed fields:')
  })
})
