import { describe, expect, it } from 'vitest'
import { CoverageMerger } from './merger'
import type { CoverageData } from './tracker'

describe('CoverageMerger', () => {
  describe('mergeCoverage', () => {
    it('should merge coverage data from multiple test suites', () => {
      const coverage1: CoverageData = {
        totalStates: 5,
        coveredStates: new Set(['State1', 'State2']),
        totalBranches: 3,
        coveredBranches: new Set(['State1->State2']),
        executionPaths: [['State1', 'State2']],
      }

      const coverage2: CoverageData = {
        totalStates: 5,
        coveredStates: new Set(['State2', 'State3']),
        totalBranches: 3,
        coveredBranches: new Set(['State2->State3']),
        executionPaths: [['State2', 'State3']],
      }

      const merged = CoverageMerger.merge([coverage1, coverage2])

      expect(merged.totalStates).toBe(5) // Same state machine, so same total
      expect(merged.coveredStates.size).toBe(3) // State1, State2, State3
      expect(merged.coveredStates.has('State1')).toBe(true)
      expect(merged.coveredStates.has('State2')).toBe(true)
      expect(merged.coveredStates.has('State3')).toBe(true)

      expect(merged.totalBranches).toBe(3) // Same state machine, so same total
      expect(merged.coveredBranches.size).toBe(2) // Two different branches
      expect(merged.coveredBranches.has('State1->State2')).toBe(true)
      expect(merged.coveredBranches.has('State2->State3')).toBe(true)

      expect(merged.executionPaths).toHaveLength(2)
    })

    it('should handle empty coverage list', () => {
      const merged = CoverageMerger.merge([])

      expect(merged.totalStates).toBe(0)
      expect(merged.coveredStates.size).toBe(0)
      expect(merged.totalBranches).toBe(0)
      expect(merged.coveredBranches.size).toBe(0)
      expect(merged.executionPaths).toHaveLength(0)
    })

    it('should handle single coverage data', () => {
      const coverage: CoverageData = {
        totalStates: 3,
        coveredStates: new Set(['State1']),
        totalBranches: 2,
        coveredBranches: new Set(['State1->State2']),
        executionPaths: [['State1', 'State2']],
      }

      const merged = CoverageMerger.merge([coverage])

      expect(merged).toEqual(coverage)
    })

    it('should merge execution paths from all coverage data', () => {
      const coverage1: CoverageData = {
        totalStates: 4,
        coveredStates: new Set(['A', 'B']),
        totalBranches: 2,
        coveredBranches: new Set(['A->B']),
        executionPaths: [
          ['A', 'B'],
          ['A', 'B', 'End'],
        ],
      }

      const coverage2: CoverageData = {
        totalStates: 4,
        coveredStates: new Set(['A', 'C']),
        totalBranches: 2,
        coveredBranches: new Set(['A->C']),
        executionPaths: [['A', 'C', 'End']],
      }

      const merged = CoverageMerger.merge([coverage1, coverage2])

      expect(merged.executionPaths).toHaveLength(3)
      expect(merged.executionPaths).toContainEqual(['A', 'B'])
      expect(merged.executionPaths).toContainEqual(['A', 'B', 'End'])
      expect(merged.executionPaths).toContainEqual(['A', 'C', 'End'])
    })

    it('should use the maximum totalStates and totalBranches when merging different state machines', () => {
      const coverage1: CoverageData = {
        totalStates: 5,
        coveredStates: new Set(['State1']),
        totalBranches: 3,
        coveredBranches: new Set(['Branch1']),
        executionPaths: [],
      }

      const coverage2: CoverageData = {
        totalStates: 7, // Different state machine with more states
        coveredStates: new Set(['State2']),
        totalBranches: 5, // More branches
        coveredBranches: new Set(['Branch2']),
        executionPaths: [],
      }

      const merged = CoverageMerger.merge([coverage1, coverage2])

      expect(merged.totalStates).toBe(7) // Use maximum
      expect(merged.totalBranches).toBe(5) // Use maximum
    })
  })

  describe('calculatePercentages', () => {
    it('should calculate state and branch coverage percentages', () => {
      const coverage: CoverageData = {
        totalStates: 10,
        coveredStates: new Set(['S1', 'S2', 'S3', 'S4', 'S5']),
        totalBranches: 8,
        coveredBranches: new Set(['B1', 'B2', 'B3', 'B4']),
        executionPaths: [],
      }

      const percentages = CoverageMerger.calculatePercentages(coverage)

      expect(percentages.stateCoverage).toBe(50) // 5/10 = 50%
      expect(percentages.branchCoverage).toBe(50) // 4/8 = 50%
    })

    it('should handle zero totals', () => {
      const coverage: CoverageData = {
        totalStates: 0,
        coveredStates: new Set(),
        totalBranches: 0,
        coveredBranches: new Set(),
        executionPaths: [],
      }

      const percentages = CoverageMerger.calculatePercentages(coverage)

      expect(percentages.stateCoverage).toBe(100) // No states means 100% covered
      expect(percentages.branchCoverage).toBe(100) // No branches means 100% covered
    })
  })
})
