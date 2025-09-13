import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/asl'
import { MockEngine } from '../mock/engine'
import { StateMachineExecutor } from './executor'

describe('Pass State JSONata - Default Value Handling', () => {
  describe('Default values with conditional expressions', () => {
    it('should use current date when date field is not provided', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'NormalizeInput',
        States: {
          NormalizeInput: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              // 現在の年月を生成する汎用的なパターン
              reportMonth: `{% 
                $states.context.Execution.Input.report_month 
                ? $states.context.Execution.Input.report_month 
                : $substring($now(), 0, 7)
              %}`,
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // report_month が指定されていない場合
      const result = await executor.execute({})

      // 固定値（2024-01-01T00:00:00.000Z）から年月形式（YYYY-MM）になることを確認
      expect(result.variables?.reportMonth).toMatch(/^\d{4}-\d{2}$/)

      // $now()は固定値を返すため、'2024-01'になることを確認
      // ADR-001: ExecutionContext固定値化により、$now()は'2024-01-01T00:00:00.000Z'を返す
      expect(result.variables?.reportMonth).toBe('2024-01')
    })

    it('should use provided date when specified', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'NormalizeInput',
        States: {
          NormalizeInput: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              reportMonth: `{% 
                $states.context.Execution.Input.report_month 
                ? $states.context.Execution.Input.report_month 
                : $substring($now(), 0, 7)
              %}`,
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // report_month が指定されている場合
      const result = await executor.execute({
        report_month: '2024-03',
      })

      expect(result.variables?.reportMonth).toBe('2024-03')
    })

    it('should handle array default values', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'NormalizeInput',
        States: {
          NormalizeInput: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              targetList: `{% 
                $states.context.Execution.Input.target_list 
                ? $states.context.Execution.Input.target_list 
                : []
              %}`,
              enableFlag: `{% 
                $exists($states.context.Execution.Input.enable_flag)
                ? $states.context.Execution.Input.enable_flag 
                : true
              %}`,
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // デフォルト値が使用される場合
      const result1 = await executor.execute({})
      expect(result1.variables?.targetList).toEqual([])
      expect(result1.variables?.enableFlag).toBe(true)

      // 値が提供される場合
      const result2 = await executor.execute({
        target_list: ['item1', 'item2'],
        enable_flag: false,
      })
      expect(result2.variables?.targetList).toEqual(['item1', 'item2'])
      expect(result2.variables?.enableFlag).toBe(false)
    })

    it('should handle complex conditional logic for defaults', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessInput',
        States: {
          ProcessInput: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              // 複数の条件でデフォルト値を決定
              priority: `{% 
                $states.context.Execution.Input.priority 
                ? $states.context.Execution.Input.priority 
                : ($states.context.Execution.Input.urgent = true ? "high" : "normal")
              %}`,
              // 配列の長さによってフラグを設定
              hasMultipleTargets: `{% 
                $count($states.context.Execution.Input.targets) > 1
              %}`,
              // 存在チェックとデフォルト値
              maxRetries: `{% 
                $exists($states.context.Execution.Input.max_retries) 
                ? $states.context.Execution.Input.max_retries 
                : 3
              %}`,
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // urgentフラグによるデフォルト優先度
      const result1 = await executor.execute({
        urgent: true,
        targets: ['target1', 'target2', 'target3'],
      })
      expect(result1.variables?.priority).toBe('high')
      expect(result1.variables?.hasMultipleTargets).toBe(true)
      expect(result1.variables?.maxRetries).toBe(3)

      // 明示的に指定された値
      const result2 = await executor.execute({
        priority: 'low',
        targets: ['single-target'],
        max_retries: 5,
      })
      expect(result2.variables?.priority).toBe('low')
      expect(result2.variables?.hasMultipleTargets).toBe(false)
      expect(result2.variables?.maxRetries).toBe(5)
    })

    it('should handle missing nested fields gracefully', async () => {
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'SafeAccess',
        States: {
          SafeAccess: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              // ネストしたフィールドの安全なアクセス
              userName: `{% 
                $states.context.Execution.Input.user.name 
                ? $states.context.Execution.Input.user.name 
                : "anonymous"
              %}`,
              // 配列要素の安全なアクセス
              firstItem: `{% 
                $states.context.Execution.Input.items[0] 
                ? $states.context.Execution.Input.items[0] 
                : null
              %}`,
              // オプショナルな設定値
              timeout: `{% 
                $states.context.Execution.Input.config.timeout 
                ? $states.context.Execution.Input.config.timeout 
                : 30000
              %}`,
            },
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // 全てのフィールドが欠落している場合
      const result = await executor.execute({})

      expect(result.variables?.userName).toBe('anonymous')
      expect(result.variables?.firstItem).toBe(null)
      expect(result.variables?.timeout).toBe(30000)
    })
  })
})
