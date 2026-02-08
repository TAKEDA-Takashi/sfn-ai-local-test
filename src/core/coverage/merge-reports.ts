import type { CoverageReport } from './nested-coverage-tracker'

/** 2つのCoverageReportを統合する */
export function mergeCoverageReports(
  existing: CoverageReport,
  incoming: CoverageReport,
): CoverageReport {
  const topLevelTotal = existing.topLevel.total + incoming.topLevel.total
  const topLevelCovered = Math.min(
    existing.topLevel.covered + incoming.topLevel.covered,
    topLevelTotal,
  )

  const branchesTotal = existing.branches.total + incoming.branches.total
  const branchesCovered = Math.min(
    existing.branches.covered + incoming.branches.covered,
    branchesTotal,
  )

  return {
    topLevel: {
      total: topLevelTotal,
      covered: topLevelCovered,
      percentage: topLevelTotal > 0 ? (topLevelCovered / topLevelTotal) * 100 : 100,
      uncovered: deduplicateStrings([
        ...incoming.topLevel.uncovered,
        ...existing.topLevel.uncovered,
      ]),
    },
    nested: {
      ...(existing.nested && typeof existing.nested === 'object' ? existing.nested : {}),
      ...(incoming.nested && typeof incoming.nested === 'object' ? incoming.nested : {}),
    },
    branches: {
      total: branchesTotal,
      covered: branchesCovered,
      percentage: branchesTotal > 0 ? (branchesCovered / branchesTotal) * 100 : 100,
      uncovered: deduplicateStrings([
        ...incoming.branches.uncovered,
        ...existing.branches.uncovered,
      ]),
    },
    paths: {
      total: (existing.paths.total || 0) + (incoming.paths.total || 0),
      unique: (existing.paths.unique || 0) + (incoming.paths.unique || 0),
    },
  }
}

function deduplicateStrings(arr: string[]): string[] {
  return arr.filter((v, i, a) => a.indexOf(v) === i)
}
