import { describe, expect, it } from 'vitest'
import type { DistributedMapState, ExecutionContext } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { DistributedMapStateExecutor } from './map'

describe('DistributedMapStateExecutor - Next State Handling', () => {
  it('should set nextState when Next field is specified', async () => {
    const stateMachineDefinition = {
      StartAt: 'PrepareDataSource',
      States: {
        PrepareDataSource: {
          Type: 'Pass',
          Result: {
            bucket: 'test-bucket',
            prefix: 'test-prefix/',
          },
          Next: 'ProcessLargeDataset',
        },
        ProcessLargeDataset: {
          Type: 'Map',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'ProcessBatch',
            States: {
              ProcessBatch: {
                Type: 'Pass',
                End: true,
              },
            },
          },
          ItemReader: {
            Resource: 'arn:aws:states:::s3:listObjectsV2',
            Parameters: {
              Bucket: 'test-bucket',
              Prefix: 'test-prefix/',
            },
          },
          ResultWriter: {
            Resource: 'arn:aws:states:::s3:putObject',
            Parameters: {
              Bucket: 'result-bucket',
              Prefix: 'results/',
            },
          },
          Next: 'SummarizeResults', // This should be set as nextState
        },
        SummarizeResults: {
          Type: 'Pass',
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const state = stateMachine.States.ProcessLargeDataset as DistributedMapState

    const mockEngine: Partial<MockEngine> = {
      getMockData: () => [{ Key: 'test-prefix/file1.json' }, { Key: 'test-prefix/file2.json' }],
      writeResults: async () => ({
        Bucket: 'result-bucket',
        Prefix: 'results/',
      }),
    }

    const executor = new DistributedMapStateExecutor(state, mockEngine as MockEngine, stateMachine)

    const context: ExecutionContext = {
      input: { bucket: 'test-bucket', prefix: 'test-prefix/' },
      currentState: 'ProcessLargeDataset',
      executionPath: ['PrepareDataSource'],
      variables: {},
    }

    const result = await executor.execute(context)

    // This test should pass after the fix
    expect(result.nextState).toBe('SummarizeResults')
    expect(result.success).toBe(true)
  })

  it('should not set nextState when End is true', async () => {
    const stateMachineDefinition = {
      StartAt: 'ProcessData',
      States: {
        ProcessData: {
          Type: 'Map',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'Process',
            States: {
              Process: {
                Type: 'Pass',
                End: true,
              },
            },
          },
          ItemReader: {
            Resource: 'arn:aws:states:::s3:listObjectsV2',
            Parameters: {
              Bucket: 'test-bucket',
            },
          },
          End: true, // No Next field
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineDefinition)
    const state = stateMachine.States.ProcessData as DistributedMapState

    const mockEngine: Partial<MockEngine> = {
      getMockData: () => [{ Key: 'file1.json' }],
    }

    const executor = new DistributedMapStateExecutor(state, mockEngine as MockEngine, stateMachine)

    const context: ExecutionContext = {
      input: {},
      currentState: 'ProcessData',
      executionPath: [],
      variables: {},
    }

    const result = await executor.execute(context)

    expect(result.nextState).toBeUndefined()
    expect(result.success).toBe(true)
  })
})
