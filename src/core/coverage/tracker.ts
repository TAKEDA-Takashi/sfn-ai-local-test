import type { ChoiceRule, StateMachine } from '../../types/asl.js'

export interface CoverageData {
  totalStates: number
  coveredStates: Set<string>
  totalBranches: number
  coveredBranches: Set<string>
  executionPaths: string[][]
}

export class CoverageTracker {
  private stateMachine: StateMachine
  private coverage: CoverageData

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine
    const states = stateMachine.States || { SingleState: stateMachine }
    this.coverage = {
      totalStates: Object.keys(states).length,
      coveredStates: new Set(),
      totalBranches: this.countBranches(),
      coveredBranches: new Set(),
      executionPaths: [],
    }
  }

  trackExecution(executionPath: string[]): void {
    this.coverage.executionPaths.push(executionPath)

    for (const stateName of executionPath) {
      this.coverage.coveredStates.add(stateName)

      const state = this.stateMachine.States[stateName]
      if (state?.isChoice()) {
        this.trackChoiceBranches(stateName, executionPath)
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

  private countBranches(): number {
    let count = 0
    const states = this.stateMachine.States || { SingleState: this.stateMachine }
    for (const [, state] of Object.entries(states)) {
      if (state.isChoice()) {
        count += state.Choices?.length || 0
        if (state.Default) count++
      }
    }
    return count
  }

  getCoverage(): CoverageReport {
    const statesCoverage = (this.coverage.coveredStates.size / this.coverage.totalStates) * 100
    const branchesCoverage =
      this.coverage.totalBranches > 0
        ? (this.coverage.coveredBranches.size / this.coverage.totalBranches) * 100
        : 100

    return {
      states: {
        total: this.coverage.totalStates,
        covered: this.coverage.coveredStates.size,
        percentage: Math.round(statesCoverage * 100) / 100,
        uncovered: this.getUncoveredStates(),
      },
      branches: {
        total: this.coverage.totalBranches,
        covered: this.coverage.coveredBranches.size,
        percentage: Math.round(branchesCoverage * 100) / 100,
        uncovered: this.getUncoveredBranches(),
      },
      paths: {
        total: this.coverage.executionPaths.length,
        unique: this.getUniquePaths().length,
      },
    }
  }

  private getUncoveredStates(): string[] {
    const uncovered: string[] = []
    const states = this.stateMachine.States || { SingleState: this.stateMachine }
    for (const stateName of Object.keys(states)) {
      if (!this.coverage.coveredStates.has(stateName)) {
        uncovered.push(stateName)
      }
    }
    return uncovered
  }

  private getUncoveredBranches(): string[] {
    const allBranches = new Set<string>()
    const states = this.stateMachine.States || { SingleState: this.stateMachine }

    for (const [stateName, state] of Object.entries(states)) {
      if (state.isChoice()) {
        if (state.Choices) {
          state.Choices.forEach((choice: ChoiceRule) => {
            if (choice.Next) {
              allBranches.add(`${stateName}->${choice.Next}`)
            }
          })
        }
        if (state.Default) {
          allBranches.add(`${stateName}->${state.Default}`)
        }
      }
    }

    const uncovered: string[] = []
    for (const branch of allBranches) {
      if (!this.coverage.coveredBranches.has(branch)) {
        uncovered.push(branch)
      }
    }
    return uncovered
  }

  private getUniquePaths(): string[][] {
    const uniquePaths: string[][] = []
    const pathStrings = new Set<string>()

    for (const path of this.coverage.executionPaths) {
      const pathString = path.join('->')
      if (!pathStrings.has(pathString)) {
        pathStrings.add(pathString)
        uniquePaths.push(path)
      }
    }

    return uniquePaths
  }
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
}
