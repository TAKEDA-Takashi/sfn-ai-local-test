import { describe, expect, it } from 'vitest'
import { mergeCoverageReports } from './merge-reports'
import type { CoverageReport } from './nested-coverage-tracker'

describe('mergeCoverageReports', () => {
  const baseReport: CoverageReport = {
    topLevel: { total: 5, covered: 3, percentage: 60, uncovered: ['State4', 'State5'] },
    nested: {},
    branches: { total: 4, covered: 2, percentage: 50, uncovered: ['Branch3', 'Branch4'] },
    paths: { total: 3, unique: 2 },
  }

  it('既存レポートとincomingレポートを正しくマージできること', () => {
    const incoming: CoverageReport = {
      topLevel: { total: 5, covered: 2, percentage: 40, uncovered: ['State3', 'State4'] },
      nested: {},
      branches: { total: 4, covered: 1, percentage: 25, uncovered: ['Branch2', 'Branch3'] },
      paths: { total: 2, unique: 1 },
    }

    const result = mergeCoverageReports(baseReport, incoming)

    expect(result.topLevel.total).toBe(10)
    expect(result.topLevel.covered).toBe(5)
    expect(result.topLevel.percentage).toBe(50)

    expect(result.branches.total).toBe(8)
    expect(result.branches.covered).toBe(3)

    expect(result.paths.total).toBe(5)
    expect(result.paths.unique).toBe(3)
  })

  it('covered が total を超えないこと', () => {
    const existing: CoverageReport = {
      topLevel: { total: 3, covered: 3, percentage: 100, uncovered: [] },
      nested: {},
      branches: { total: 2, covered: 2, percentage: 100, uncovered: [] },
      paths: { total: 1, unique: 1 },
    }

    const incoming: CoverageReport = {
      topLevel: { total: 3, covered: 3, percentage: 100, uncovered: [] },
      nested: {},
      branches: { total: 2, covered: 2, percentage: 100, uncovered: [] },
      paths: { total: 1, unique: 1 },
    }

    const result = mergeCoverageReports(existing, incoming)

    // total = 6, covered = min(6, 6) = 6
    expect(result.topLevel.covered).toBeLessThanOrEqual(result.topLevel.total)
    expect(result.branches.covered).toBeLessThanOrEqual(result.branches.total)
  })

  it('uncovered の重複が排除されること', () => {
    const incoming: CoverageReport = {
      topLevel: {
        total: 5,
        covered: 2,
        percentage: 40,
        uncovered: ['State4', 'State5'], // State4 は baseReport にも存在
      },
      nested: {},
      branches: {
        total: 4,
        covered: 1,
        percentage: 25,
        uncovered: ['Branch4', 'Branch3'], // Branch4 は baseReport にも存在
      },
      paths: { total: 1, unique: 1 },
    }

    const result = mergeCoverageReports(baseReport, incoming)

    // 重複は排除されるべき
    expect(result.topLevel.uncovered).toEqual(expect.arrayContaining(['State4', 'State5']))
    const topLevelUnique = new Set(result.topLevel.uncovered)
    expect(topLevelUnique.size).toBe(result.topLevel.uncovered.length)

    const branchesUnique = new Set(result.branches.uncovered)
    expect(branchesUnique.size).toBe(result.branches.uncovered.length)
  })

  it('nested カバレッジが浅いマージされること', () => {
    const existing: CoverageReport = {
      topLevel: { total: 5, covered: 3, percentage: 60, uncovered: [] },
      nested: {
        MapState1: { total: 3, covered: 2, percentage: 66.7, uncovered: ['Inner3'] },
      },
      branches: { total: 2, covered: 1, percentage: 50, uncovered: [] },
      paths: { total: 1, unique: 1 },
    }

    const incoming: CoverageReport = {
      topLevel: { total: 5, covered: 2, percentage: 40, uncovered: [] },
      nested: {
        MapState2: {
          total: 4,
          covered: 1,
          percentage: 25,
          uncovered: ['InnerA', 'InnerB', 'InnerC'],
        },
      },
      branches: { total: 2, covered: 1, percentage: 50, uncovered: [] },
      paths: { total: 1, unique: 1 },
    }

    const result = mergeCoverageReports(existing, incoming)

    // 両方のnestedが含まれる（浅いマージ）
    expect(result.nested.MapState1).toBeDefined()
    expect(result.nested.MapState2).toBeDefined()
    expect(result.nested.MapState1.covered).toBe(2)
    expect(result.nested.MapState2.covered).toBe(1)
  })

  it('nested が undefined やオブジェクトでない場合でもマージできること', () => {
    const existing: CoverageReport = {
      topLevel: { total: 3, covered: 1, percentage: 33.3, uncovered: [] },
      nested: {} as CoverageReport['nested'],
      branches: { total: 1, covered: 0, percentage: 0, uncovered: [] },
      paths: { total: 1, unique: 1 },
    }

    const incoming: CoverageReport = {
      topLevel: { total: 3, covered: 2, percentage: 66.7, uncovered: [] },
      nested: {
        ParallelState: { total: 2, covered: 1, percentage: 50, uncovered: ['Branch2'] },
      },
      branches: { total: 1, covered: 1, percentage: 100, uncovered: [] },
      paths: { total: 1, unique: 1 },
    }

    const result = mergeCoverageReports(existing, incoming)

    expect(result.nested.ParallelState).toBeDefined()
  })

  it('total が 0 の場合 percentage が 100 になること', () => {
    const existing: CoverageReport = {
      topLevel: { total: 0, covered: 0, percentage: 100, uncovered: [] },
      nested: {},
      branches: { total: 0, covered: 0, percentage: 100, uncovered: [] },
      paths: { total: 0, unique: 0 },
    }

    const incoming: CoverageReport = {
      topLevel: { total: 0, covered: 0, percentage: 100, uncovered: [] },
      nested: {},
      branches: { total: 0, covered: 0, percentage: 100, uncovered: [] },
      paths: { total: 0, unique: 0 },
    }

    const result = mergeCoverageReports(existing, incoming)

    expect(result.topLevel.percentage).toBe(100)
    expect(result.branches.percentage).toBe(100)
  })
})
