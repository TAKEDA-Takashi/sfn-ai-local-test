import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/asl'
import { MockEngine } from '../mock/engine'
import { StateMachineExecutor } from './executor'

describe('StateMachineExecutor - JSONata Execution Context', () => {
  describe('Execution.Input field in JSONata expressions', () => {
    it('should provide Execution.Input in context for JSONata Pass state with Assign', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessInput',
        States: {
          ProcessInput: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              accountId: '{% $states.context.Execution.Input.aws_account_id %}',
              billingMonth: '{% $states.context.Execution.Input.billing_month %}',
              originalInput: '{% $states.context.Execution.Input %}',
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      const input = {
        aws_account_id: '123456789012',
        billing_month: '2024-01',
        other_data: 'test',
      }

      const result = await executor.execute(input)

      // Execution.Input が正しく参照できることを確認
      expect(result.variables?.accountId).toBe('123456789012')
      expect(result.variables?.billingMonth).toBe('2024-01')
      expect(result.variables?.originalInput).toEqual(input)
    })

    it('should provide Execution metadata fields in JSONata context', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'GetMetadata',
        States: {
          GetMetadata: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              executionId: '{% $states.context.Execution.Id %}',
              executionName: '{% $states.context.Execution.Name %}',
              executionStartTime: '{% $states.context.Execution.StartTime %}',
              executionRoleArn: '{% $states.context.Execution.RoleArn %}',
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      const result = await executor.execute({ test: 'data' })

      // Execution メタデータが存在することを確認（固定値）
      expect(result.variables?.executionId).toBe(
        'arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution',
      )
      expect(result.variables?.executionName).toBe('test-execution')
      expect(result.variables?.executionStartTime).toBe('2024-01-01T00:00:00.000Z')
      expect(result.variables?.executionRoleArn).toBe(
        'arn:aws:iam::123456789012:role/StepFunctionsRole',
      )
    })

    it('should handle nested field access in Execution.Input', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'ExtractNestedData',
        States: {
          ExtractNestedData: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              userId: '{% $states.context.Execution.Input.user.id %}',
              userName: '{% $states.context.Execution.Input.user.name %}',
              items: '{% $states.context.Execution.Input.order.items %}',
              totalAmount: '{% $sum($states.context.Execution.Input.order.items.price) %}',
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      const input = {
        user: {
          id: 'user-123',
          name: 'John Doe',
        },
        order: {
          items: [
            { id: 1, price: 100 },
            { id: 2, price: 200 },
            { id: 3, price: 300 },
          ],
        },
      }

      const result = await executor.execute(input)

      expect(result.variables?.userId).toBe('user-123')
      expect(result.variables?.userName).toBe('John Doe')
      expect(result.variables?.items).toEqual(input.order.items)
      expect(result.variables?.totalAmount).toBe(600)
    })

    it('should preserve Execution.Input across multiple states', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'FirstState',
        States: {
          FirstState: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              firstValue: '{% $states.context.Execution.Input.value1 %}',
            },
            Output: '{% { "modified": "data" } %}',
            Next: 'SecondState',
          },
          SecondState: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              // Execution.Input は変更されずに保持される
              secondValue: '{% $states.context.Execution.Input.value2 %}',
              // 前のステートの出力
              previousOutput: '{% $states.input.modified %}',
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      const input = {
        value1: 'first',
        value2: 'second',
      }

      const result = await executor.execute(input)

      expect(result.variables?.firstValue).toBe('first')
      expect(result.variables?.secondValue).toBe('second')
      expect(result.variables?.previousOutput).toBe('data')
    })

    it('should handle array operations on Execution.Input', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessArray',
        States: {
          ProcessArray: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              accountCount: '{% $count($states.context.Execution.Input.target_accounts) %}',
              firstAccount: '{% $states.context.Execution.Input.target_accounts[0] %}',
              hasAccounts: '{% $count($states.context.Execution.Input.target_accounts) > 0 %}',
              accountList: '{% $states.context.Execution.Input.target_accounts %}',
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      const input = {
        target_accounts: ['123456789012', '987654321098', '111111111111'],
      }

      const result = await executor.execute(input)

      expect(result.variables?.accountCount).toBe(3)
      expect(result.variables?.firstAccount).toBe('123456789012')
      expect(result.variables?.hasAccounts).toBe(true)
      expect(result.variables?.accountList).toEqual(input.target_accounts)
    })

    it('should handle default values when Execution.Input fields are missing', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'HandleDefaults',
        States: {
          HandleDefaults: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              // JSONata の条件式で デフォルト値を設定
              billingMonth:
                '{% $states.context.Execution.Input.billing_month ? $states.context.Execution.Input.billing_month : $now() %}',
              targetAccounts:
                '{% $states.context.Execution.Input.target_accounts ? $states.context.Execution.Input.target_accounts : [] %}',
              sendmail:
                '{% $exists($states.context.Execution.Input.sendmail) ? $states.context.Execution.Input.sendmail : true %}',
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // 一部のフィールドのみ提供
      const input = {
        billing_month: '2024-01',
      }

      const result = await executor.execute(input)

      expect(result.variables?.billingMonth).toBe('2024-01')
      expect(result.variables?.targetAccounts).toEqual([])
      expect(result.variables?.sendmail).toBe(true)
    })
  })
})
