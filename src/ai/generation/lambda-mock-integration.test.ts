import { describe, expect, it } from 'vitest'
import { StateFactory, type StateMachine } from '../../types/asl'
import { PromptBuilder } from './prompt-builder'

describe('Lambda Mock Integration Tests', () => {
  describe('Complex Lambda State Machine Scenarios', () => {
    it('should generate correct prompt for multiple Lambda tasks with Parameters.Payload', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Multi-step Lambda workflow',
        StartAt: 'ValidateRequest',
        States: {
          ValidateRequest: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'requestId.$': '$.requestId',
                'data.$': '$.inputData',
              },
            },
            ResultPath: '$.validation',
            Next: 'ProcessData',
          },
          ProcessData: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.validation.Payload',
            },
            ResultPath: '$.processed',
            Next: 'StoreResults',
          },
          StoreResults: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'processedData.$': '$.processed.Payload',
                'metadata.$': '$.metadata',
              },
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // Lambda統合ルールが含まれることを確認
      expect(prompt).toContain('Lambda Integration Rules')
      expect(prompt).toContain('OPTIMIZED INTEGRATION')
      expect(prompt).toContain('Parameters.Payload mapping rule')

      // 条件付きモックの構造例が含まれることを確認
      expect(prompt).toContain('conditional')
      expect(prompt).toContain('when:')
      expect(prompt).toContain('input:')
      expect(prompt).toContain('Payload:')

      // よくある間違いの警告が含まれることを確認
      expect(prompt).toContain('COMMON MISTAKES TO AVOID')
      expect(prompt).toContain('WRONG')
      expect(prompt).toContain('CORRECT')
    })

    it('should handle mixed Lambda patterns (optimized and direct ARN)', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Mixed Lambda patterns',
        StartAt: 'OptimizedTask',
        States: {
          OptimizedTask: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'input.$': '$.data',
              },
            },
            Next: 'DirectTask',
          },
          DirectTask: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
            Parameters: {
              'input.$': '$.data',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // 両方のパターンが説明されていることを確認
      expect(prompt).toContain('OPTIMIZED INTEGRATION')
      expect(prompt).toContain('DIRECT ARN')

      // 最適化された統合の説明
      expect(prompt).toContain('arn:aws:states:::lambda:invoke')
      expect(prompt).toContain('mock condition MUST use input.Payload')

      // 直接ARNの説明
      expect(prompt).toContain('arn:aws:lambda:region:account:function')
      expect(prompt).toContain('No Payload wrapper needed')
    })

    it('should provide comprehensive examples for conditional Lambda mocks', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Conditional processing workflow',
        StartAt: 'DetermineAction',
        States: {
          DetermineAction: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'action.$': '$.action',
                'params.$': '$.params',
              },
            },
            Next: 'RouteRequest',
          },
          RouteRequest: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.Payload.route',
                StringEquals: 'process',
                Next: 'ProcessRequest',
              },
              {
                Variable: '$.Payload.route',
                StringEquals: 'reject',
                Next: 'RejectRequest',
              },
            ],
            Default: 'HandleUnknown',
          },
          ProcessRequest: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.Payload.data',
            },
            End: true,
          },
          RejectRequest: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                'reason.$': '$.Payload.reason',
              },
            },
            End: true,
          },
          HandleUnknown: {
            Type: 'Fail',
            Error: 'UnknownRoute',
            Cause: 'Route not recognized',
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // 条件付きモックの包括的な例が含まれることを確認
      expect(prompt).toContain('conditional')
      expect(prompt).toContain('conditions:')
      expect(prompt).toContain('when:')
      expect(prompt).toContain('default:')

      // Payloadラッピングの例
      expect(prompt).toContain('input:')
      expect(prompt).toContain('Payload:')
      expect(prompt).toContain('response:')
      expect(prompt).toContain('StatusCode')
      expect(prompt).toContain('ExecutedVersion')

      // Choice状態との連携についての説明
      expect(prompt).toContain('DetermineAction')
      expect(prompt).toContain('ProcessRequest')
      expect(prompt).toContain('RejectRequest')
    })

    it('should emphasize Payload wrapper requirement for optimized Lambda integration', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Simple Lambda task',
        StartAt: 'SingleLambda',
        States: {
          SingleLambda: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.input',
            },
            ResultSelector: {
              'result.$': '$.Payload.output',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // Payloadラッパーの必要性が強調されていることを確認
      expect(prompt).toContain('REQUIRED for Lambda input matching')
      expect(prompt).toContain('REQUIRED for Lambda response')
      expect(prompt).toContain('mock condition MUST use input.Payload')

      // ResultSelectorの考慮についても言及
      expect(prompt).toContain('ResultSelector')
    })

    it('should handle Lambda tasks with complex Parameters structure', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Complex parameters Lambda workflow',
        StartAt: 'ComplexLambda',
        States: {
          ComplexLambda: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              Payload: {
                operation: 'process',
                'userId.$': '$.user.id',
                'timestamp.$': '$$.State.EnteredTime',
                config: {
                  'timeout.$': '$.settings.timeout',
                  retries: 3,
                },
                'items.$': '$.orderItems[*]',
              },
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // 複雑なParametersの扱いについて説明があることを確認
      expect(prompt).toContain('ComplexLambda')
      expect(prompt).toContain('Parameters')
      expect(prompt).toContain('Payload')

      // 条件付きモックでの複雑な入力マッチング例
      expect(prompt).toContain('conditional')
      expect(prompt).toContain('input:')
      expect(prompt).toContain('Payload:')
    })
  })

  describe('Error Handling in Lambda Mocks', () => {
    it('should include guidance for Lambda error scenarios', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Lambda with error handling',
        StartAt: 'RetryableLambda',
        States: {
          RetryableLambda: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              'Payload.$': '$.request',
            },
            Retry: [
              {
                ErrorEquals: ['Lambda.ServiceException', 'Lambda.AWSLambdaException'],
                IntervalSeconds: 2,
                MaxAttempts: 3,
                BackoffRate: 2.0,
              },
            ],
            Catch: [
              {
                ErrorEquals: ['States.ALL'],
                Next: 'HandleError',
              },
            ],
            Next: 'Success',
          },
          HandleError: {
            Type: 'Pass',
            Result: 'Error handled',
            End: true,
          },
          Success: {
            Type: 'Pass',
            Result: 'Success',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // エラーハンドリングについての言及があることを確認
      expect(prompt).toContain('Lambda')
      expect(prompt).toContain('RetryableLambda')

      // Lambda統合ルールが含まれることを確認
      expect(prompt).toContain('Lambda Integration Rules')
      expect(prompt).toContain('StatusCode')
    })
  })
})
