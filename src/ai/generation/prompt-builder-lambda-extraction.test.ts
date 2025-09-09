import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/state-factory'
import { PromptBuilder } from './prompt-builder'

describe('PromptBuilder - Lambda Payload Extraction Integration', () => {
  const promptBuilder = new PromptBuilder()

  describe('JSONPath ResultSelector Payload Extraction', () => {
    it('should include ResultSelector guidance when Lambda states extract from Payload', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test with ResultSelector Payload extraction',
        StartAt: 'GetUserInfo',
        States: {
          GetUserInfo: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'GetUserFunction',
              'Payload.$': '$',
            },
            ResultSelector: {
              'id.$': '$.Payload.id',
              'name.$': '$.Payload.name',
              'email.$': '$.Payload.email',
            },
            ResultPath: '$.user',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      // 出力変換ガイダンスが含まれることを確認
      expect(prompt).toContain('Output Transformation Detected')
      expect(prompt).toContain('ResultSelector')
      expect(prompt).toContain('extracts specific fields') // より具体的な文言に修正
      expect(prompt).toContain('TEST EXPECTATIONS MUST MATCH THE TRANSFORMED OUTPUT')
    })

    it('should not include Lambda extraction guidance for regular Lambda states', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test without Payload extraction',
        StartAt: 'RegularLambda',
        States: {
          RegularLambda: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'MyFunction',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      // 出力変換ガイダンスが含まれないことを確認（通常のLambdaなので変換なし）
      expect(prompt).not.toContain('Output Transformation Detected')
      expect(prompt).not.toContain('extracts specific fields from Payload')
    })
  })

  describe('JSONata Output Payload Extraction', () => {
    it('should include JSONata Output guidance when Lambda states extract full Payload', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test with JSONata Payload extraction',
        StartAt: 'BillingGetData',
        States: {
          BillingGetData: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'GetBillingData',
              Payload: '{% { "manifest": $manifest } %}',
            },
            Output: '{% $states.result.Payload %}',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      // JSONata出力変換ガイダンスが含まれることを確認
      expect(prompt).toContain('Output Transformation Detected')
      expect(prompt).toContain('JSONata Output')
      expect(prompt).toContain('transforms and computes values') // 実際の文言に合わせる
      expect(prompt).toContain('TEST EXPECTATIONS MUST MATCH THE TRANSFORMED OUTPUT')
    })

    it('should include specific guidance for field extraction from Payload', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test with JSONata field extraction',
        StartAt: 'ProcessData',
        States: {
          ProcessData: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'test-function',
              Payload: '{% $states.input %}',
            },
            Output: '{% $states.result.Payload.data %}',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      expect(prompt).toContain('Output Transformation Detected')
      expect(prompt).toContain('transforms and computes values')
    })
  })

  describe('Mixed State Machine Cases', () => {
    it('should include guidance for multiple extraction patterns', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Mixed extraction patterns',
        StartAt: 'Step1',
        States: {
          Step1: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'function1',
              Payload: { test: 'data' },
            },
            ResultSelector: {
              'user.$': '$.Payload.user',
            },
            Next: 'Step2',
          },
          Step2: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'function2',
              Payload: '{% $states.input %}',
            },
            Output: '{% $states.result.Payload %}',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      // 両方のパターンに対応したガイダンスが含まれることを確認
      expect(prompt).toContain('Output Transformation Detected')
      expect(prompt).toContain('ResultSelector')
      expect(prompt).toContain('JSONata Output')
    })

    it('should provide detailed examples for correct test expectations', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Example for detailed guidance',
        StartAt: 'GetData',
        States: {
          GetData: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'getData',
              Payload: '{% $states.input %}',
            },
            Output: '{% $states.result.Payload %}',
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      // 出力変換の具体例が含まれることを確認
      expect(prompt).toContain('Output Transformation Detected')
      expect(prompt).toContain('TEST EXPECTATIONS MUST MATCH THE TRANSFORMED OUTPUT')
      expect(prompt).toContain('stateExpectations:')
    })
  })

  describe('Non-Lambda States', () => {
    it('should not include Lambda extraction guidance for S3/other services', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Non-Lambda services',
        StartAt: 'S3Task',
        States: {
          S3Task: {
            Type: 'Task',
            Resource: 'arn:aws:states:::aws-sdk:s3:putObject',
            Parameters: {
              Bucket: 'my-bucket',
              Key: 'file.json',
              Body: 'test',
            },
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildTestPrompt(stateMachine)

      expect(prompt).not.toContain('Output Transformation Detected')
    })
  })
})
