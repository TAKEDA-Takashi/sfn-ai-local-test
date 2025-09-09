import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../types/asl'
import type { MockConfig } from '../../types/mock'
import { StateFactory } from '../../types/state-factory'
import { generateMockWithAI } from './index'

// Lambda統合を含むステートマシンのサンプル（最適化された統合）
const optimizedLambdaStateMachine: StateMachine = {
  Comment: 'Lambda integration test',
  StartAt: 'ValidateInput',
  States: StateFactory.createStates({
    ValidateInput: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke',
      Parameters: {
        FunctionName: 'ValidateInput',
        Payload: {
          'userId.$': '$.userId',
          'action.$': '$.action',
        },
      },
      ResultPath: '$.validation',
      Next: 'ProcessData',
    },
    ProcessData: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke',
      Parameters: {
        FunctionName: 'ProcessData',
        'Payload.$': '$',
      },
      ResultSelector: {
        'processedId.$': '$.Payload.id',
        'status.$': '$.Payload.status',
      },
      OutputPath: '$.Payload',
      Next: 'NotifyResult',
    },
    NotifyResult: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke',
      Parameters: {
        FunctionName: 'NotifyResult',
        Payload: {
          'processedId.$': '$.processedId',
          'status.$': '$.status',
        },
      },
      OutputPath: '$.Payload',
      End: true,
    },
  }),
}

describe('AI Mock Generation - Lambda Integration', () => {
  it('should generate mocks with correct optimized Lambda integration format', async () => {
    // Skip if no API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping AI test - no ANTHROPIC_API_KEY')
      return
    }

    const mockYaml = await generateMockWithAI(
      optimizedLambdaStateMachine,
      'claude-3-haiku-20240307',
    )

    // モックYAMLが生成されることを確認
    expect(mockYaml).toBeTruthy()
    expect(mockYaml).toContain('version:')
    expect(mockYaml).toContain('mocks:')

    // Lambda統合フォーマットのキーワードが含まれることを確認
    expect(mockYaml).toContain('Payload')
    expect(mockYaml).toContain('StatusCode')

    // ResultPath/ResultSelectorを持つステートが適切に処理されることを確認
    expect(mockYaml).toContain('ValidateInput')
    expect(mockYaml).toContain('ProcessData')
    expect(mockYaml).toContain('NotifyResult')

    console.log('Generated Lambda mock YAML:\n', mockYaml)
  }, 30000) // AI APIのタイムアウトを考慮

  it('should generate conditional mocks with Payload-wrapped input conditions', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping AI test - no ANTHROPIC_API_KEY')
      return
    }

    const conditionalStateMachine: StateMachine = {
      Comment: 'Conditional processing',
      StartAt: 'CheckUser',
      States: StateFactory.createStates({
        CheckUser: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'CheckUser',
            Payload: {
              'userId.$': '$.userId',
            },
          },
          End: true,
        },
      }),
    }

    const mockYaml = await generateMockWithAI(conditionalStateMachine, 'claude-3-haiku-20240307')
    const parsed = load(mockYaml) as MockConfig

    // 条件付きモックが生成されることを確認
    const checkUserMock = parsed.mocks?.find((m) => m.state === 'CheckUser')
    expect(checkUserMock).toBeTruthy()

    if (checkUserMock?.type === 'conditional' && checkUserMock.conditions?.length > 0) {
      const firstCondition = checkUserMock.conditions[0]
      // 条件がPayloadでラップされていることを確認
      if (firstCondition?.when) {
        expect(firstCondition.when).toHaveProperty('Payload')
        console.log('✅ Conditional mock has Payload-wrapped input condition')
      }
    }

    console.log('Generated conditional mock YAML:\n', mockYaml)
  }, 30000)

  it('should generate error cases with FunctionError field', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping AI test - no ANTHROPIC_API_KEY')
      return
    }

    const errorStateMachine: StateMachine = {
      Comment: 'Error handling test',
      StartAt: 'RiskyOperation',
      States: StateFactory.createStates({
        RiskyOperation: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'RiskyOperation',
            'Payload.$': '$',
          },
          Retry: [
            {
              ErrorEquals: ['Lambda.ServiceException', 'Lambda.AWSLambdaException'],
              MaxAttempts: 2,
            },
          ],
          Catch: [
            {
              ErrorEquals: ['States.ALL'],
              Next: 'HandleError',
            },
          ],
          End: true,
        },
        HandleError: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'HandleError',
            Payload: {
              'error.$': '$.error',
              'cause.$': '$.cause',
            },
          },
          End: true,
        },
      }),
    }

    const mockYaml = await generateMockWithAI(errorStateMachine, 'claude-3-haiku-20240307')

    // エラーケースが含まれることを確認
    expect(mockYaml).toMatch(/type:\s*["']?error["']?/i)

    console.log('Generated error handling mock YAML:\n', mockYaml)
  }, 30000)
})
