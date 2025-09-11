/**
 * Nested Coverage Tracker that includes nested states in Map/Parallel
 */

import type { StateMachine } from '../../types/asl.js'
import { hasIterator } from '../../types/type-guards.js'

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
  topLevel: {
    total: number
    covered: number
    percentage: number
    uncovered: string[]
  }
  nested: {
    [parentState: string]: {
      total: number
      covered: number
      percentage: number
      uncovered: string[]
    }
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
   * Count only top-level states (hierarchical approach)
   */
  private countAllStates(): { totalStates: number; totalBranches: number } {
    let totalStates = 0
    let totalBranches = 0

    const states = this.stateMachine.States || { SingleState: this.stateMachine }

    // Count only top-level states
    for (const [stateName, stateData] of Object.entries(states)) {
      totalStates++
      // stateData is already typed as State from the Record<string, State>
      const state = stateData

      // Count branches for Choice states
      if (state.isChoice()) {
        totalBranches += (state.Choices?.length || 0) + (state.Default ? 1 : 0)
      }

      // Handle Map states with ItemProcessor or Iterator
      if (state.isMap()) {
        const processor = state.ItemProcessor
        if (processor?.States) {
          // ItemProcessor already has StartAt and States, compatible with StateMachine
          this.nestedStateMachines.set(stateName, processor)
          // Initialize nested coverage tracking
          this.coverage.nestedStates.set(stateName, new Set())
        } else if (hasIterator(state)) {
          // hasIterator type guard ensures Iterator has StartAt and States
          const iterator = state.Iterator
          // Store nested state machine for later tracking (Iterator is compatible with StateMachine)
          this.nestedStateMachines.set(stateName, iterator)
          // Initialize nested coverage tracking
          this.coverage.nestedStates.set(stateName, new Set())
        }
      }

      // Handle DistributedMap states
      if (state.isDistributedMap()) {
        const processor = state.ItemProcessor
        if (processor?.States) {
          // ItemProcessor already has StartAt and States, compatible with StateMachine
          this.nestedStateMachines.set(stateName, processor)
          this.coverage.nestedStates.set(stateName, new Set())
        }
      }

      // Handle Parallel states
      if (state.isParallel()) {
        const branches = state.Branches
        if (branches) {
          // Initialize nested coverage for each branch
          this.coverage.nestedStates.set(stateName, new Set())
          // Store branches as nested state machines
          for (let i = 0; i < branches.length; i++) {
            const branch = branches[i]
            const branchKey = `${stateName}[${i}]`
            // branch is already typed as StateMachine from Branches: StateMachine[]
            this.nestedStateMachines.set(branchKey, branch)
            this.coverage.nestedStates.set(branchKey, new Set())
          }
        }
      }
    }

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
              // Don't add nested states to overall covered states
              // They are tracked separately in nestedStates
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
            // Don't add nested states to overall covered states
            // They are tracked separately in nestedStates

            // Track Choice branches in nested states
            const nestedStateMachine = this.nestedStateMachines.get(mapExec.state)
            const nestedRawState = nestedStateMachine?.States?.[stateName]
            if (nestedRawState && typeof nestedRawState === 'object') {
              // nestedRawState is already a State instance from StateMachine.States
              if (nestedRawState.isChoice()) {
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
            // Don't add nested states to overall covered states
            // They are tracked separately in nestedStates

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
    const uncoveredTopLevelBranches = this.getUncoveredTopLevelBranches()
    const uncoveredAllBranches = this.getUncoveredBranches()
    const actualCoveredBranches = this.coverage.totalBranches - uncoveredTopLevelBranches.length

    // Debug: Log the values to understand the issue
    if (process.env.DEBUG_COVERAGE) {
      console.log('DEBUG Coverage calculation:')
      console.log('  totalBranches:', this.coverage.totalBranches)
      console.log('  coveredBranches.size:', this.coverage.coveredBranches.size)
      console.log('  uncoveredTopLevelBranches.length:', uncoveredTopLevelBranches.length)
      console.log('  uncoveredAllBranches.length:', uncoveredAllBranches.length)
      console.log('  actualCoveredBranches:', actualCoveredBranches)
      console.log('  uncoveredTopLevelBranches:', uncoveredTopLevelBranches)
    }

    const branchesCoverage =
      this.coverage.totalBranches > 0
        ? (actualCoveredBranches / this.coverage.totalBranches) * 100
        : 100

    // Build nested coverage report (hierarchical)
    const nested: CoverageReport['nested'] = {}

    for (const [parentState, nestedStates] of this.coverage.nestedStates.entries()) {
      const nestedStateMachine = this.nestedStateMachines.get(parentState)
      if (nestedStateMachine?.States) {
        const totalNested = Object.keys(nestedStateMachine.States).length
        const coveredNested = nestedStates.size
        const uncoveredNested = Object.keys(nestedStateMachine.States).filter(
          (s) => !nestedStates.has(s),
        )

        nested[parentState] = {
          total: totalNested,
          covered: coveredNested,
          percentage:
            totalNested > 0 ? Math.round((coveredNested / totalNested) * 10000) / 100 : 100,
          uncovered: uncoveredNested,
        }
      }
    }

    return {
      topLevel: {
        total: this.coverage.totalStates,
        covered: this.coverage.coveredStates.size,
        percentage: Math.round(statesCoverage * 100) / 100,
        uncovered: this.getUncoveredStates(),
      },
      nested,
      branches: {
        total: this.coverage.totalBranches,
        covered: actualCoveredBranches,
        percentage: Math.round(branchesCoverage * 100) / 100,
        uncovered: uncoveredTopLevelBranches,
      },
      paths: {
        total: this.coverage.executionPaths.length,
        unique: this.getUniquePaths().length,
      },
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
        const nestedCoverage = this.coverage.nestedStates.get(parentState) || new Set()
        for (const nestedStateName of Object.keys(nestedStateMachine.States)) {
          if (!nestedCoverage.has(nestedStateName)) {
            uncovered.push(`${parentState}.${nestedStateName}`)
          }
        }
      }
    }

    return uncovered
  }

  private getUncoveredBranches(): string[] {
    return this.getUncoveredTopLevelBranches().concat(this.getUncoveredNestedBranches())
  }

  private getUncoveredTopLevelBranches(): string[] {
    const uncovered: string[] = []

    // Check top-level choice branches only
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

    return uncovered
  }

  private getUncoveredNestedBranches(): string[] {
    const uncovered: string[] = []

    // Check nested choice branches
    for (const [parentState, nestedStateMachine] of this.nestedStateMachines.entries()) {
      if (nestedStateMachine?.States) {
        for (const [stateName, stateData] of Object.entries(nestedStateMachine.States)) {
          const stateObj = stateData
          if (stateObj.isChoice()) {
            // stateObj.isChoice() is a type predicate, so stateObj is now ChoiceState
            if (stateObj.Choices) {
              for (const choice of stateObj.Choices) {
                const branchId = `${parentState}.${stateName}->${choice.Next}`
                if (!this.coverage.coveredBranches.has(branchId)) {
                  uncovered.push(branchId)
                }
              }
            }
            if (stateObj.Default) {
              const branchId = `${parentState}.${stateName}->${stateObj.Default}`
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
