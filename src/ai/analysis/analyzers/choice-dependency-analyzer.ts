import type {
  ChoiceRule,
  ChoiceState,
  JsonObject,
  JsonValue,
  StateMachine,
} from '../../../types/asl'
import type {
  ChoiceBranch,
  ChoiceDependency,
  UpstreamStateRequirement,
} from '../data-flow-analyzer'
import { DataFlowHelpers } from './data-flow-helpers'

export class ChoiceDependencyAnalyzer {
  private stateMachine: StateMachine

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine
  }

  /**
   * Choice状態の依存関係を分析し、前段状態に対する要求を特定
   */
  analyzeChoiceDependencies(): ChoiceDependency[] {
    const dependencies: ChoiceDependency[] = []
    const states = this.stateMachine.States || {}

    for (const [stateName, state] of Object.entries(states)) {
      if (!state.isChoice()) continue

      // state.isChoice() is a type predicate, so state is now ChoiceState
      const dependency = this.analyzeChoiceState(stateName, state)
      if (dependency) {
        dependencies.push(dependency)
      }
    }

    return dependencies
  }

  /**
   * 個別のChoice状態を詳細分析
   */
  private analyzeChoiceState(stateName: string, choiceState: ChoiceState): ChoiceDependency | null {
    const requiredFields: string[] = []
    const fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'> =
      {}
    const branches: ChoiceBranch[] = []
    const isJSONata = choiceState.isJSONataState()

    // Choice分岐条件を分析
    for (const choice of choiceState.Choices) {
      const branchAnalysis = this.analyzeChoiceBranch(choice, isJSONata)
      if (branchAnalysis) {
        branches.push(branchAnalysis.branch)
        requiredFields.push(...branchAnalysis.requiredFields)
        Object.assign(fieldTypes, branchAnalysis.fieldTypes)
      }
    }

    // Default分岐も追加
    if (choiceState.Default) {
      branches.push({
        condition: 'Default (no conditions matched)',
        nextState: choiceState.Default,
        requiredInput: {},
        expectedVariables: {},
      })
    }

    if (requiredFields.length === 0) {
      return null // 分析対象なし
    }

    // 重複を除去
    const uniqueFields = [...new Set(requiredFields)]

    // 前段状態への要求を生成
    const upstreamRequirements: UpstreamStateRequirement[] = []

    // 汎用的な要求（任意の前段状態が対象）
    upstreamRequirements.push({
      targetStateName: '', // 空文字列は任意の前段状態を意味
      requiredOutputFields: uniqueFields,
      reason: `Required for Choice evaluation in ${stateName}`,
    })

    return {
      choiceStateName: stateName,
      requiredFields: uniqueFields,
      fieldTypes,
      upstreamRequirements,
      branches,
    }
  }

  /**
   * Choice分岐の詳細を分析
   */
  private analyzeChoiceBranch(
    choice: ChoiceRule,
    isJSONata: boolean,
  ): {
    branch: ChoiceBranch
    requiredFields: string[]
    fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'>
  } | null {
    if (!choice.Next) return null

    const requiredFields: string[] = []
    const fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'> =
      {}
    let conditionDescription = ''
    const requiredInput: JsonObject = {}

    if (isJSONata && 'Condition' in choice && !('Variable' in choice)) {
      // JSONataモード：Conditionフィールドを分析
      const condition = choice.Condition
      if (condition && typeof condition === 'string') {
        conditionDescription = `JSONata: ${condition}`

        // JSONata式から変数参照を抽出
        const vars = this.extractVariableReferencesFromJSONata(condition)
        for (const varRef of vars) {
          const fieldName = this.extractFieldNameFromReference(varRef)
          if (fieldName) {
            requiredFields.push(fieldName)
            fieldTypes[fieldName] = 'any'

            // サンプル入力値を生成
            requiredInput[fieldName] = this.generateSampleValueForCondition(condition, fieldName)
          }
        }
      }
    } else {
      // JSONPathモード：Variable + 比較演算子を分析
      const conditions = this.extractJSONPathConditions(choice)
      for (const cond of conditions) {
        requiredFields.push(cond.field)
        fieldTypes[cond.field] = cond.type
        conditionDescription += (conditionDescription ? ' AND ' : '') + cond.description
        requiredInput[cond.field] = cond.sampleValue
      }
    }

    return {
      branch: {
        condition: conditionDescription,
        nextState: choice.Next || '',
        requiredInput,
        expectedVariables: { ...requiredInput },
      },
      requiredFields,
      fieldTypes,
    }
  }

  /**
   * JSONataの条件式から変数参照を抽出
   */
  private extractVariableReferencesFromJSONata(condition: string): string[] {
    const references: string[] = []

    // $states.input.field パターン
    const statesInputPattern = /\$states\.input\.([a-zA-Z_][a-zA-Z0-9_]*)/g
    let match = statesInputPattern.exec(condition)
    while (match !== null) {
      references.push(`$states.input.${match[1]}`)
      match = statesInputPattern.exec(condition)
    }

    // $変数名 パターン
    const variablePattern = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g
    match = variablePattern.exec(condition)
    while (match !== null) {
      const varName = match[1]
      if (varName && !['states', 'context', 'task', 'map', 'now', 'uuid'].includes(varName)) {
        references.push(`$${varName}`)
      }
      match = variablePattern.exec(condition)
    }

    return [...new Set(references)]
  }

  /**
   * 変数参照からフィールド名を抽出
   */
  private extractFieldNameFromReference(reference: string): string | null {
    if (reference.startsWith('$states.input.')) {
      return reference.substring(14) // '$states.input.'.length
    }
    if (reference.startsWith('$')) {
      return reference.substring(1) // '$'.length
    }
    return null
  }

  /**
   * JSONPathモードの条件を分析
   */
  private extractJSONPathConditions(choice: ChoiceRule): Array<{
    field: string
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
    description: string
    sampleValue: JsonValue
  }> {
    const conditions: Array<{
      field: string
      type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
      description: string
      sampleValue: JsonValue
    }> = []

    // JSONPathChoiceRuleかどうかチェック
    if (!('Variable' in choice || 'And' in choice || 'Or' in choice || 'Not' in choice)) {
      return conditions
    }

    // Variable フィールドからフィールド名を抽出
    if (choice.Variable) {
      const field = DataFlowHelpers.extractFieldFromPath(choice.Variable)
      if (field) {
        // 比較演算子から型とサンプル値を決定
        if (choice.StringEquals !== undefined) {
          conditions.push({
            field,
            type: 'string' as const,
            description: `${field} == "${choice.StringEquals}"`,
            sampleValue: choice.StringEquals,
          })
        } else if (choice.StringMatches !== undefined) {
          conditions.push({
            field,
            type: 'string' as const,
            description: `${field} matches "${choice.StringMatches}"`,
            sampleValue: 'sample-value',
          })
        } else if (choice.NumericEquals !== undefined) {
          conditions.push({
            field,
            type: 'number' as const,
            description: `${field} == ${choice.NumericEquals}`,
            sampleValue: choice.NumericEquals,
          })
        } else if (
          choice.NumericLessThan !== undefined &&
          typeof choice.NumericLessThan === 'number'
        ) {
          conditions.push({
            field,
            type: 'number' as const,
            description: `${field} < ${choice.NumericLessThan}`,
            sampleValue: choice.NumericLessThan - 1,
          })
        } else if (
          choice.NumericGreaterThan !== undefined &&
          typeof choice.NumericGreaterThan === 'number'
        ) {
          conditions.push({
            field,
            type: 'number' as const,
            description: `${field} > ${choice.NumericGreaterThan}`,
            sampleValue: choice.NumericGreaterThan + 1,
          })
        } else if (choice.BooleanEquals !== undefined) {
          conditions.push({
            field,
            type: 'boolean' as const,
            description: `${field} == ${choice.BooleanEquals}`,
            sampleValue: choice.BooleanEquals,
          })
        } else if (choice.IsPresent !== undefined) {
          conditions.push({
            field,
            type: 'any' as const,
            description: choice.IsPresent ? `${field} is present` : `${field} is not present`,
            sampleValue: choice.IsPresent ? 'present-value' : null,
          })
        } else if (choice.IsNull !== undefined) {
          conditions.push({
            field,
            type: 'any' as const,
            description: choice.IsNull ? `${field} is null` : `${field} is not null`,
            sampleValue: choice.IsNull ? null : 'not-null-value',
          })
        }
      }
    }

    return conditions
  }

  /**
   * 条件式に応じたサンプル値を生成
   */
  private generateSampleValueForCondition(condition: string, fieldName: string): JsonValue {
    const lowerCondition = condition.toLowerCase()
    const lowerField = fieldName.toLowerCase()

    // 条件からヒントを得る
    if (lowerCondition.includes('true') || lowerCondition.includes('false')) {
      return lowerCondition.includes('true')
    }
    if (lowerCondition.includes('null')) {
      return null
    }
    if (/\d+/.test(condition)) {
      const match = condition.match(/\d+/)
      return match ? Number.parseInt(match[0], 10) : 100
    }

    // フィールド名からヒントを得る
    if (
      lowerField.includes('notify') ||
      lowerField.includes('enabled') ||
      lowerField.includes('flag')
    ) {
      return true
    }
    if (
      (lowerField.includes('resource') && lowerField.includes('list')) ||
      lowerField.includes('items') ||
      lowerField.includes('resources')
    ) {
      return ['resource-001', 'resource-002']
    }
    if (lowerField.includes('period') || lowerField.includes('month')) {
      return '2025-01'
    }
    if (lowerField.includes('count') || lowerField.includes('size')) {
      return 1
    }

    return DataFlowHelpers.generateSampleValue(fieldName)
  }
}
