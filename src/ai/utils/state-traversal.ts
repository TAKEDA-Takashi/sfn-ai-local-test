/**
 * Unified state traversal utility for Step Functions state machines
 *
 * This utility provides a consistent way to traverse all states in a state machine,
 * including nested states in Parallel branches and Map/DistributedMap ItemProcessors.
 */

import {
  isChoice,
  isDistributedMap,
  isMap,
  isParallel,
  isTask,
  type State,
  type StateMachine,
} from '../../types/asl'

export interface TraversalContext {
  /** Current depth in the state hierarchy */
  depth: number
  /** Path to current state (e.g., "MapState.ItemProcessor.TaskState") */
  path: string
  /** Parent state type if nested */
  parentType?: string
  /** Branch index if in Parallel state */
  branchIndex?: number
  /** Whether this is within an ItemProcessor */
  isInItemProcessor?: boolean
  /** Whether the parent uses JSONata mode */
  parentIsJSONata?: boolean
}

type StateVisitor = (
  stateName: string,
  state: State,
  context: TraversalContext,
) => undefined | boolean // Return false to stop traversal

type StateFilter = (stateName: string, state: State, context: TraversalContext) => boolean

/**
 * Traverse all states in a state machine with a visitor function
 */
export function traverseStates(stateMachine: StateMachine, visitor: StateVisitor): void {
  if (!stateMachine.States || typeof stateMachine.States !== 'object') {
    return
  }

  const states = stateMachine.States
  const isJSONata = stateMachine.QueryLanguage === 'JSONata'

  for (const [stateName, state] of Object.entries(states)) {
    // States are already properly typed as State instances from StateMachine
    const shouldContinue = traverseState(stateName, state, visitor, {
      depth: 0,
      path: stateName,
      parentIsJSONata: isJSONata,
    })
    if (shouldContinue === false) break
  }
}

/**
 * Traverse a single state and its nested states
 */
function traverseState(
  stateName: string,
  state: State,
  visitor: StateVisitor,
  context: TraversalContext,
): undefined | false {
  // Visit current state
  const shouldContinue = visitor(stateName, state, context)
  if (shouldContinue === false) return false

  // Check for JSONata mode at state level
  const stateIsJSONata = state.QueryLanguage === 'JSONata' || !!context.parentIsJSONata

  // Handle Parallel branches
  if (isParallel(state)) {
    if (state.Branches && Array.isArray(state.Branches)) {
      for (let index = 0; index < state.Branches.length; index++) {
        const branch = state.Branches[index]
        if (!branch?.States) continue
        const branchIsJSONata = branch.QueryLanguage === 'JSONata' || stateIsJSONata
        for (const [branchStateName, branchState] of Object.entries(branch.States)) {
          // branch.Statesは既にStateインターフェース（実行時はクラス）
          const result = traverseState(branchStateName, branchState, visitor, {
            depth: context.depth + 1,
            path: `${context.path}.Branch[${index}].${branchStateName}`,
            parentType: 'Parallel',
            branchIndex: index,
            parentIsJSONata: branchIsJSONata,
          })
          if (result === false) return false
        }
      }
    }
  }

  // Handle Map/DistributedMap ItemProcessor
  if (isMap(state)) {
    if (state.ItemProcessor?.States) {
      const processor = state.ItemProcessor
      const processorIsJSONata = stateIsJSONata
      for (const [procStateName, procState] of Object.entries(processor.States)) {
        // processor.States is already properly typed from MapState interface
        const result = traverseState(procStateName, procState, visitor, {
          depth: context.depth + 1,
          path: `${context.path}.ItemProcessor.${procStateName}`,
          parentType: state.Type,
          isInItemProcessor: true,
          parentIsJSONata: processorIsJSONata,
        })
        if (result === false) return false
      }
    }
  }

  return undefined
}

/**
 * Find all states matching a filter
 */
export function findStates(
  stateMachine: StateMachine,
  filter: StateFilter,
): Array<{ name: string; state: State; context: TraversalContext }> {
  const results: Array<{ name: string; state: State; context: TraversalContext }> = []

  traverseStates(stateMachine, (name, state, context) => {
    if (filter(name, state, context)) {
      results.push({ name, state, context })
    }
    return undefined
  })

  return results
}

/**
 * Common filters for frequent use cases
 */
export const StateFilters = {
  /** Filter for states with ItemReader */
  hasItemReader: (_name: string, state: State, _context: TraversalContext) => {
    // ItemReaderはDistributedMapでのみサポート
    return isDistributedMap(state) && !!state.ItemReader
  },

  /** Filter for states with ResultWriter */
  hasResultWriter: (_name: string, state: State, _context: TraversalContext) => {
    return isDistributedMap(state) && !!state.ResultWriter
  },

  /** Filter for Lambda tasks */
  isLambdaTask: (_name: string, state: State, _context: TraversalContext) => {
    return (
      isTask(state) &&
      'Resource' in state &&
      typeof state.Resource === 'string' &&
      state.Resource.includes('lambda:invoke')
    )
  },

  /** Filter for states with Variables/Assign */
  hasVariables: (_name: string, state: State, _context: TraversalContext) => {
    // Assignフィールドの存在を直接チェック
    return 'Assign' in state && !!state.Assign
  },

  /** Filter for DistributedMap states */
  isDistributedMap: (_name: string, state: State, _context: TraversalContext) => {
    // After StateFactory processing, isDistributedMap() is sufficient
    return isDistributedMap(state)
  },

  /** Filter for states using JSONata */
  usesJSONata: (_name: string, state: State, context: TraversalContext) => {
    return state.QueryLanguage === 'JSONata' || !!context.parentIsJSONata
  },
}

/**
 * Get complexity metrics for a state machine
 */
export interface ComplexityMetrics {
  totalStates: number
  mapStates: number
  distributedMapStates: number
  parallelStates: number
  choiceStates: number
  lambdaTasks: number
  maxDepth: number
  hasVariables: boolean
  hasJSONata: boolean
  hasItemReaders: boolean
  hasResultWriters: boolean
}

/**
 * Find a state by name, searching all contexts including nested Map/Parallel states
 */
export function findStateByName(stateMachine: StateMachine, name: string): State | null {
  let found: State | null = null

  traverseStates(stateMachine, (stateName, state) => {
    if (stateName === name) {
      found = state
      return false // Stop traversal
    }
    return undefined
  })

  return found
}

/**
 * Get all state names including nested states in Map/Parallel
 */
export function getAllStateNames(stateMachine: StateMachine): string[] {
  const names: string[] = []

  traverseStates(stateMachine, (stateName) => {
    names.push(stateName)
    return undefined
  })

  return names
}

export function analyzeComplexity(stateMachine: StateMachine): ComplexityMetrics {
  const metrics: ComplexityMetrics = {
    totalStates: 0,
    mapStates: 0,
    distributedMapStates: 0,
    parallelStates: 0,
    choiceStates: 0,
    lambdaTasks: 0,
    maxDepth: 0,
    hasVariables: false,
    hasJSONata: stateMachine.QueryLanguage === 'JSONata',
    hasItemReaders: false,
    hasResultWriters: false,
  }

  traverseStates(stateMachine, (name, state, context) => {
    metrics.totalStates++
    metrics.maxDepth = Math.max(metrics.maxDepth, context.depth)

    // Count state types
    if (StateFilters.isDistributedMap(name, state, context)) {
      metrics.distributedMapStates++
    } else if (isMap(state)) {
      metrics.mapStates++
    } else if (isParallel(state)) {
      metrics.parallelStates++
    } else if (isChoice(state)) {
      metrics.choiceStates++
    } else if (StateFilters.isLambdaTask(name, state, context)) {
      metrics.lambdaTasks++
    }

    // Check for features
    if (StateFilters.hasVariables(name, state, context)) {
      metrics.hasVariables = true
    }
    if (StateFilters.hasItemReader(name, state, context)) {
      metrics.hasItemReaders = true
    }
    if (StateFilters.hasResultWriter(name, state, context)) {
      metrics.hasResultWriters = true
    }
    if (StateFilters.usesJSONata(name, state, context)) {
      metrics.hasJSONata = true
    }
    return undefined
  })

  return metrics
}
