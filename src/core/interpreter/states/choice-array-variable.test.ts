import { describe, expect, it } from 'vitest'
import type { ChoiceState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { ChoiceStateExecutor } from './choice'

describe('Choice state with array variable references', () => {
  const mockEngine = new MockEngine({ version: '1.0', mocks: [] })

  it('should evaluate array index access in variable paths', async () => {
    // Test simple array access
    const state1 = StateFactory.createState({
      Type: 'Choice',
      Choices: [
        {
          Variable: '$items[0].name',
          StringEquals: 'first',
          Next: 'FirstItem',
        },
      ],
      Default: 'DefaultState',
    }) as ChoiceState

    const executor1 = new ChoiceStateExecutor(state1, mockEngine)

    const context1 = {
      input: {},
      currentState: 'TestChoice',
      executionPath: [],
      variables: {
        items: [{ name: 'first' }, { name: 'second' }],
      },
      originalInput: {},
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }

    const result1 = await executor1.execute(context1)
    expect(result1.nextState).toBe('FirstItem')

    // Test nested array access
    const state2 = StateFactory.createState({
      Type: 'Choice',
      Choices: [
        {
          Variable: '$data.users[1].age',
          NumericGreaterThan: 18,
          Next: 'Adult',
        },
      ],
      Default: 'DefaultState',
    }) as ChoiceState

    const executor2 = new ChoiceStateExecutor(state2, mockEngine)

    const context2 = {
      input: {},
      currentState: 'TestChoice',
      executionPath: [],
      variables: {
        data: {
          users: [
            { name: 'Alice', age: 15 },
            { name: 'Bob', age: 25 },
          ],
        },
      },
      originalInput: {},
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }

    const result2 = await executor2.execute(context2)
    expect(result2.nextState).toBe('Adult')
  })

  it('should handle IsPresent with array variable paths', async () => {
    const state = StateFactory.createState({
      Type: 'Choice',
      Choices: [
        {
          Variable: '$items[0].optional',
          IsPresent: true,
          Next: 'HasOptional',
        },
        {
          Variable: '$items[0].required',
          IsPresent: true,
          Next: 'HasRequired',
        },
      ],
      Default: 'NoMatch',
    }) as ChoiceState

    const executor = new ChoiceStateExecutor(state, mockEngine)

    const context = {
      input: {},
      currentState: 'TestChoice',
      executionPath: [],
      variables: {
        items: [{ required: 'value' }],
      },
      originalInput: {},
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }

    const result = await executor.execute(context)
    expect(result.nextState).toBe('HasRequired')
  })

  it('should throw error when array index is out of bounds', async () => {
    const state = StateFactory.createState({
      Type: 'Choice',
      Choices: [
        {
          Variable: '$items[10].name',
          StringEquals: 'test',
          Next: 'NextState',
        },
      ],
      Default: 'DefaultState',
    }) as ChoiceState

    const executor = new ChoiceStateExecutor(state, mockEngine)

    const context = {
      input: {},
      currentState: 'TestChoice',
      executionPath: [],
      variables: {
        items: [{ name: 'first' }],
      },
      originalInput: {},
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }

    await expect(executor.execute(context)).rejects.toThrow(
      "Invalid path '$items[10].name': The choice state's condition path references an invalid value.",
    )
  })
})
