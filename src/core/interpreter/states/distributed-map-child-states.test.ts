import { beforeEach, describe, expect, it } from 'vitest'
import type { StateMachine } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { StateMachineExecutor } from '../executor'

describe('DistributedMap Child States Execution', () => {
  let mockEngine: MockEngine

  beforeEach(() => {
    const mockConfig = {
      version: '1.0' as const,
      name: 'test-mock',
      mocks: [],
    }
    mockEngine = new MockEngine(mockConfig)
  })

  it('should execute child states in DistributedMap ItemProcessor', async () => {
    // State machine similar to the failing Barbera case
    const stateMachine = StateFactory.createStateMachine({
      Comment: 'Test DistributedMap with child states',
      StartAt: 'ProcessItems',
      States: {
        ProcessItems: {
          Type: 'Map',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
              ExecutionType: 'STANDARD',
            },
            StartAt: 'RandomWait',
            States: {
              RandomWait: {
                Type: 'Wait',
                QueryLanguage: 'JSONata',
                Seconds: '{% $random() * 10 ~> $floor() %}',
                Next: 'ProcessItem',
              },
              ProcessItem: {
                Type: 'Task',
                QueryLanguage: 'JSONata',
                Resource: 'arn:aws:states:::states:startExecution.sync:2',
                Arguments: {
                  StateMachineArn:
                    'arn:aws:states:us-east-1:123456789012:stateMachine:ChildStateMachine',
                  Input: '{% { "itemId": $states.input.id } %}',
                },
                End: true,
              },
            },
          },
          ItemReader: {
            Resource: 'arn:aws:states:::s3:getObject',
            ReaderConfig: {
              InputType: 'JSONL',
            },
            Arguments: {
              Bucket: 'test-bucket',
              Key: 'test-data.jsonl',
            },
          },
          MaxConcurrency: 10,
          End: true,
        },
      },
    }) as StateMachine

    // Mock the ItemReader to return test items as inline data
    mockEngine.setMockOverrides([
      {
        state: 'ProcessItems',
        type: 'fixed',
        response: [
          { id: 'item1', name: 'Test Item 1' },
          { id: 'item2', name: 'Test Item 2' },
        ],
      },
      {
        state: 'RandomWait',
        type: 'fixed',
        response: {},
      },
      {
        state: 'ProcessItem',
        type: 'fixed',
        response: {
          ExecutionArn:
            'arn:aws:states:us-east-1:123456789012:execution:ChildStateMachine:exec-test',
          StartDate: '2024-01-15T10:00:00.000Z',
        },
      },
    ])

    const executor = new StateMachineExecutor(stateMachine, mockEngine)

    const result = await executor.execute({})

    // Should successfully execute the entire state machine
    expect(result.success).toBe(true)

    // Should include execution paths for child states
    const executionPath = result.executionPath
    expect(executionPath).toContain('ProcessItems')

    // THIS IS THE FAILING PART: Child states should be included in execution path
    expect(executionPath).toContain('RandomWait')
    expect(executionPath).toContain('ProcessItem')
  })
})
