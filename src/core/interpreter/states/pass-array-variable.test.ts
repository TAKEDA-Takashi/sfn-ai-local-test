import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { StateMachineExecutor } from '../executor'

describe('Pass state with array variable references', () => {
  const mockEngine = {} as MockEngine

  it('should handle array variable references in Parameters', async () => {
    const stateMachine = StateFactory.createStateMachine({
      StartAt: 'SetupVariables',
      States: {
        SetupVariables: {
          Type: 'Pass',
          Assign: {
            items: [
              { name: 'first', value: 100 },
              { name: 'second', value: 200 },
            ],
            users: {
              list: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
              ],
            },
          },
          Next: 'ProcessData',
        },
        ProcessData: {
          Type: 'Pass',
          Parameters: {
            'firstItem.$': '$items[0].name',
            'secondValue.$': '$items[1].value',
            'firstUser.$': '$users.list[0].name',
          },
          End: true,
        },
      },
    })

    const executor = new StateMachineExecutor(stateMachine, mockEngine)
    const result = await executor.execute({})

    expect(result.output).toEqual({
      firstItem: 'first',
      secondValue: 200,
      firstUser: 'Alice',
    })
  })
})
