/**
 * Advanced State Machine Hierarchy Analyzer
 * Analyzes complex nested structures in Step Functions state machines
 */

import type {
  DistributedMapState,
  JsonObject,
  MapState,
  ParallelState,
  StateMachine,
} from '../../types/asl'
import { traverseStates } from '../utils/state-traversal'

interface StateHierarchy {
  topLevelStates: string[]
  nestedStructures: {
    [stateName: string]: NestedStructure
  }
  allStates: string[]
}

interface NestedStructure {
  type: 'Parallel' | 'Map' | 'DistributedMap'
  branches?: BranchInfo[]
  itemProcessor?: ProcessorInfo
  itemReader?: ReaderInfo
  resultWriter?: WriterInfo
}

interface BranchInfo {
  index: number
  states: string[]
  startAt: string
}

interface ProcessorInfo {
  states: string[]
  startAt: string
  processorConfig?: JsonObject
}

interface ReaderInfo {
  resource: string
  /** Parameters for JSONPath mode */
  parameters?: JsonObject
  /** Arguments for JSONata mode */
  arguments?: JsonObject | string
}

interface WriterInfo {
  resource: string
  /** Parameters for JSONPath mode */
  parameters?: JsonObject
  /** Arguments for JSONata mode */
  arguments?: JsonObject | string
}

export class StateHierarchyAnalyzer {
  /**
   * Analyze the complete hierarchy of a state machine
   */
  analyzeHierarchy(stateMachine: StateMachine): StateHierarchy {
    const hierarchy: StateHierarchy = {
      topLevelStates: [],
      nestedStructures: {},
      allStates: [],
    }

    if (stateMachine.States) {
      hierarchy.topLevelStates = Object.keys(stateMachine.States)

      traverseStates(stateMachine, (stateName, state, context) => {
        hierarchy.allStates.push(context.path)

        if (context.depth === 0) {
          if (state.isParallel()) {
            hierarchy.nestedStructures[stateName] = this.buildParallelStructure(state)
          } else if (state.isMap()) {
            if (state.isDistributedMap()) {
              hierarchy.nestedStructures[stateName] = this.buildDistributedMapStructure(state)
            } else {
              hierarchy.nestedStructures[stateName] = this.buildMapStructure(state)
            }
          }
        }

        return undefined
      })
    }

    return hierarchy
  }

  /**
   * Build a Parallel state structure (without modifying hierarchy)
   */
  private buildParallelStructure(state: ParallelState): NestedStructure {
    const structure: NestedStructure = {
      type: 'Parallel',
      branches: [],
    }

    const branches = state.Branches || []
    branches.forEach((branch, index: number) => {
      const branchInfo: BranchInfo = {
        index,
        states: Object.keys(branch.States || {}),
        startAt: branch.StartAt || '',
      }
      structure.branches?.push(branchInfo)
    })

    return structure
  }

  /**
   * Build a Map state structure (without modifying hierarchy)
   */
  private buildMapStructure(state: MapState): NestedStructure {
    const structure: NestedStructure = {
      type: 'Map',
    }

    if (state.isMap() && state.ItemProcessor) {
      const processor = state.ItemProcessor
      const processorInfo: ProcessorInfo = {
        states: Object.keys(processor.States || {}),
        startAt: processor.StartAt || '',
        processorConfig: processor.ProcessorConfig,
      }
      structure.itemProcessor = processorInfo
    }

    return structure
  }

  /**
   * Build a Distributed Map state structure (without modifying hierarchy)
   */
  private buildDistributedMapStructure(state: DistributedMapState): NestedStructure {
    const structure: NestedStructure = {
      type: 'DistributedMap',
    }

    if (state.ItemReader) {
      const reader = state.ItemReader
      structure.itemReader = {
        resource: reader.Resource || '',
        parameters: 'Parameters' in reader ? reader.Parameters : undefined,
        arguments: 'Arguments' in reader ? reader.Arguments : undefined,
      }
    }

    if (state.ItemProcessor) {
      const processorInfo: ProcessorInfo = {
        states: Object.keys(state.ItemProcessor.States || {}),
        startAt: state.ItemProcessor.StartAt || '',
        processorConfig: state.ItemProcessor.ProcessorConfig,
      }
      structure.itemProcessor = processorInfo
    }

    if (state.ResultWriter) {
      const writer = state.ResultWriter
      structure.resultWriter = {
        resource: writer.Resource || '',
        parameters: 'Parameters' in writer ? writer.Parameters : undefined,
        arguments: 'Arguments' in writer ? writer.Arguments : undefined,
      }
    }

    return structure
  }

  /**
   * Get mock-appropriate state references
   */
  getMockableStates(hierarchy: StateHierarchy): string[] {
    const mockableStates: string[] = []

    mockableStates.push(...hierarchy.topLevelStates)

    for (const [stateName, structure] of Object.entries(hierarchy.nestedStructures)) {
      if (structure.type === 'Parallel') {
        // Parallel states: Task states can be mocked individually
        if (structure.branches) {
          for (const branch of structure.branches) {
            for (const branchState of branch.states) {
              mockableStates.push(branchState)
            }
          }
        }
      } else if (structure.type === 'Map' || structure.type === 'DistributedMap') {
        if (structure.itemProcessor) {
          for (const processorState of structure.itemProcessor.states) {
            mockableStates.push(`${stateName}.ItemProcessor.${processorState}`)
          }
        }
      }
    }

    return mockableStates
  }

  /**
   * Generate explanation for AI about state structure
   */
  generateStructureExplanation(hierarchy: StateHierarchy): string {
    const explanations: string[] = []

    explanations.push('## State Machine Structure Analysis\n')
    explanations.push(`Top-level states: ${hierarchy.topLevelStates.join(', ')}\n`)

    for (const [stateName, structure] of Object.entries(hierarchy.nestedStructures)) {
      if (structure.type === 'Parallel') {
        explanations.push(`\n### ${stateName} (Parallel State)`)
        explanations.push('This is a Parallel state with the following branches:')
        structure.branches?.forEach((branch, index) => {
          explanations.push(`- Branch ${index}: ${branch.states.join(' → ')}`)
        })
        explanations.push(
          `\n**Important**: Mock individual Task states within branches directly using their state names.`,
        )
      } else if (structure.type === 'Map') {
        explanations.push(`\n### ${stateName} (Map State)`)
        if (structure.itemProcessor) {
          explanations.push(`ItemProcessor contains: ${structure.itemProcessor.states.join(' → ')}`)
          explanations.push('\n**Important**: For Map states, you can:')
          explanations.push('1. Mock the entire Map state for simple cases')
          explanations.push('2. Mock individual processor states for complex conditional logic')
        }
      } else if (structure.type === 'DistributedMap') {
        explanations.push(`\n### ${stateName} (Distributed Map State)`)
        if (structure.itemReader) {
          explanations.push(`ItemReader: ${structure.itemReader.resource}`)
        }
        if (structure.itemProcessor) {
          explanations.push(`ItemProcessor contains: ${structure.itemProcessor.states.join(' → ')}`)
        }
        if (structure.resultWriter) {
          explanations.push(`ResultWriter: ${structure.resultWriter.resource}`)
        }
        explanations.push(
          '\n**Important**: Mock at the parent level for ItemReader/ResultWriter, processor states for logic.',
        )
      }
    }

    return explanations.join('\n')
  }
}
