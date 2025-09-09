/**
 * Advanced State Machine Hierarchy Analyzer
 * Analyzes complex nested structures in Step Functions state machines
 */

import type {
  DistributedMapState,
  ItemProcessor,
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
  parameters?: JsonObject // JSONPath mode
  arguments?: JsonObject | string // JSONata mode
}

interface WriterInfo {
  resource: string
  parameters?: JsonObject // JSONPath mode
  arguments?: JsonObject | string // JSONata mode
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

    const sm = stateMachine

    // Analyze top-level states
    if (sm.States) {
      hierarchy.topLevelStates = Object.keys(sm.States)

      // Use unified traversal to build hierarchy
      traverseStates(sm, (stateName, state, context) => {
        // Add to allStates
        hierarchy.allStates.push(context.path)

        // Analyze nested structures for top-level states
        if (context.depth === 0) {
          if (state.isParallel()) {
            hierarchy.nestedStructures[stateName] = this.buildParallelStructure(
              state as ParallelState,
            )
          } else if (state.isMap()) {
            const isDistributedMap = state.isDistributedMap?.()
            if (isDistributedMap) {
              hierarchy.nestedStructures[stateName] = this.buildDistributedMapStructure(
                state as DistributedMapState,
              )
            } else if (state.isInlineMap?.()) {
              hierarchy.nestedStructures[stateName] = this.buildMapStructure(state as MapState)
            } else {
              // Default to inline Map structure for any Map state
              hierarchy.nestedStructures[stateName] = this.buildMapStructure(state as MapState)
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

    // Handle both State instances and plain objects
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

    // Handle both ItemProcessor and Iterator formats
    if (state.isMap() && state.ItemProcessor) {
      const processor = state.ItemProcessor
      const processorInfo: ProcessorInfo = {
        states: Object.keys(processor.States || {}),
        startAt: processor.StartAt || '',
        processorConfig: processor.ProcessorConfig,
      }
      structure.itemProcessor = processorInfo
    } else if (state.isMap() && 'Iterator' in state && state.Iterator) {
      // IteratorはJSONPathItemProcessorかJSONataItemProcessorの型を持つ
      const iterator = (state as MapState & { Iterator: ItemProcessor }).Iterator
      if (iterator?.States) {
        const processorInfo: ProcessorInfo = {
          states: Object.keys(iterator.States),
          startAt: iterator.StartAt || '',
          processorConfig: iterator.ProcessorConfig as JsonObject | undefined,
        }
        structure.itemProcessor = processorInfo
      }
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

    // Analyze ItemReader (only for DistributedMap)
    if (state.ItemReader) {
      const reader = state.ItemReader
      structure.itemReader = {
        resource: reader.Resource || '',
        parameters: 'Parameters' in reader ? reader.Parameters : undefined,
        arguments: 'Arguments' in reader ? reader.Arguments : undefined,
      }
    }

    // Analyze ItemProcessor
    if (state.ItemProcessor) {
      const processorInfo: ProcessorInfo = {
        states: Object.keys(state.ItemProcessor.States || {}),
        startAt: state.ItemProcessor.StartAt || '',
        processorConfig: state.ItemProcessor.ProcessorConfig,
      }
      structure.itemProcessor = processorInfo
    }

    // Analyze ResultWriter (only for DistributedMap)
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

    // Add all top-level states
    mockableStates.push(...hierarchy.topLevelStates)

    // For nested structures, we need to include all Task states
    for (const [stateName, structure] of Object.entries(hierarchy.nestedStructures)) {
      if (structure.type === 'Parallel') {
        // For Parallel states, include all Task states within branches
        // These can be mocked individually for proper testing
        if (structure.branches) {
          for (const branch of structure.branches) {
            for (const branchState of branch.states) {
              // Add the state directly (without parent prefix for Parallel)
              mockableStates.push(branchState)
            }
          }
        }
      } else if (structure.type === 'Map' || structure.type === 'DistributedMap') {
        // Map states can be mocked at parent level or processor level
        if (structure.itemProcessor) {
          // Can mock individual states within processor for conditional logic
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
