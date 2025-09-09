import { describe, expect, it } from 'vitest'
import { StateFactory, type StateMachine } from '../../types/asl'
import { PromptBuilder } from './prompt-builder'

describe('PromptBuilder - Lambda Integration Rules', () => {
  describe('getLambdaIntegrationRules', () => {
    it('should include rules for conditional mock input matching when Parameters.Payload exists', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine with Lambda task',
        StartAt: 'LambdaInvoke',
        States: {
          LambdaInvoke: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.input',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // プロンプトにLambda統合ルールが含まれることを確認
      expect(prompt).toContain('Lambda Integration Rules')

      // conditional mockの入力マッチングルールが含まれることを確認
      expect(prompt).toContain('input.Payload')
      expect(prompt).toContain('conditional')

      // Parameters.Payloadのマッピングルールが含まれることを確認
      expect(prompt).toContain('Parameters.Payload')
    })

    it('should include examples of correct conditional mock structure for Lambda', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine with Lambda task',
        StartAt: 'ProcessOrder',
        States: {
          ProcessOrder: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.orderData',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // 正しい例が含まれることを確認
      expect(prompt).toContain('when:')
      expect(prompt).toContain('input:')
      expect(prompt).toContain('Payload:')

      // レスポンス形式も確認
      expect(prompt).toContain('response:')
      expect(prompt).toContain('StatusCode')
    })

    it('should distinguish between optimized and direct Lambda ARN patterns', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine with mixed Lambda patterns',
        StartAt: 'OptimizedLambda',
        States: {
          OptimizedLambda: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.data',
            },
            Next: 'DirectLambda',
          },
          DirectLambda: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // 両方のパターンが説明されていることを確認
      expect(prompt).toContain('OPTIMIZED INTEGRATION')
      expect(prompt).toContain('arn:aws:states:::lambda:invoke')
      expect(prompt).toContain('DIRECT ARN')
      expect(prompt).toContain('arn:aws:lambda:')
    })

    it('should provide clear examples of conditional mock with multiple conditions', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine with complex Lambda conditions',
        StartAt: 'ValidateInput',
        States: {
          ValidateInput: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'action.$': '$.action',
                'userId.$': '$.userId',
                'amount.$': '$.amount',
              },
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // 複数条件の例が含まれることを確認
      expect(prompt).toContain('conditions:')
      expect(prompt).toContain('default:')

      // 各条件のPayloadラッピングが示されていることを確認
      const payloadMatches = prompt.match(/Payload:/g)
      expect(payloadMatches).toBeTruthy()
      expect(payloadMatches?.length).toBeGreaterThan(2) // 入力と出力の両方で複数回出現
    })

    it('should warn about common mistakes in Lambda mock configuration', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine',
        StartAt: 'GetUser',
        States: {
          GetUser: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.request',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // よくある間違いの警告が含まれることを確認
      expect(prompt).toContain('WRONG')
      expect(prompt).toContain('missing Payload')
      expect(prompt).toContain('CORRECT')
      expect(prompt).toContain('Required!')
    })
  })

  describe('integration with full prompt', () => {
    it('should generate proper prompt for Lambda-heavy state machine', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Lambda-heavy workflow',
        StartAt: 'ValidateInput',
        States: {
          ValidateInput: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'type.$': '$.type',
                'data.$': '$.data',
              },
            },
            Next: 'ProcessData',
          },
          ProcessData: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.validatedData',
            },
            Next: 'SaveResults',
          },
          SaveResults: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'results.$': '$.processedData',
                'metadata.$': '$.metadata',
              },
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // Lambda統合ルールが適切に含まれることを確認
      expect(prompt).toContain('Lambda Integration Rules')

      // 各Lambdaステートに対応するモック例が必要
      expect(prompt).toContain('ValidateInput')
      expect(prompt).toContain('ProcessData')
      expect(prompt).toContain('SaveResults')

      // YAML出力ルールも含まれることを確認
      expect(prompt).toContain('version: "1.0"')
    })
  })
})
