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

export class PromptBuilder {
  private analyzer: StateHierarchyAnalyzer
  private dataFlowAnalyzer?: DataFlowAnalyzer
  private readonly promptsDir = path.join(__dirname, '..', 'prompts')

  constructor() {
    this.analyzer = new StateHierarchyAnalyzer()
  }

  /**
   * Build mock generation prompt with hierarchy understanding
   */
  buildMockPrompt(stateMachine: StateMachine): string {
    const sections: string[] = []
    const hierarchy = this.analyzer.analyzeHierarchy(stateMachine)

    sections.push(getMockYamlOutputRules(this.promptsDir))
    sections.push(MOCK_TYPE_DEFINITIONS)
    sections.push(this.getAvailableStatesSection(stateMachine))
    sections.push(getCriticalRules())

    const structureExplanation = this.analyzer.generateStructureExplanation(hierarchy)
    if (structureExplanation) {
      sections.push(structureExplanation)
    }

    const hasParallel = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Parallel')
    const hasMap = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Map')
    const hasDistributedMap = Object.values(hierarchy.nestedStructures).some(
      (s) => s.type === 'DistributedMap',
    )

    if (hasParallel) {
      sections.push(getParallelSpecializedPrompt(this.promptsDir))
    }
    if (hasMap && !hasDistributedMap) {
      sections.push(getMapSpecializedPrompt(this.promptsDir))
    }
    if (hasDistributedMap) {
      sections.push(getDistributedMapSpecializedPrompt(this.promptsDir))
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
      sections.push(getItemReaderMandatorySection(itemReaderStates))
    }

    const mockableStates = this.analyzer.getMockableStates(hierarchy)
    sections.push(getMockableStatesGuidance(mockableStates))

    if (findStates(stateMachine, StateFilters.isLambdaTask).length > 0) {
      sections.push(getLambdaIntegrationRules())
    }

    if (findStates(stateMachine, StateFilters.hasVariables).length > 0) {
      sections.push(getVariablesRules())
    }

    if (hasProblematicChoicePatterns(stateMachine)) {
      const analysis = detectChoiceLoops(stateMachine)
      sections.push(getChoiceMockGuidelines(this.promptsDir, analysis))
    }

    sections.push(getExecutionContextInfo())

    this.dataFlowAnalyzer = new DataFlowAnalyzer(stateMachine)
    const dataFlowAnalysis = this.dataFlowAnalyzer?.analyzeDataFlowConsistency() || {
      consistency: {
        isConsistent: true,
        breaks: [],
        warnings: [],
      },
      recommendations: [],
    }
    sections.push(getDataFlowGuidance(dataFlowAnalysis))

    sections.push('## State Machine Definition')
    sections.push('```json')
    sections.push(JSON.stringify(stateMachine, null, 2))
    sections.push('```')

    sections.push('## FINAL REMINDER')
    sections.push(
      '**OUTPUT ONLY THE YAML CONTENT. NO EXPLANATIONS, NO MARKDOWN, NO COMMENTS OUTSIDE YAML.**',
    )
    sections.push('**START DIRECTLY WITH: version: "1.0"**')

    if (findStates(stateMachine, StateFilters.hasItemReader).length > 0) {
      sections.push('')
      sections.push(
        '**⚠️ REMEMBER: Include all ItemReader mocks with dataFile references in the YAML ⚠️**',
      )
      sections.push('**Data files will be generated separately based on your YAML configuration.**')
    }

    return sections.join('\n\n')
  }

  /**
   * Build test generation prompt
   */
  buildTestPrompt(stateMachine: StateMachine, mockContent?: string): string {
    const sections: string[] = []
    const hierarchy = this.analyzer.analyzeHierarchy(stateMachine)

    sections.push(getTestYamlOutputRules(this.promptsDir))
    sections.push(TEST_TYPE_DEFINITIONS)
    sections.push(this.getAvailableStatesSection(stateMachine))
    sections.push(getTestCriticalRules())

    const hasOutputTransformation = detectOutputTransformation(stateMachine)
    if (hasOutputTransformation) {
      const transformationDetails = getOutputTransformationDetails(stateMachine)
      sections.push(getOutputTransformationGuidance(transformationDetails))
    }

    const structureExplanation = this.analyzer.generateStructureExplanation(hierarchy)
    if (structureExplanation) {
      sections.push(structureExplanation)
    }

    const hasParallel = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Parallel')
    const hasMap = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Map')
    const hasDistributedMap = Object.values(hierarchy.nestedStructures).some(
      (s) => s.type === 'DistributedMap',
    )

    if (hasParallel) {
      sections.push(getParallelTestGuidance())
    }
    if (hasMap) {
      sections.push(getMapTestGuidance())
    }
    if (hasDistributedMap) {
      sections.push(getDistributedMapTestGuidance())
    }

    if (findStates(stateMachine, StateFilters.hasVariables).length > 0) {
      sections.push(getVariablesTestGuidance())
    }

    sections.push('## State Machine Definition')
    sections.push('```json')
    sections.push(JSON.stringify(stateMachine, null, 2))
    sections.push('```')

    if (mockContent) {
      sections.push('## Mock Configuration')
      sections.push('```yaml')
      sections.push(mockContent)
      sections.push('```')
    }

    sections.push('## FINAL REMINDER')
    sections.push(
      '**OUTPUT ONLY THE YAML CONTENT. NO EXPLANATIONS, NO MARKDOWN, NO COMMENTS OUTSIDE YAML.**',
    )
    sections.push('**START DIRECTLY WITH: version: "1.0"**')

    return sections.join('\n\n')
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
