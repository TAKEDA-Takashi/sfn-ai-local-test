/**
 * Prompt Builder with State Hierarchy Analysis
 * Handles complex state structure understanding
 */

import * as path from 'node:path'
import { type ItemReader, isDistributedMap, type StateMachine } from '../../types/asl'
import { MOCK_TYPE_DEFINITIONS, TEST_TYPE_DEFINITIONS } from '../agents/embedded-types'
import { DataFlowAnalyzer } from '../analysis/data-flow-analyzer'
import {
  detectOutputTransformation,
  getOutputTransformationDetails,
} from '../analysis/output-transformation-detection'
import { StateHierarchyAnalyzer } from '../analysis/state-hierarchy-analyzer'
import { findStates, StateFilters } from '../utils/state-traversal'
import {
  detectChoiceLoops,
  getChoiceMockGuidelines,
  hasProblematicChoicePatterns,
} from './prompt-sections/choice-analysis'
import {
  getCriticalRules,
  getExecutionContextInfo,
  getTestCriticalRules,
} from './prompt-sections/critical-rules'
import {
  getDataFlowGuidance,
  getOutputTransformationGuidance,
} from './prompt-sections/data-flow-guidance'
import { getLambdaIntegrationRules } from './prompt-sections/lambda-rules'
import {
  getDistributedMapSpecializedPrompt,
  getDistributedMapTestGuidance,
  getItemReaderMandatorySection,
  getMapSpecializedPrompt,
  getMapTestGuidance,
  getMockableStatesGuidance,
  getParallelSpecializedPrompt,
  getParallelTestGuidance,
} from './prompt-sections/state-specialized'
import { getVariablesRules, getVariablesTestGuidance } from './prompt-sections/variables-rules'
import { getMockYamlOutputRules, getTestYamlOutputRules } from './prompt-sections/yaml-rules'

export interface StructuredPrompt {
  system: string
  user: string
}

export class PromptBuilder {
  private analyzer: StateHierarchyAnalyzer
  private dataFlowAnalyzer?: DataFlowAnalyzer
  private readonly promptsDir = path.join(__dirname, '..', 'prompts')

  constructor() {
    this.analyzer = new StateHierarchyAnalyzer()
  }

  /**
   * Build mock generation prompt as a single string (for Claude CLI path)
   */
  buildMockPrompt(stateMachine: StateMachine): string {
    const { system, user } = this.buildStructuredMockPrompt(stateMachine)
    return `${system}\n\n${user}`
  }

  /**
   * Build structured mock prompt with system/user separation (for Direct API path)
   */
  buildStructuredMockPrompt(stateMachine: StateMachine): StructuredPrompt {
    const systemSections: string[] = []
    const userSections: string[] = []
    const hierarchy = this.analyzer.analyzeHierarchy(stateMachine)

    // System: Rules, type definitions, guidelines
    systemSections.push(getMockYamlOutputRules(this.promptsDir))
    systemSections.push(MOCK_TYPE_DEFINITIONS)
    systemSections.push(getCriticalRules())

    const hasParallel = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Parallel')
    const hasMap = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Map')
    const hasDistributedMap = Object.values(hierarchy.nestedStructures).some(
      (s) => s.type === 'DistributedMap',
    )

    if (hasParallel) {
      systemSections.push(getParallelSpecializedPrompt(this.promptsDir))
    }
    if (hasMap && !hasDistributedMap) {
      systemSections.push(getMapSpecializedPrompt(this.promptsDir))
    }
    if (hasDistributedMap) {
      systemSections.push(getDistributedMapSpecializedPrompt(this.promptsDir))
    }

    if (findStates(stateMachine, StateFilters.isLambdaTask).length > 0) {
      systemSections.push(getLambdaIntegrationRules())
    }

    if (findStates(stateMachine, StateFilters.hasVariables).length > 0) {
      systemSections.push(getVariablesRules())
    }

    if (hasProblematicChoicePatterns(stateMachine)) {
      const analysis = detectChoiceLoops(stateMachine)
      systemSections.push(getChoiceMockGuidelines(this.promptsDir, analysis))
    }

    systemSections.push(getExecutionContextInfo())

    this.dataFlowAnalyzer = new DataFlowAnalyzer(stateMachine)
    const dataFlowAnalysis = this.dataFlowAnalyzer?.analyzeDataFlowConsistency() || {
      consistency: {
        isConsistent: true,
        breaks: [],
        warnings: [],
      },
      recommendations: [],
    }
    systemSections.push(getDataFlowGuidance(dataFlowAnalysis))

    // User: State machine data and task request
    userSections.push(this.getAvailableStatesSection(stateMachine))

    const structureExplanation = this.analyzer.generateStructureExplanation(hierarchy)
    if (structureExplanation) {
      userSections.push(structureExplanation)
    }

    // ItemReaderがある場合は必須モックとして明示
    const itemReaderAllStates = findStates(stateMachine, StateFilters.hasItemReader)
    if (itemReaderAllStates.length > 0) {
      const allStates = itemReaderAllStates
      const distributedMapStates = allStates.filter(({ state }) => isDistributedMap(state))
      const itemReaderStates = distributedMapStates
        .map(({ name, state }) => {
          if (!isDistributedMap(state)) return null
          return {
            name,
            itemReader: state.ItemReader,
            hasResultWriter: !!state.ResultWriter,
          }
        })
        .filter(
          (item): item is { name: string; itemReader: ItemReader; hasResultWriter: boolean } =>
            item !== null && item.itemReader !== undefined,
        )
      userSections.push(getItemReaderMandatorySection(itemReaderStates))
    }

    const mockableStates = this.analyzer.getMockableStates(hierarchy)
    userSections.push(getMockableStatesGuidance(mockableStates))

    userSections.push('## State Machine Definition')
    userSections.push('```json')
    userSections.push(JSON.stringify(stateMachine, null, 2))
    userSections.push('```')

    userSections.push('Generate a mock configuration YAML for the above state machine.')
    userSections.push(
      '**OUTPUT ONLY THE YAML CONTENT. NO EXPLANATIONS, NO MARKDOWN, NO COMMENTS OUTSIDE YAML.**',
    )
    userSections.push('**START DIRECTLY WITH: version: "1.0"**')

    if (itemReaderAllStates.length > 0) {
      userSections.push('')
      userSections.push(
        '**⚠️ REMEMBER: Include all ItemReader mocks with dataFile references in the YAML ⚠️**',
      )
      userSections.push(
        '**Data files will be generated separately based on your YAML configuration.**',
      )
    }

    return {
      system: systemSections.join('\n\n'),
      user: userSections.join('\n\n'),
    }
  }

  /**
   * Build test generation prompt as a single string (for Claude CLI path)
   */
  buildTestPrompt(stateMachine: StateMachine, mockContent?: string): string {
    const { system, user } = this.buildStructuredTestPrompt(stateMachine, mockContent)
    return `${system}\n\n${user}`
  }

  /**
   * Build structured test prompt with system/user separation (for Direct API path)
   */
  buildStructuredTestPrompt(stateMachine: StateMachine, mockContent?: string): StructuredPrompt {
    const systemSections: string[] = []
    const userSections: string[] = []
    const hierarchy = this.analyzer.analyzeHierarchy(stateMachine)

    // System: Rules, type definitions, guidelines
    systemSections.push(getTestYamlOutputRules(this.promptsDir))
    systemSections.push(TEST_TYPE_DEFINITIONS)
    systemSections.push(getTestCriticalRules())

    const hasOutputTransformation = detectOutputTransformation(stateMachine)
    if (hasOutputTransformation) {
      const transformationDetails = getOutputTransformationDetails(stateMachine)
      systemSections.push(getOutputTransformationGuidance(transformationDetails))
    }

    const hasParallel = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Parallel')
    const hasMap = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Map')
    const hasDistributedMap = Object.values(hierarchy.nestedStructures).some(
      (s) => s.type === 'DistributedMap',
    )

    if (hasParallel) {
      systemSections.push(getParallelTestGuidance())
    }
    if (hasMap) {
      systemSections.push(getMapTestGuidance())
    }
    if (hasDistributedMap) {
      systemSections.push(getDistributedMapTestGuidance())
    }

    if (findStates(stateMachine, StateFilters.hasVariables).length > 0) {
      systemSections.push(getVariablesTestGuidance())
    }

    // User: State machine data and task request
    userSections.push(this.getAvailableStatesSection(stateMachine))

    const structureExplanation = this.analyzer.generateStructureExplanation(hierarchy)
    if (structureExplanation) {
      userSections.push(structureExplanation)
    }

    userSections.push('## State Machine Definition')
    userSections.push('```json')
    userSections.push(JSON.stringify(stateMachine, null, 2))
    userSections.push('```')

    if (mockContent) {
      userSections.push('## Mock Configuration')
      userSections.push('```yaml')
      userSections.push(mockContent)
      userSections.push('```')
    }

    userSections.push('Generate a test suite YAML for the above state machine.')
    userSections.push(
      '**OUTPUT ONLY THE YAML CONTENT. NO EXPLANATIONS, NO MARKDOWN, NO COMMENTS OUTSIDE YAML.**',
    )
    userSections.push('**START DIRECTLY WITH: version: "1.0"**')

    return {
      system: systemSections.join('\n\n'),
      user: userSections.join('\n\n'),
    }
  }

  private getAvailableStatesSection(stateMachine: StateMachine): string {
    const states = Object.keys(stateMachine.States || {})
    if (states.length === 0) {
      return ''
    }

    return `## Available States in This State Machine

⚠️ IMPORTANT: Only use state names from this list ⚠️

The following states exist in the state machine:
${states.map((s) => `- "${s}"`).join('\n')}

**Critical**:
- Use these exact state names (case-sensitive)
- Do NOT create or reference states that are not in this list
- This list shows TOP-LEVEL states only. See "Mockable States" section for all states that can be mocked`
  }
}
