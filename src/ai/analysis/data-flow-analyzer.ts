import type { JsonObject, JsonValue, StateMachine } from '../../types/asl'
import { ChoiceDependencyAnalyzer } from './analyzers/choice-dependency-analyzer'
import { DataFlowHelpers } from './analyzers/data-flow-helpers'
import { MapOutputAnalyzer } from './analyzers/map-output-analyzer'
import { PassVariableAnalyzer } from './analyzers/pass-variable-analyzer'

interface DataFlowNode {
  stateName: string
  /** State.Type can be any state type string */
  type: string
  /** Variables and fields this state generates */
  produces: string[]
  /** Variables and fields this state uses */
  consumes: string[]
  /** Parts extracted in Output field */
  outputExtraction: string[]
}

interface MockRequirement {
  stateName: string
  /** Whether mock is required */
  required: boolean
  /** Minimum required fields */
  minimalFields: string[]
  /** Recommended mock complexity */
  complexity: 'none' | 'fixed' | 'conditional'
  /** Reasoning for the decision */
  reason: string
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

/** Choice state dependency analysis type definitions */
export interface ChoiceDependency {
  choiceStateName: string
  /** Field names required for Choice evaluation (e.g., 'notify', 'items') */
  requiredFields: string[]
  fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'>
  /** Requirements for upstream states */
  upstreamRequirements: UpstreamStateRequirement[]
  /** Information for each branch */
  branches: ChoiceBranch[]
}

export interface UpstreamStateRequirement {
  /** Target state name (empty string means any upstream state) */
  targetStateName: string
  /** Fields that should be output */
  requiredOutputFields: string[]
  /** Reason for the requirement */
  reason: string
}

export interface ChoiceBranch {
  /** Description of the branch condition */
  condition: string
  /** Next state name */
  nextState: string
  /** Required input values to take this branch */
  requiredInput: JsonObject
  /** Expected variable values for this branch */
  expectedVariables?: JsonObject
}

/** Type definitions for AWS-compliant Map state output analysis */
export interface MapOutputSpec {
  stateName: string
  requiredFields: MapOutputField[]
  dynamicFields: DynamicField[]
  /** Description when conditional logic is needed */
  conditionalLogic: string
}

export interface MapOutputField {
  /** Field name (e.g., 'ProcessedItemCount') */
  field: string
  type: 'number' | 'string' | 'object'
  required: boolean
  description: string
}

export interface DynamicField {
  field: string
  /** Description of calculation formula (e.g., 'input.items.length') */
  calculation: string
  /** Fallback value when calculation is not possible */
  fallbackValue: JsonValue
}

/** Type definitions for Pass state variable flow analysis */
export interface PassVariableFlow {
  passStateName: string
  /** InputPath specification */
  inputPath?: string
  /** Variables configuration */
  variables: Record<string, string>
  /** OutputPath specification */
  outputPath?: string
  /** Fields that are ultimately output */
  producedFields: string[]
  /** Compatibility with Choice states */
  choiceCompatibility: ChoiceCompatibilityInfo
}

export interface ChoiceCompatibilityInfo {
  /** Compatible Choice state names */
  compatibleChoiceStates: string[]
  /** Missing fields */
  missingFields: string[]
  /** Recommended changes */
  recommendedChanges: string[]
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
   * Analyzes data flow for each state
   */
  analyzeDataFlow(): DataFlowNode[] {
    const nodes: DataFlowNode[] = []
    const states = this.stateMachine.States || {}

    for (const [stateName, state] of Object.entries(states)) {
      const node: DataFlowNode = {
        stateName,
        type: state.Type,
        produces: [],
        consumes: [],
        outputExtraction: [],
      }

      if ('Assign' in state && state.Assign) {
        const assignKeys = Object.keys(state.Assign)
        node.produces.push(...assignKeys.map((k) => `$${k}`))

        for (const assignValue of Object.values(state.Assign)) {
          if (typeof assignValue === 'string') {
            node.consumes.push(...DataFlowHelpers.extractVariableReferences(assignValue))
          }
        }
      }

      if ('Arguments' in state && state.Arguments) {
        const argsStr = JSON.stringify(state.Arguments)
        node.consumes.push(...DataFlowHelpers.extractVariableReferences(argsStr))
      }

      if ('Parameters' in state && state.Parameters) {
        const paramsStr = JSON.stringify(state.Parameters)
        node.consumes.push(...DataFlowHelpers.extractVariableReferences(paramsStr))
      }

      if (state.isChoice() && state.isJSONataState()) {
        const choices = state.Choices || []
        for (const choice of choices) {
          if ('Condition' in choice && choice.Condition) {
            node.consumes.push(...DataFlowHelpers.extractVariableReferences(choice.Condition))
          }
        }
      }

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
   * Analyzes mock requirements
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

        const usesResultPayload = node.outputExtraction.some((ref) =>
          ref.includes('$states.result.Payload'),
        )

        if (usesResultPayload) {
          requirement.minimalFields.push('Payload')
        }

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
   * Detects variable usage in subsequent states
   */
  private findSubsequentUsage(targetStateName: string, dataFlow: DataFlowNode[]): string[] {
    const subsequentUsage: string[] = []
    const targetIndex = dataFlow.findIndex((node) => node.stateName === targetStateName)

    if (targetIndex === -1) return subsequentUsage

    for (let i = targetIndex + 1; i < dataFlow.length; i++) {
      const node = dataFlow[i]
      if (!node) continue
      const taskResultRefs = node.consumes.filter((ref) => ref.startsWith('$states.result'))
      subsequentUsage.push(...taskResultRefs)
    }

    return subsequentUsage
  }

  /**
   * Analyzes data flow consistency for the entire state machine
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

    for (const passFlow of passVariableFlows) {
      if (passFlow.choiceCompatibility.missingFields.length > 0) {
        consistencyIssues.push(
          `Pass state "${passFlow.passStateName}" does not provide fields required by Choice states: ${passFlow.choiceCompatibility.missingFields.join(', ')}`,
        )
        recommendations.push(...passFlow.choiceCompatibility.recommendedChanges)
      }
    }

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
