import { describe, expect, it } from 'vitest'
import type { ExecutionContextConfig } from '../../schemas/config-schema'
import { StateFactory } from '../../types/state-factory'
import { StateMachineExecutor } from './executor'

describe('Executor - ExecutionContext Configuration', () => {
  describe('Custom ExecutionContext values', () => {
    it('should use custom name from config', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetName',
        States: {
          GetName: {
            Type: 'Pass',
            Parameters: {
              'executionName.$': '$$.Execution.Name',
              'executionId.$': '$$.Execution.Id',
            },
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {
        name: 'custom-execution-name',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        executionName: 'custom-execution-name',
        executionId:
          'arn:aws:states:us-east-1:123456789012:execution:StateMachine:custom-execution-name',
      })
    })

    it('should use custom startTime from config', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetTime',
        States: {
          GetTime: {
            Type: 'Pass',
            Parameters: {
              'startTime.$': '$$.Execution.StartTime',
            },
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {
        startTime: '2025-06-15T14:30:00.000Z',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        startTime: '2025-06-15T14:30:00.000Z',
      })
    })

    it('should use custom roleArn from config', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetRole',
        States: {
          GetRole: {
            Type: 'Pass',
            Parameters: {
              'roleArn.$': '$$.Execution.RoleArn',
            },
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {
        roleArn: 'arn:aws:iam::999888777666:role/CustomRole',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        roleArn: 'arn:aws:iam::999888777666:role/CustomRole',
      })
    })

    it('should use custom accountId and region from config', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetContext',
        States: {
          GetContext: {
            Type: 'Pass',
            Parameters: {
              'executionId.$': '$$.Execution.Id',
              'stateMachineId.$': '$$.StateMachine.Id',
            },
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {
        accountId: '111222333444',
        region: 'eu-west-1',
        name: 'eu-execution',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        executionId: 'arn:aws:states:eu-west-1:111222333444:execution:StateMachine:eu-execution',
        stateMachineId: 'arn:aws:states:eu-west-1:111222333444:stateMachine:StateMachine',
      })
    })

    it('should combine multiple config values', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetAll',
        States: {
          GetAll: {
            Type: 'Pass',
            Parameters: {
              'name.$': '$$.Execution.Name',
              'startTime.$': '$$.Execution.StartTime',
              'roleArn.$': '$$.Execution.RoleArn',
              'executionId.$': '$$.Execution.Id',
            },
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {
        name: 'full-config-test',
        startTime: '2025-12-25T00:00:00.000Z',
        roleArn: 'arn:aws:iam::555666777888:role/FullTestRole',
        accountId: '555666777888',
        region: 'ap-northeast-1',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        name: 'full-config-test',
        startTime: '2025-12-25T00:00:00.000Z',
        roleArn: 'arn:aws:iam::555666777888:role/FullTestRole',
        executionId:
          'arn:aws:states:ap-northeast-1:555666777888:execution:StateMachine:full-config-test',
      })
    })
  })

  describe('JSONata mode with config', () => {
    it('should use config values in JSONata expressions', async () => {
      const stateMachine = StateFactory.createStateMachine({
        QueryLanguage: 'JSONata',
        StartAt: 'JSONataState',
        States: {
          JSONataState: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Output: `{% {
              "executionName": $states.context.Execution.Name,
              "startTime": $states.context.Execution.StartTime,
              "accountFromId": $substringAfter($substringBefore($states.context.Execution.Id, ":execution"), "states:")
            } %}`,
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {
        name: 'jsonata-test',
        startTime: '2025-07-04T12:00:00.000Z',
        accountId: '987654321098',
        region: 'us-west-2',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        executionName: 'jsonata-test',
        startTime: '2025-07-04T12:00:00.000Z',
        accountFromId: 'us-west-2:987654321098',
      })
    })
  })

  describe('Partial configuration', () => {
    it('should use defaults for unspecified config values', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetContext',
        States: {
          GetContext: {
            Type: 'Pass',
            Parameters: {
              'name.$': '$$.Execution.Name',
              'startTime.$': '$$.Execution.StartTime',
              'roleArn.$': '$$.Execution.RoleArn',
            },
            End: true,
          },
        },
      })

      // Only specify name, use defaults for everything else
      const config: ExecutionContextConfig = {
        name: 'partial-config',
      }

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        name: 'partial-config',
        startTime: '2024-01-01T00:00:00.000Z', // default
        roleArn: 'arn:aws:iam::123456789012:role/StepFunctionsRole', // default
      })
    })

    it('should work with empty config (all defaults)', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetContext',
        States: {
          GetContext: {
            Type: 'Pass',
            Parameters: {
              'name.$': '$$.Execution.Name',
              'executionId.$': '$$.Execution.Id',
            },
            End: true,
          },
        },
      })

      const config: ExecutionContextConfig = {}

      const executor = new StateMachineExecutor(stateMachine)
      const result = await executor.execute(
        {},
        {
          executionContext: config,
        },
      )

      expect(result.output).toEqual({
        name: 'test-execution',
        executionId: 'arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution',
      })
    })
  })
})
