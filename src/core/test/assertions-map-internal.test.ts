import { describe, expect, it } from 'vitest'
import type { TestCase } from '../../schemas/test-schema'
import type { ExecutionResult } from '../interpreter/executor'
import { TestAssertions } from './assertions'

describe('TestAssertions - Map/Parallel Internal State Tracking', () => {
  it('should find Map internal state executions by direct name', () => {
    const testCase: TestCase = {
      name: 'Map internal state test',
      input: {},
      stateExpectations: [
        {
          state: 'ItemProcessor',
          output: { processed: true },
        },
      ],
    }

    const executionResult: ExecutionResult = {
      output: [{ processed: true }],
      executionPath: ['MapState'],
      stateExecutions: [
        {
          statePath: ['MapState', '0', 'ItemProcessor'],
          state: 'ItemProcessor',
          input: {},
          output: { processed: true },
          variablesBefore: {},
          variablesAfter: {},
        },
      ],
      success: true,
    }

    const assertions = TestAssertions.performAssertions(testCase, executionResult)
    const stateAssertion = assertions.find((a) => a.type === 'state')

    expect(stateAssertion).toBeDefined()
    expect(stateAssertion?.passed).toBe(true)
    expect(stateAssertion?.message).toContain('output matches expectation')
  })

  it('should find nested Map state executions by direct name', () => {
    const testCase: TestCase = {
      name: 'Nested Map state test',
      input: {},
      stateExpectations: [
        {
          state: 'ProcessItem',
          output: { done: true },
        },
      ],
    }

    const executionResult: ExecutionResult = {
      output: [[{ done: true }]],
      executionPath: ['OuterMap'],
      stateExecutions: [
        {
          statePath: ['OuterMap', '0', 'InnerMap', '0', 'ProcessItem'],
          state: 'ProcessItem',
          input: {},
          output: { done: true },
          variablesBefore: {},
          variablesAfter: {},
        },
      ],
      success: true,
    }

    const assertions = TestAssertions.performAssertions(testCase, executionResult)
    const stateAssertion = assertions.find((a) => a.type === 'state')

    expect(stateAssertion).toBeDefined()
    expect(stateAssertion?.passed).toBe(true)
  })

  it('should report error when Map internal state not found', () => {
    const testCase: TestCase = {
      name: 'Missing Map internal state',
      input: {},
      stateExpectations: [
        {
          state: 'MissingState',
          output: { expected: true },
        },
      ],
    }

    const executionResult: ExecutionResult = {
      output: [],
      executionPath: ['MapState'],
      stateExecutions: [
        {
          statePath: ['MapState'],
          state: 'MapState',
          input: {},
          output: [],
          variablesBefore: {},
          variablesAfter: {},
        },
      ],
      success: true,
    }

    const assertions = TestAssertions.performAssertions(testCase, executionResult)
    const stateAssertion = assertions.find((a) => a.type === 'state')

    expect(stateAssertion).toBeDefined()
    expect(stateAssertion?.passed).toBe(false)
    expect(stateAssertion?.message).toContain('State execution not found for: MissingState')
  })

  it('should find Parallel branch state executions by direct name', () => {
    const testCase: TestCase = {
      name: 'Parallel branch state test',
      input: {},
      stateExpectations: [
        {
          state: 'BranchTask',
          output: { branch: 0 },
        },
      ],
    }

    const executionResult: ExecutionResult = {
      output: [{ branch: 0 }, { branch: 1 }],
      executionPath: ['ParallelState'],
      stateExecutions: [
        {
          statePath: ['ParallelState', '0', 'BranchTask'],
          state: 'BranchTask',
          input: {},
          output: { branch: 0 },
          variablesBefore: {},
          variablesAfter: {},
        },
      ],
      success: true,
    }

    const assertions = TestAssertions.performAssertions(testCase, executionResult)
    const stateAssertions = assertions.filter((a) => a.type === 'state')

    expect(stateAssertions).toHaveLength(1)
    expect(stateAssertions[0]?.passed).toBe(true)
  })

  it('should find different named states in Parallel branches', () => {
    const testCase: TestCase = {
      name: 'Parallel branch state without index',
      input: {},
      stateExpectations: [
        {
          state: 'FirstBranchTask',
          output: { data: 'first' },
        },
        {
          state: 'SecondBranchTask',
          output: { data: 'second' },
        },
      ],
    }

    const executionResult: ExecutionResult = {
      output: [{ data: 'first' }, { data: 'second' }],
      executionPath: ['ParallelState'],
      stateExecutions: [
        {
          statePath: ['ParallelState', '0', 'FirstBranchTask'],
          state: 'FirstBranchTask',
          input: {},
          output: { data: 'first' },
          variablesBefore: {},
          variablesAfter: {},
        },
        {
          statePath: ['ParallelState', '1', 'SecondBranchTask'],
          state: 'SecondBranchTask',
          input: {},
          output: { data: 'second' },
          variablesBefore: {},
          variablesAfter: {},
        },
      ],
      success: true,
    }

    const assertions = TestAssertions.performAssertions(testCase, executionResult)
    const stateAssertions = assertions.filter((a) => a.type === 'state')

    expect(stateAssertions).toHaveLength(2)
    expect(stateAssertions[0]?.passed).toBe(true)
    expect(stateAssertions[1]?.passed).toBe(true)
  })
})
