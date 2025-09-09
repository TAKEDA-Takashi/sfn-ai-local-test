/**
 * Nested Coverage Tracker that includes nested states in Map/Parallel
 */

import type { ChoiceState, MapState, StateMachine } from '../../types/asl.js'
import type { State } from '../../types/state-classes.js'

// Basic state type guard

interface CoverageData {
  totalStates: number
  coveredStates: Set<string>
  totalBranches: number
  coveredBranches: Set<string>
  executionPaths: string[][]
  nestedStates: Map<string, Set<string>> // Track coverage of nested states
}

export interface CoverageReport {
  states: {
    total: number
    covered: number
    percentage: number
    uncovered: string[]
  }
  branches: {
    total: number
    covered: number
    percentage: number
    uncovered: string[]
  }
  paths: {
    total: number
    unique: number
  }
  nestedCoverage?: {
    [parentState: string]: {
      total: number
      covered: number
      percentage: number
      uncovered: string[]
    }
  }
}

export class NestedCoverageTracker {
  private stateMachine: StateMachine
  private coverage: CoverageData
  private nestedStateMachines: Map<string, StateMachine> = new Map()

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine

    // Initialize coverage structure first
    this.coverage = {
      totalStates: 0,
      coveredStates: new Set(),
      totalBranches: 0,
      coveredBranches: new Set(),
      executionPaths: [],
      nestedStates: new Map(),
    }

    // Count all states including nested ones
    const { totalStates, totalBranches } = this.countAllStates()

    // Update counts
    this.coverage.totalStates = totalStates
    this.coverage.totalBranches = totalBranches
  }

  /**
   * Count all states including those nested in Map/Parallel states
   */
  private countAllStates(): { totalStates: number; totalBranches: number } {
    let totalStates = 0
    let totalBranches = 0

    const states = this.stateMachine.States || { SingleState: this.stateMachine }

    const countStatesRecursively = (stateMap: Record<string, State>, _parentPath = ''): void => {
      for (const [stateName, stateData] of Object.entries(stateMap)) {
        totalStates++
        // const fullPath = parentPath ? `${parentPath}.${stateName}` : stateName

        const state = stateData as State

        // Count branches for Choice states
        if (state.isChoice()) {
          totalBranches += (state.Choices?.length || 0) + (state.Default ? 1 : 0)
        }

        // Handle Map states with ItemProcessor or Iterator
        if (state.isMap()) {
          const processor = state.ItemProcessor
          if (processor?.States) {
            // Store nested state machine for later tracking
            this.nestedStateMachines.set(stateName, processor as StateMachine)
            // Initialize nested coverage tracking
            this.coverage.nestedStates.set(stateName, new Set())
            // Count nested states
            countStatesRecursively(processor.States as Record<string, State>, stateName)
          } else if ('Iterator' in state && state.Iterator) {
            const iterator = (state as MapState & { Iterator?: StateMachine }).Iterator
            if (iterator?.States) {
              // Store nested state machine for later tracking
              this.nestedStateMachines.set(stateName, iterator)
              // Initialize nested coverage tracking
              this.coverage.nestedStates.set(stateName, new Set())
              // Count nested states
              countStatesRecursively(iterator.States as Record<string, State>, stateName)
            }
          }
        }

        // Handle Parallel states with branches
        if (state.isParallel()) {
          if (state.Branches) {
            for (let i = 0; i < state.Branches.length; i++) {
              const branch = state.Branches[i]
              if (branch?.States) {
                // Store nested state machine
                const branchName = `${stateName}[${i}]`
                this.nestedStateMachines.set(branchName, branch)
                this.coverage.nestedStates.set(branchName, new Set())
                // Count nested states
                countStatesRecursively(branch.States as Record<string, State>, branchName)
              }
            }
          }
        }
      }
    }

    countStatesRecursively(states as Record<string, State>)

    return { totalStates, totalBranches }
  }

  /**
   * Track execution including nested state executions
   */
  trackExecution(executionPath: string[], nestedPaths?: Map<string, string[][]>): void {
    // Track top-level execution path
    this.coverage.executionPaths.push(executionPath)

    for (const stateName of executionPath) {
      this.coverage.coveredStates.add(stateName)

      const state = this.stateMachine.States?.[stateName]
      if (state && typeof state === 'object') {
        if (state.isChoice()) {
          this.trackChoiceBranches(stateName, executionPath)
        }
      }
    }

    // Track nested executions (from Map/Parallel states)
    if (nestedPaths) {
      for (const [parentState, paths] of nestedPaths.entries()) {
        const nestedCoverage = this.coverage.nestedStates.get(parentState)
        if (nestedCoverage) {
          for (const path of paths) {
            for (const nestedStateName of path) {
              nestedCoverage.add(nestedStateName)
              // Also add to overall covered states with qualified name
              this.coverage.coveredStates.add(`${parentState}.${nestedStateName}`)
            }
          }
        }
      }
    }
  }

  /**
   * Track from map execution metadata
   */
  trackMapExecutions(
    mapExecutions?: Array<{
      state: string
      iterationPaths?: string[][]
    }>,
  ): void {
    if (!mapExecutions) return

    for (const mapExec of mapExecutions) {
      const nestedCoverage = this.coverage.nestedStates.get(mapExec.state)
      if (nestedCoverage && mapExec.iterationPaths) {
        for (const path of mapExec.iterationPaths) {
          for (const stateName of path) {
            nestedCoverage.add(stateName)
            // Add with qualified name
            this.coverage.coveredStates.add(`${mapExec.state}.${stateName}`)

            // Track Choice branches in nested states
            const nestedStateMachine = this.nestedStateMachines.get(mapExec.state)
            const nestedRawState = nestedStateMachine?.States?.[stateName]
            if (nestedRawState && typeof nestedRawState === 'object') {
              const nestedState = nestedRawState as State
              if (nestedState.isChoice()) {
                this.trackNestedChoiceBranches(mapExec.state, stateName, path)
              }
            }
          }
        }
      }
    }
  }

  /**
   * Track from parallel execution metadata
   */
  trackParallelExecutions(
    parallelExecutions?: Array<{
      type: string
      state: string
      branchCount: number
      branchPaths: string[][]
    }>,
  ): void {
    if (!parallelExecutions) return

    for (const parallelExec of parallelExecutions) {
      // Track each branch's executed states
      for (let i = 0; i < parallelExec.branchPaths.length; i++) {
        const branchPath = parallelExec.branchPaths[i]
        if (!branchPath) continue

        const branchKey = `${parallelExec.state}[${i}]`
        const nestedCoverage = this.coverage.nestedStates.get(branchKey)

        if (nestedCoverage) {
          for (const stateName of branchPath) {
            nestedCoverage.add(stateName)
            // Add with qualified name
            this.coverage.coveredStates.add(`${branchKey}.${stateName}`)

            // Track Choice branches in nested states
            const nestedStateMachine = this.nestedStateMachines.get(branchKey)
            const nestedState = nestedStateMachine?.States?.[stateName]
            if (nestedState && typeof nestedState === 'object') {
              if (nestedState.isChoice()) {
                this.trackNestedChoiceBranches(branchKey, stateName, branchPath)
              }
            }
          }
        }
      }
    }
  }

  private trackChoiceBranches(choiceStateName: string, executionPath: string[]): void {
    const index = executionPath.indexOf(choiceStateName)
    if (index >= 0 && index < executionPath.length - 1) {
      const nextState = executionPath[index + 1]
      const branchId = `${choiceStateName}->${nextState}`
      this.coverage.coveredBranches.add(branchId)
    }
  }

  private trackNestedChoiceBranches(
    parentState: string,
    choiceStateName: string,
    executionPath: string[],
  ): void {
    const index = executionPath.indexOf(choiceStateName)
    if (index >= 0 && index < executionPath.length - 1) {
      const nextState = executionPath[index + 1]
      const branchId = `${parentState}.${choiceStateName}->${nextState}`
      this.coverage.coveredBranches.add(branchId)
    }
  }

  getCoverage(): CoverageReport {
    const statesCoverage = (this.coverage.coveredStates.size / this.coverage.totalStates) * 100

    // Get uncovered branches to calculate correct coverage
    const uncoveredBranches = this.getUncoveredBranches()
    const actualCoveredBranches = this.coverage.totalBranches - uncoveredBranches.length

    // Debug: Log the values to understand the issue
    if (process.env.DEBUG_COVERAGE) {
      console.log('DEBUG Coverage calculation:')
      console.log('  totalBranches:', this.coverage.totalBranches)
      console.log('  coveredBranches.size:', this.coverage.coveredBranches.size)
      console.log('  uncoveredBranches.length:', uncoveredBranches.length)
      console.log('  actualCoveredBranches:', actualCoveredBranches)
      console.log('  uncoveredBranches:', uncoveredBranches)
    }

    const branchesCoverage =
      this.coverage.totalBranches > 0
        ? (actualCoveredBranches / this.coverage.totalBranches) * 100
        : 100

    // Build nested coverage report
    const nestedCoverage: CoverageReport['nestedCoverage'] = {}

    for (const [parentState, nestedStates] of this.coverage.nestedStates.entries()) {
      const nestedStateMachine = this.nestedStateMachines.get(parentState)
      if (nestedStateMachine?.States) {
        const totalNested = Object.keys(nestedStateMachine.States).length
        const coveredNested = nestedStates.size
        const uncoveredNested = Object.keys(nestedStateMachine.States).filter(
          (s) => !nestedStates.has(s),
        )

        nestedCoverage[parentState] = {
          total: totalNested,
          covered: coveredNested,
          percentage:
            totalNested > 0 ? Math.round((coveredNested / totalNested) * 10000) / 100 : 100,
          uncovered: uncoveredNested,
        }
      }
    }

    return {
      states: {
        total: this.coverage.totalStates,
        covered: this.coverage.coveredStates.size,
        percentage: Math.round(statesCoverage * 100) / 100,
        uncovered: this.getUncoveredStates(),
      },
      branches: {
        total: this.coverage.totalBranches,
        covered: actualCoveredBranches,
        percentage: Math.round(branchesCoverage * 100) / 100,
        uncovered: uncoveredBranches,
      },
      paths: {
        total: this.coverage.executionPaths.length,
        unique: this.getUniquePaths().length,
      },
      nestedCoverage: Object.keys(nestedCoverage).length > 0 ? nestedCoverage : undefined,
    }
  }

  private getUncoveredStates(): string[] {
    const uncovered: string[] = []

    // Check top-level states
    const states = this.stateMachine.States || { SingleState: this.stateMachine }
    for (const stateName of Object.keys(states)) {
      if (!this.coverage.coveredStates.has(stateName)) {
        uncovered.push(stateName)
      }
    }

    // Check nested states
    for (const [parentState, nestedStateMachine] of this.nestedStateMachines.entries()) {
      if (nestedStateMachine?.States) {
        // const nestedCoverage = this.coverage.nestedStates.get(parentState) || new Set()
        for (const nestedStateName of Object.keys(nestedStateMachine.States)) {
          const qualifiedName = `${parentState}.${nestedStateName}`
          if (!this.coverage.coveredStates.has(qualifiedName)) {
            uncovered.push(qualifiedName)
          }
        }
      }
    }

    return uncovered
  }

  private getUncoveredBranches(): string[] {
    const uncovered: string[] = []

    // Check top-level choice branches
    const states = this.stateMachine.States || {}
    for (const [stateName, state] of Object.entries(states)) {
      if (state.isChoice()) {
        // Check each choice branch
        if (state.Choices) {
          for (let i = 0; i < state.Choices.length; i++) {
            const choice = state.Choices[i]
            const branchId = `${stateName}->${choice?.Next}`
            if (!this.coverage.coveredBranches.has(branchId)) {
              uncovered.push(branchId)
            }
          }
        }
        // Check default branch
        if (state.Default) {
          const branchId = `${stateName}->${state.Default}`
          if (!this.coverage.coveredBranches.has(branchId)) {
            uncovered.push(branchId)
          }
        }
      }
    }

    // Check nested choice branches
    for (const [parentState, nestedStateMachine] of this.nestedStateMachines.entries()) {
      if (nestedStateMachine?.States) {
        for (const [stateName, stateData] of Object.entries(nestedStateMachine.States)) {
          const stateObj = stateData as State
          if (stateObj.isChoice()) {
            const choiceState = stateObj as ChoiceState
            if (choiceState.Choices) {
              for (const choice of choiceState.Choices) {
                const branchId = `${parentState}.${stateName}->${choice.Next}`
                if (!this.coverage.coveredBranches.has(branchId)) {
                  uncovered.push(branchId)
                }
              }
            }
            if (choiceState.Default) {
              const branchId = `${parentState}.${stateName}->${choiceState.Default}`
              if (!this.coverage.coveredBranches.has(branchId)) {
                uncovered.push(branchId)
              }
            }
          }
        }
      }
    }

    return uncovered
  }

  private getUniquePaths(): string[][] {
    const uniquePathsSet = new Set(this.coverage.executionPaths.map((p) => p.join('->')))
    return Array.from(uniquePathsSet).map((p) => p.split('->'))
  }
}
