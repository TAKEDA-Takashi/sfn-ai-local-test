import type { State, StateMachine } from '../../../types/asl'
import type {
  ChoiceCompatibilityInfo,
  ChoiceDependency,
  PassVariableFlow,
} from '../data-flow-analyzer'
import { DataFlowHelpers } from './data-flow-helpers'

export class PassVariableAnalyzer {
  private stateMachine: StateMachine

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine
  }

  /**
   * Pass状態での変数フローを分析
   */
  analyzePassVariableFlows(choiceDependencies: ChoiceDependency[]): PassVariableFlow[] {
    const flows: PassVariableFlow[] = []
    const states = this.stateMachine.States || {}

    for (const [stateName, state] of Object.entries(states)) {
      if (!state.isPass()) continue

      const flow = this.analyzePassState(stateName, state, choiceDependencies)
      if (flow) {
        flows.push(flow)
      }
    }

    return flows
  }

  /**
   * 個別のPass状態を詳細分析
   */
  private analyzePassState(
    stateName: string,
    passState: State,
    choiceDependencies: ChoiceDependency[],
  ): PassVariableFlow | null {
    const isJSONata = passState.isJSONataState()

    let inputPath: string | undefined
    const variables: Record<string, string> = {}
    let outputPath: string | undefined
    const producedFields: string[] = []

    if (isJSONata) {
      if (passState.Assign) {
        for (const [key, value] of Object.entries(passState.Assign)) {
          variables[key] = typeof value === 'string' ? value : JSON.stringify(value)
        }
        producedFields.push(...Object.keys(passState.Assign))
      }

      if (passState.isJSONataState()) {
        if ('Output' in passState && passState.Output && typeof passState.Output === 'string') {
          outputPath = passState.Output
          const outputFields = this.extractOutputFields(passState.Output, true)
          producedFields.push(...outputFields)
        }
      }
    } else {
      if (passState.isJSONPathState()) {
        if ('InputPath' in passState) {
          inputPath = passState.InputPath
        }

        if ('Parameters' in passState && passState.Parameters) {
          const paramFields = Object.keys(passState.Parameters)
          producedFields.push(...paramFields)
          for (const [key, value] of Object.entries(passState.Parameters)) {
            if (typeof value === 'string') {
              variables[key] = value
            }
          }
        }

        if ('ResultSelector' in passState && passState.ResultSelector) {
          const selectorFields = Object.keys(passState.ResultSelector)
          producedFields.push(...selectorFields)
        }

        if ('OutputPath' in passState) {
          outputPath = passState.OutputPath
        }
      }
    }

    const choiceCompatibility = this.analyzeChoiceCompatibility(
      stateName,
      producedFields,
      choiceDependencies,
    )

    return {
      passStateName: stateName,
      inputPath,
      variables,
      outputPath,
      producedFields,
      choiceCompatibility,
    }
  }

  /**
   * Output式から生成されるフィールドを抽出
   */
  private extractOutputFields(output: string, isJSONata: boolean): string[] {
    const fields: string[] = []

    if (isJSONata) {
      // 一般的なパターン：{ "field1": $variable, "field2": $states.input.value }
      const objectPattern = /["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s*:/g
      let match = objectPattern.exec(output)
      while (match !== null) {
        if (match[1]) {
          fields.push(match[1])
        }
        match = objectPattern.exec(output)
      }
    } else {
      // JSONPathでのOutput処理（通常は単純な参照）
      // 複雑な場合は分析困難なので基本パターンのみ
      if (output === '$') {
        fields.push('_entire_input') // 入力全体を出力
      }
    }

    return fields
  }

  /**
   * Pass状態とChoice状態の互換性を分析
   */
  private analyzeChoiceCompatibility(
    _passStateName: string,
    producedFields: string[],
    choiceDependencies: ChoiceDependency[],
  ): ChoiceCompatibilityInfo {
    const compatibleChoiceStates: string[] = []
    const missingFields: string[] = []
    const recommendedChanges: string[] = []

    for (const choiceDep of choiceDependencies) {
      let isCompatible = true
      const missingInThisChoice: string[] = []

      for (const requiredField of choiceDep.requiredFields) {
        if (!producedFields.includes(requiredField)) {
          missingInThisChoice.push(requiredField)
          isCompatible = false
        }
      }

      if (isCompatible) {
        compatibleChoiceStates.push(choiceDep.choiceStateName)
      } else {
        missingFields.push(...missingInThisChoice)

        for (const missingField of missingInThisChoice) {
          const fieldType = choiceDep.fieldTypes[missingField] || 'any'
          const sampleValue = DataFlowHelpers.generateSampleValueForFieldType(
            missingField,
            fieldType,
          )

          recommendedChanges.push(
            `Add variable "${missingField}": ${JSON.stringify(sampleValue)} for Choice ${choiceDep.choiceStateName}`,
          )
        }
      }
    }

    return {
      compatibleChoiceStates,
      missingFields: [...new Set(missingFields)],
      recommendedChanges,
    }
  }
}
