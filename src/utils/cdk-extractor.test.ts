import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import type { JsonObject } from '../types/asl'
import { extractStateMachineFromCDK } from './cdk-extractor'

function makeCdkTemplate(
  ...stateMachines: { logicalId: string; definition: unknown }[]
): JsonObject {
  const resources: Record<string, unknown> = {}
  for (const sm of stateMachines) {
    resources[sm.logicalId] = {
      Type: 'AWS::StepFunctions::StateMachine',
      Properties: {
        Definition: sm.definition,
      },
    }
  }
  return { Resources: resources } as JsonObject
}

function makeCdkTemplateWithString(logicalId: string, definition: object): JsonObject {
  return {
    Resources: {
      [logicalId]: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          DefinitionString: JSON.stringify(definition),
        },
      },
    },
  } as JsonObject
}

const sampleDefinition = {
  StartAt: 'Hello',
  States: { Hello: { Type: 'Pass', End: true } },
}

const sampleDefinition2 = {
  StartAt: 'World',
  States: { World: { Type: 'Pass', End: true } },
}

describe('extractStateMachineFromCDK', () => {
  let consoleSpy: MockInstance

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('後方互換（オプションなし）', () => {
    it('SM1つの場合、最初の1つを返す', () => {
      const template = makeCdkTemplate({ logicalId: 'MySM', definition: sampleDefinition })
      const result = extractStateMachineFromCDK(template)
      expect(result).toEqual(sampleDefinition)
    })

    it('SM0個の場合、エラーをthrowする', () => {
      const template = { Resources: {} } as JsonObject
      expect(() => extractStateMachineFromCDK(template)).toThrow(
        'No Step Functions state machine found in CDK template',
      )
    })
  })

  describe('SM1つ - 自動選択', () => {
    it('オプション指定ありでもSM1つなら自動選択で返す', () => {
      const template = makeCdkTemplate({ logicalId: 'MySM', definition: sampleDefinition })
      const result = extractStateMachineFromCDK(template, {})
      expect(result).toEqual(sampleDefinition)
    })

    it('verbose: trueの場合、console.logに自動選択メッセージを出力する', () => {
      const template = makeCdkTemplate({ logicalId: 'MySM', definition: sampleDefinition })
      extractStateMachineFromCDK(template, { verbose: true })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-selected state machine: MySM'),
      )
    })

    it('verbose: falseの場合、console.logを出力しない', () => {
      const template = makeCdkTemplate({ logicalId: 'MySM', definition: sampleDefinition })
      extractStateMachineFromCDK(template, { verbose: false })
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('verboseなし（デフォルト）の場合、console.logを出力しない', () => {
      const template = makeCdkTemplate({ logicalId: 'MySM', definition: sampleDefinition })
      extractStateMachineFromCDK(template, {})
      expect(consoleSpy).not.toHaveBeenCalled()
    })
  })

  describe('名前指定', () => {
    it('指定した名前のSMを返す', () => {
      const template = makeCdkTemplate(
        { logicalId: 'SM1', definition: sampleDefinition },
        { logicalId: 'SM2', definition: sampleDefinition2 },
      )
      const result = extractStateMachineFromCDK(template, { stateMachineName: 'SM2' })
      expect(result).toEqual(sampleDefinition2)
    })

    it('存在しない名前を指定した場合、Available表示付きでエラーをthrowする', () => {
      const template = makeCdkTemplate(
        { logicalId: 'SM1', definition: sampleDefinition },
        { logicalId: 'SM2', definition: sampleDefinition2 },
      )
      expect(() =>
        extractStateMachineFromCDK(template, { stateMachineName: 'NonExistent' }),
      ).toThrow(/State machine 'NonExistent' not found.*Available:.*SM1.*SM2/)
    })
  })

  describe('SM複数（名前指定なし）', () => {
    it('エラーをthrowし、利用可能な名前を表示する', () => {
      const template = makeCdkTemplate(
        { logicalId: 'SM1', definition: sampleDefinition },
        { logicalId: 'SM2', definition: sampleDefinition2 },
      )
      expect(() => extractStateMachineFromCDK(template, {})).toThrow(
        /Multiple state machines found.*--cdk-state-machine.*Available:.*SM1.*SM2/s,
      )
    })
  })

  describe('Definition形式', () => {
    it('DefinitionString（文字列）の場合、JSON.parseして返す', () => {
      const template = makeCdkTemplateWithString('MySM', sampleDefinition)
      const result = extractStateMachineFromCDK(template)
      expect(result).toEqual(sampleDefinition)
    })

    it('Definition（オブジェクト）の場合、そのまま返す', () => {
      const template = makeCdkTemplate({ logicalId: 'MySM', definition: sampleDefinition })
      const result = extractStateMachineFromCDK(template)
      expect(result).toEqual(sampleDefinition)
    })

    it('DefinitionもDefinitionStringもない場合、エラーをthrowする', () => {
      const template = {
        Resources: {
          MySM: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {},
          },
        },
      } as unknown as JsonObject
      expect(() => extractStateMachineFromCDK(template)).toThrow(
        "Invalid state machine definition in resource 'MySM'",
      )
    })
  })

  describe('SM0個', () => {
    it('Resourcesが空の場合、エラーをthrowする', () => {
      const template = { Resources: {} } as JsonObject
      expect(() => extractStateMachineFromCDK(template, {})).toThrow(
        'No Step Functions state machine found in CDK template',
      )
    })

    it('Resourcesにステートマシン以外しかない場合、エラーをthrowする', () => {
      const template = {
        Resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
        },
      } as JsonObject
      expect(() => extractStateMachineFromCDK(template)).toThrow(
        'No Step Functions state machine found in CDK template',
      )
    })
  })
})
