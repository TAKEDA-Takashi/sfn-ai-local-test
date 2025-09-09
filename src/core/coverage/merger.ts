import type { CoverageData } from './tracker'

export class CoverageMerger {
  /**
   * Merge coverage data from multiple test suites
   */
  static merge(coverageList: CoverageData[]): CoverageData {
    if (coverageList.length === 0) {
      return {
        totalStates: 0,
        coveredStates: new Set(),
        totalBranches: 0,
        coveredBranches: new Set(),
        executionPaths: [],
      }
    }

    if (coverageList.length === 1) {
      const first = coverageList[0]
      if (!first) {
        throw new Error('Unexpected empty coverage list')
      }
      return first
    }

    // Use the maximum totals (in case of different state machines or partial coverage)
    const totalStates = Math.max(...coverageList.map((c) => c.totalStates))
    const totalBranches = Math.max(...coverageList.map((c) => c.totalBranches))

    // Merge covered states
    const coveredStates = new Set<string>()
    for (const coverage of coverageList) {
      for (const state of coverage.coveredStates) {
        coveredStates.add(state)
      }
    }

    // Merge covered branches
    const coveredBranches = new Set<string>()
    for (const coverage of coverageList) {
      for (const branch of coverage.coveredBranches) {
        coveredBranches.add(branch)
      }
    }

    // Merge execution paths
    const executionPaths: string[][] = []
    for (const coverage of coverageList) {
      executionPaths.push(...coverage.executionPaths)
    }

    return {
      totalStates,
      coveredStates,
      totalBranches,
      coveredBranches,
      executionPaths,
    }
  }

  /**
   * Calculate coverage percentages
   */
  static calculatePercentages(coverage: CoverageData): {
    stateCoverage: number
    branchCoverage: number
  } {
    const stateCoverage =
      coverage.totalStates === 0 ? 100 : (coverage.coveredStates.size / coverage.totalStates) * 100

    const branchCoverage =
      coverage.totalBranches === 0
        ? 100
        : (coverage.coveredBranches.size / coverage.totalBranches) * 100

    return {
      stateCoverage,
      branchCoverage,
    }
  }
}
