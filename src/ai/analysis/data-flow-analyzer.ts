import type { JsonObject, JsonValue, StateMachine } from '../../types/asl'
import { ChoiceDependencyAnalyzer } from './analyzers/choice-dependency-analyzer'
import { DataFlowHelpers } from './analyzers/data-flow-helpers'
import { MapOutputAnalyzer } from './analyzers/map-output-analyzer'
import { PassVariableAnalyzer } from './analyzers/pass-variable-analyzer'

interface DataFlowNode {
  stateName: string
  type: 'Pass' | 'Task' | 'Choice' | 'Parallel' | 'Map'
  produces: string[] // このステートが生成する変数・フィールド
  consumes: string[] // このステートが使用する変数・フィールド
  outputExtraction: string[] // Outputフィールドで抽出される部分
}

interface MockRequirement {
  stateName: string
  required: boolean // モックが必要かどうか
  minimalFields: string[] // 最低限必要なフィールド
  complexity: 'none' | 'fixed' | 'conditional' // 推奨モック複雑度
  reason: string // 判断理由
}

export interface InputRequirement {
  field: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  required: boolean
  example?: JsonValue
  description?: string
}

export interface ItemProcessorAnalysis {
  stateName: string
  inputRequirements: InputRequirement[]
  sampleInput: JsonObject
}

// Choice状態の依存関係分析用の型定義
export interface ChoiceDependency {
  choiceStateName: string
  requiredFields: string[] // Choice評価に必要なフィールド名（例: 'notify', 'items'）
  fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'>
  upstreamRequirements: UpstreamStateRequirement[] // 前段状態への要求
  branches: ChoiceBranch[] // 各分岐の情報
}

export interface UpstreamStateRequirement {
  targetStateName: string // 要求対象の状態名（空文字列の場合は任意の前段状態）
  requiredOutputFields: string[] // 出力すべきフィールド
  reason: string // 要求理由
}

export interface ChoiceBranch {
  condition: string // 分岐条件の説明
  nextState: string // 次の状態名
  requiredInput: JsonObject // この分岐を通るのに必要な入力値
  expectedVariables?: JsonObject // この分岐で期待される変数値
}

// Map状態のAWS仕様準拠出力分析用の型定義
export interface MapOutputSpec {
  stateName: string
  requiredFields: MapOutputField[]
  dynamicFields: DynamicField[]
  conditionalLogic: string // 条件分岐が必要な場合の説明
}

export interface MapOutputField {
  field: string // フィールド名（例: 'ProcessedItemCount'）
  type: 'number' | 'string' | 'object'
  required: boolean
  description: string
}

export interface DynamicField {
  field: string
  calculation: string // 計算式の説明（例: 'input.items.length'）
  fallbackValue: JsonValue // 計算できない場合の代替値
}

// Pass状態の変数フロー分析用の型定義
export interface PassVariableFlow {
  passStateName: string
  inputPath?: string // InputPath指定
  variables: Record<string, string> // Variables設定
  outputPath?: string // OutputPath指定
  producedFields: string[] // 最終的に出力されるフィールド
  choiceCompatibility: ChoiceCompatibilityInfo // Choice状態との互換性
}

export interface ChoiceCompatibilityInfo {
  compatibleChoiceStates: string[] // 互換性のあるChoice状態名
  missingFields: string[] // 不足しているフィールド
  recommendedChanges: string[] // 推奨される変更
}

export class DataFlowAnalyzer {
  private stateMachine: StateMachine
  private choiceDependencyAnalyzer: ChoiceDependencyAnalyzer
  private mapOutputAnalyzer: MapOutputAnalyzer
  private passVariableAnalyzer: PassVariableAnalyzer

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine
    this.choiceDependencyAnalyzer = new ChoiceDependencyAnalyzer(stateMachine)
    this.mapOutputAnalyzer = new MapOutputAnalyzer(stateMachine)
    this.passVariableAnalyzer = new PassVariableAnalyzer(stateMachine)
  }

  /**
   * 各ステートのデータフローを分析
   */
  analyzeDataFlow(): DataFlowNode[] {
    const nodes: DataFlowNode[] = []
    const states = this.stateMachine.States || {}

    for (const [stateName, state] of Object.entries(states)) {
      const node: DataFlowNode = {
        stateName,
        type: state.Type as 'Pass' | 'Task' | 'Choice' | 'Parallel' | 'Map',
        produces: [],
        consumes: [],
        outputExtraction: [],
      }

      // Assignで生成される変数は後続ステートで参照可能
      if ('Assign' in state && state.Assign) {
        const assignKeys = Object.keys(state.Assign)
        node.produces.push(...assignKeys.map((k) => `$${k}`))

        // Assign内で他の変数を参照する場合を追跡
        for (const assignValue of Object.values(state.Assign)) {
          if (typeof assignValue === 'string') {
            node.consumes.push(...DataFlowHelpers.extractVariableReferences(assignValue))
          }
        }
      }

      // Lambda呼び出し等で変数参照を検出
      if ('Arguments' in state && state.Arguments) {
        const argsStr = JSON.stringify(state.Arguments)
        node.consumes.push(...DataFlowHelpers.extractVariableReferences(argsStr))
      }

      // Parameters フィールドでの変数参照を検出（JSONPathモード）
      if ('Parameters' in state && state.Parameters) {
        const paramsStr = JSON.stringify(state.Parameters)
        node.consumes.push(...DataFlowHelpers.extractVariableReferences(paramsStr))
      }

      // Choice分岐条件での変数依存を解析
      if (state.isChoice() && state.isJSONataState()) {
        // JSONataモードのChoice stateの場合
        const choices = state.Choices || []
        for (const choice of choices) {
          if ('Condition' in choice && choice.Condition) {
            node.consumes.push(...DataFlowHelpers.extractVariableReferences(choice.Condition))
          }
        }
      }

      // JSONata Outputで特定フィールドのみ抽出するパターンを検出
      if ('Output' in state && state.Output) {
        const outputStr = state.Output
        if (typeof outputStr === 'string') {
          node.outputExtraction.push(...DataFlowHelpers.extractVariableReferences(outputStr))
        }
      }

      nodes.push(node)
    }

    return nodes
  }

  /**
   * モック要件を分析
   */
  analyzeMockRequirements(): MockRequirement[] {
    const dataFlow = this.analyzeDataFlow()
    const requirements: MockRequirement[] = []

    for (const node of dataFlow) {
      if (node.type === 'Task') {
        const requirement: MockRequirement = {
          stateName: node.stateName,
          required: true,
          minimalFields: [],
          complexity: 'fixed',
          reason: 'Task state requires mock response',
        }

        // Payloadフィールドが必要かどうか後続の参照パターンから判断
        const usesResultPayload = node.outputExtraction.some((ref) =>
          ref.includes('$states.result.Payload'),
        )

        if (usesResultPayload) {
          requirement.minimalFields.push('Payload')
        }

        // 後続ステートでの使用を分析
        const subsequentUsage = this.findSubsequentUsage(node.stateName, dataFlow)

        if (subsequentUsage.length === 0) {
          requirement.complexity = 'fixed'
          requirement.reason += ' (output not used in subsequent logic)'
        } else if (subsequentUsage.every((usage) => usage.startsWith('$states.result'))) {
          requirement.complexity = 'conditional'
          requirement.reason += ' (output directly used in conditions)'
        } else {
          requirement.complexity = 'fixed'
          requirement.reason += ' (original variables used, not task output)'
        }

        requirements.push(requirement)
      }
    }

    return requirements
  }

  /**
   * 後続ステートでの変数使用を検出
   */
  private findSubsequentUsage(targetStateName: string, dataFlow: DataFlowNode[]): string[] {
    const subsequentUsage: string[] = []
    const targetIndex = dataFlow.findIndex((node) => node.stateName === targetStateName)

    if (targetIndex === -1) return subsequentUsage

    // 後続ステートで $states.result を使用している箇所を検索
    for (let i = targetIndex + 1; i < dataFlow.length; i++) {
      const node = dataFlow[i]
      if (!node) continue
      const taskResultRefs = node.consumes.filter((ref) => ref.startsWith('$states.result'))
      subsequentUsage.push(...taskResultRefs)
    }

    return subsequentUsage
  }

  /**
   * ステートマシン全体のデータフロー整合性を分析
   */
  analyzeDataFlowConsistency(): {
    choiceDependencies: ChoiceDependency[]
    mapOutputSpecs: MapOutputSpec[]
    passVariableFlows: PassVariableFlow[]
    consistencyIssues: string[]
    recommendations: string[]
  } {
    const choiceDependencies = this.choiceDependencyAnalyzer.analyzeChoiceDependencies()
    const mapOutputSpecs = this.mapOutputAnalyzer.analyzeMapOutputRequirements()
    const passVariableFlows = this.passVariableAnalyzer.analyzePassVariableFlows(choiceDependencies)

    const consistencyIssues: string[] = []
    const recommendations: string[] = []

    // Pass状態とChoice状態の整合性チェック
    for (const passFlow of passVariableFlows) {
      if (passFlow.choiceCompatibility.missingFields.length > 0) {
        consistencyIssues.push(
          `Pass state "${passFlow.passStateName}" does not provide fields required by Choice states: ${passFlow.choiceCompatibility.missingFields.join(', ')}`,
        )
        recommendations.push(...passFlow.choiceCompatibility.recommendedChanges)
      }
    }

    // Map状態の動的値計算チェック
    for (const mapSpec of mapOutputSpecs) {
      if (mapSpec.dynamicFields.length === 0) {
        consistencyIssues.push(
          `Map state "${mapSpec.stateName}" uses fixed values instead of dynamic calculation`,
        )
        recommendations.push(
          `Implement conditional mock for ${mapSpec.stateName} based on input array size`,
        )
      }
    }

    return {
      choiceDependencies,
      mapOutputSpecs,
      passVariableFlows,
      consistencyIssues,
      recommendations,
    }
  }
}
