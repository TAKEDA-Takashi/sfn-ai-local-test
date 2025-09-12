import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type JsonObject, StateFactory } from '../../types/asl.js'
import { StateMachineExecutor } from './executor.js'

describe('Executor - Fixed ExecutionContext Values', () => {
  let executor: StateMachineExecutor

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Fixed ExecutionContext', () => {
    it('should use fixed default values for ExecutionContext', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'Pass',
        States: {
          Pass: {
            Type: 'Pass',
            Parameters: {
              'executionId.$': '$$.Execution.Id',
              'executionName.$': '$$.Execution.Name',
              'startTime.$': '$$.Execution.StartTime',
              'roleArn.$': '$$.Execution.RoleArn',
            },
            ResultPath: '$.context',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // 固定値の検証
      expect(result.output).toEqual({
        context: {
          executionId:
            'arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution',
          executionName: 'test-execution',
          startTime: '2024-01-01T00:00:00.000Z',
          roleArn: 'arn:aws:iam::123456789012:role/StepFunctionsRole',
        },
      })
    })

    it('should use proper ARN format for Execution.Id', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetId',
        States: {
          GetId: {
            Type: 'Pass',
            Parameters: {
              'executionId.$': '$$.Execution.Id',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // ARN形式の検証
      const output = result.output as JsonObject
      expect(output?.executionId).toMatch(
        /^arn:aws:states:[a-z\-0-9]+:\d{12}:execution:[^:]+:[^:]+$/,
      )
      expect(output?.executionId).toBe(
        'arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution',
      )
    })

    it('should maintain consistent values across multiple states', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'First',
        States: {
          First: {
            Type: 'Pass',
            Parameters: {
              'value.$': '$$.Execution.Name',
            },
            ResultPath: '$.first',
            Next: 'Second',
          },
          Second: {
            Type: 'Pass',
            Parameters: {
              'value.$': '$$.Execution.Name',
            },
            ResultPath: '$.second',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // 複数ステートで同じ値を返すことを確認
      const output = result.output as JsonObject
      const firstValue = (output?.first as JsonObject)?.value
      const secondValue = (output?.second as JsonObject)?.value
      expect(firstValue).toBe('test-execution')
      expect(secondValue).toBe('test-execution')
      expect(firstValue).toBe(secondValue)
    })

    it('should use fixed StartTime for reproducible tests', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetTime',
        States: {
          GetTime: {
            Type: 'Pass',
            Parameters: {
              'time.$': '$$.Execution.StartTime',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      // 複数回実行しても同じ時刻を返すことを確認
      executor = new StateMachineExecutor(stateMachine)
      const result1 = await executor.execute({})

      // 少し待機してから再実行
      await new Promise((resolve) => setTimeout(resolve, 10))

      const result2 = await executor.execute({})

      const output1 = result1.output as JsonObject
      const output2 = result2.output as JsonObject
      expect(output1?.time).toBe('2024-01-01T00:00:00.000Z')
      expect(output2?.time).toBe('2024-01-01T00:00:00.000Z')
      expect(output1?.time).toBe(output2?.time)
    })

    it('should provide Execution.Input as JSON object', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetInput',
        States: {
          GetInput: {
            Type: 'Pass',
            Parameters: {
              'execInput.$': '$$.Execution.Input',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      const input = { foo: 'bar', baz: 123 }
      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(input)

      const output = result.output as JsonObject
      expect(output?.execInput).toEqual(input)
    })

    it('should handle State.EnteredTime with fixed value', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetStateTime',
        States: {
          GetStateTime: {
            Type: 'Pass',
            Parameters: {
              'stateTime.$': '$$.State.EnteredTime',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // State.EnteredTimeも固定値であることを確認
      const output = result.output as JsonObject
      expect(output?.stateTime).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should provide State.Name correctly', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'MyState',
        States: {
          MyState: {
            Type: 'Pass',
            Parameters: {
              'stateName.$': '$$.State.Name',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // State.Nameは現在のステート名
      const output = result.output as JsonObject
      expect(output?.stateName).toBe('MyState')
    })

    it('should provide StateMachine.Name with default value', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetMachineName',
        States: {
          GetMachineName: {
            Type: 'Pass',
            Parameters: {
              'machineName.$': '$$.StateMachine.Name',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // デフォルトのステートマシン名
      const output = result.output as JsonObject
      expect(output?.machineName).toBe('StateMachine')
    })

    it('should provide StateMachine.Id with proper ARN format', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetMachineId',
        States: {
          GetMachineId: {
            Type: 'Pass',
            Parameters: {
              'machineId.$': '$$.StateMachine.Id',
            },
            ResultPath: '$',
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      // StateMachine.IdもARN形式
      const output = result.output as JsonObject
      expect(output?.machineId).toBe(
        'arn:aws:states:us-east-1:123456789012:stateMachine:StateMachine',
      )
    })
  })

  describe('JSONata mode ExecutionContext', () => {
    it('should provide fixed ExecutionContext in JSONata mode', async () => {
      const stateMachine = StateFactory.createStateMachine({
        QueryLanguage: 'JSONata' as const,
        StartAt: 'JSONataState',
        States: {
          JSONataState: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Output: `{% {
              "executionId": $states.context.Execution.Id,
              "executionName": $states.context.Execution.Name,
              "startTime": $states.context.Execution.StartTime,
              "roleArn": $states.context.Execution.RoleArn
            } %}`,
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      expect(result.output).toEqual({
        executionId: 'arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution',
        executionName: 'test-execution',
        startTime: '2024-01-01T00:00:00.000Z',
        roleArn: 'arn:aws:iam::123456789012:role/StepFunctionsRole',
      })
    })

    it('should provide State context in JSONata mode', async () => {
      const stateMachine = StateFactory.createStateMachine({
        QueryLanguage: 'JSONata' as const,
        StartAt: 'TestState',
        States: {
          TestState: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Output: `{% {
              "stateName": $states.context.State.Name,
              "stateTime": $states.context.State.EnteredTime
            } %}`,
            End: true,
          },
        },
      })

      executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute({})

      expect(result.output).toEqual({
        stateName: 'TestState',
        stateTime: '2024-01-01T00:00:00.000Z',
      })
    })
  })
})
