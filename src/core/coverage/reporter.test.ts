import { describe, expect, it } from 'vitest'
import type { CoverageReport } from './nested-coverage-tracker.js'
import { CoverageReporter } from './reporter.js'

describe('CoverageReporter', () => {
  const mockCoverageReport: CoverageReport = {
    states: {
      total: 10,
      covered: 8,
      percentage: 80.0,
      uncovered: ['UnusedState1', 'UnusedState2'],
    },
    branches: {
      total: 5,
      covered: 3,
      percentage: 60.0,
      uncovered: ['Choice1->UnusedBranch', 'Choice2->AnotherUnusedBranch'],
    },
    paths: {
      total: 15,
      unique: 8,
    },
    nestedCoverage: {
      MapState: {
        total: 4,
        covered: 3,
        percentage: 75.0,
        uncovered: ['NestedUnusedState'],
      },
      ParallelState: {
        total: 6,
        covered: 6,
        percentage: 100.0,
        uncovered: [],
      },
    },
  }

  const minimalCoverageReport: CoverageReport = {
    states: {
      total: 5,
      covered: 5,
      percentage: 100.0,
      uncovered: [],
    },
    branches: {
      total: 0,
      covered: 0,
      percentage: 100.0,
      uncovered: [],
    },
    paths: {
      total: 3,
      unique: 2,
    },
  }

  describe('generateText', () => {
    it('should generate comprehensive text report with all sections', () => {
      const reporter = new CoverageReporter(mockCoverageReport)
      const result = reporter.generateText()

      // Check header
      expect(result).toContain('📊 State Machine Coverage Report')
      expect(result).toContain('═'.repeat(50))

      // Check states section
      expect(result).toContain('📍 States Coverage:')
      expect(result).toContain('Total: 10')
      expect(result).toContain('Covered: 8')
      expect(result).toContain('80.0%')
      expect(result).toContain('Uncovered: UnusedState1, UnusedState2')

      // Check branches section
      expect(result).toContain('🌿 Branches Coverage:')
      expect(result).toContain('Total: 5')
      expect(result).toContain('Covered: 3')
      expect(result).toContain('60.0%')
      expect(result).toContain('Uncovered: Choice1->UnusedBranch, Choice2->AnotherUnusedBranch')

      // Check paths section
      expect(result).toContain('🛤️  Execution Paths:')
      expect(result).toContain('Total executions: 15')
      expect(result).toContain('Unique paths: 8')

      // Check nested coverage section
      expect(result).toContain('📦 Nested States Coverage:')
      expect(result).toContain('MapState:')
      expect(result).toContain('Total: 4, Covered: 3 (75%)')
      expect(result).toContain('Uncovered: NestedUnusedState')
      expect(result).toContain('ParallelState:')
      expect(result).toContain('Total: 6, Covered: 6 (100%)')
    })

    it('should generate text report without uncovered items', () => {
      const reporter = new CoverageReporter(minimalCoverageReport)
      const result = reporter.generateText()

      expect(result).toContain('📊 State Machine Coverage Report')
      expect(result).toContain('Total: 5')
      expect(result).toContain('Covered: 5')
      expect(result).toContain('100.0%')

      // Should not contain uncovered sections when there are none
      expect(result).not.toContain('Uncovered:')
    })

    it('should generate text report without nested coverage', () => {
      const reportWithoutNested: CoverageReport = {
        ...minimalCoverageReport,
        nestedCoverage: undefined,
      }
      const reporter = new CoverageReporter(reportWithoutNested)
      const result = reporter.generateText()

      expect(result).toContain('📊 State Machine Coverage Report')
      expect(result).not.toContain('📦 Nested States Coverage:')
    })

    it('should handle empty nested coverage object', () => {
      const reportWithEmptyNested: CoverageReport = {
        ...minimalCoverageReport,
        nestedCoverage: {},
      }
      const reporter = new CoverageReporter(reportWithEmptyNested)
      const result = reporter.generateText()

      expect(result).toContain('📊 State Machine Coverage Report')
      // Empty nested coverage object still shows the header but no content
      expect(result).toContain('📦 Nested States Coverage:')
    })

    it('should show progress bars for different percentage ranges', () => {
      // High coverage (green)
      const highCoverage: CoverageReport = {
        states: { total: 10, covered: 9, percentage: 90.0, uncovered: ['One'] },
        branches: { total: 10, covered: 8, percentage: 80.0, uncovered: ['Branch1', 'Branch2'] },
        paths: { total: 5, unique: 3 },
      }

      // Medium coverage (yellow)
      const mediumCoverage: CoverageReport = {
        states: { total: 10, covered: 7, percentage: 70.0, uncovered: ['One', 'Two', 'Three'] },
        branches: { total: 10, covered: 6, percentage: 60.0, uncovered: [] },
        paths: { total: 5, unique: 3 },
      }

      // Low coverage (red)
      const lowCoverage: CoverageReport = {
        states: { total: 10, covered: 4, percentage: 40.0, uncovered: [] },
        branches: { total: 10, covered: 3, percentage: 30.0, uncovered: [] },
        paths: { total: 5, unique: 3 },
      }

      const highReporter = new CoverageReporter(highCoverage)
      const mediumReporter = new CoverageReporter(mediumCoverage)
      const lowReporter = new CoverageReporter(lowCoverage)

      // All should generate text without errors
      expect(highReporter.generateText()).toContain('90.0%')
      expect(mediumReporter.generateText()).toContain('70.0%')
      expect(lowReporter.generateText()).toContain('40.0%')
    })
  })

  describe('generateJSON', () => {
    it('should generate properly formatted JSON', () => {
      const reporter = new CoverageReporter(mockCoverageReport)
      const result = reporter.generateJSON()

      const parsed = JSON.parse(result)
      expect(parsed).toEqual(mockCoverageReport)
    })

    it('should generate JSON with proper indentation', () => {
      const reporter = new CoverageReporter(minimalCoverageReport)
      const result = reporter.generateJSON()

      // Check that it's properly indented (contains newlines and spaces)
      expect(result).toContain('\n')
      expect(result).toContain('  ')
      expect(JSON.parse(result)).toEqual(minimalCoverageReport)
    })
  })

  describe('generateHTML', () => {
    it('should generate complete HTML report', () => {
      const reporter = new CoverageReporter(mockCoverageReport)
      const result = reporter.generateHTML()

      // Check HTML structure
      expect(result).toContain('<!DOCTYPE html>')
      expect(result).toContain('<html lang="en">')
      expect(result).toContain('<head>')
      expect(result).toContain('<meta charset="UTF-8">')
      expect(result).toContain('<title>State Machine Coverage Report</title>')
      expect(result).toContain('</html>')

      // Check CSS styles are included
      expect(result).toContain('<style>')
      expect(result).toContain('font-family:')
      expect(result).toContain('background:')
      expect(result).toContain('progress-bar')

      // Check header section
      expect(result).toContain('📊 State Machine Coverage Report')
      expect(result).toContain('Generated on')

      // Check states coverage section
      expect(result).toContain('📍 States Coverage')
      expect(result).toContain('width: 80%')
      expect(result).toContain('80.0%')
      expect(result).toContain('Total: 10')
      expect(result).toContain('Covered: 8')

      // Check branches coverage section
      expect(result).toContain('🌿 Branches Coverage')
      expect(result).toContain('width: 60%')
      expect(result).toContain('60.0%')
      expect(result).toContain('Total: 5')
      expect(result).toContain('Covered: 3')

      // Check paths section
      expect(result).toContain('🛤️ Execution Paths')
      expect(result).toContain('Total executions: 15')
      expect(result).toContain('Unique paths: 8')
    })

    it('should generate HTML without uncovered sections when none exist', () => {
      const reporter = new CoverageReporter(minimalCoverageReport)
      const result = reporter.generateHTML()

      expect(result).toContain('<!DOCTYPE html>')
      expect(result).toContain('width: 100%')
      expect(result).toContain('100.0%')

      // Should not contain uncovered sections
      expect(result).not.toContain('Uncovered States:')
      expect(result).not.toContain('Uncovered Branches:')
    })

    it('should handle uncovered items in HTML format', () => {
      const reporter = new CoverageReporter(mockCoverageReport)
      const result = reporter.generateHTML()

      expect(result).toContain('Uncovered States:')
      expect(result).toContain('UnusedState1, UnusedState2')
      expect(result).toContain('Uncovered Branches:')
      expect(result).toContain('Choice1->UnusedBranch, Choice2->AnotherUnusedBranch')
    })

    it('should include responsive design elements', () => {
      const reporter = new CoverageReporter(mockCoverageReport)
      const result = reporter.generateHTML()

      expect(result).toContain('meta name="viewport"')
      expect(result).toContain('max-width: 1200px')
      expect(result).toContain('margin: 0 auto')
    })

    it('should include proper date formatting', () => {
      const reporter = new CoverageReporter(mockCoverageReport)
      const result = reporter.generateHTML()

      // Should contain a date (exact format depends on locale)
      expect(result).toMatch(/Generated on \d/)
    })
  })

  describe('edge cases', () => {
    it('should handle zero coverage gracefully', () => {
      const zeroCoverage: CoverageReport = {
        states: {
          total: 10,
          covered: 0,
          percentage: 0.0,
          uncovered: ['All', 'States', 'Uncovered'],
        },
        branches: { total: 5, covered: 0, percentage: 0.0, uncovered: ['All', 'Branches'] },
        paths: { total: 0, unique: 0 },
      }

      const reporter = new CoverageReporter(zeroCoverage)

      const textResult = reporter.generateText()
      expect(textResult).toContain('0.0%')

      const htmlResult = reporter.generateHTML()
      expect(htmlResult).toContain('width: 0%')

      const jsonResult = reporter.generateJSON()
      expect(JSON.parse(jsonResult)).toEqual(zeroCoverage)
    })

    it('should handle maximum coverage', () => {
      const maxCoverage: CoverageReport = {
        states: { total: 20, covered: 20, percentage: 100.0, uncovered: [] },
        branches: { total: 15, covered: 15, percentage: 100.0, uncovered: [] },
        paths: { total: 50, unique: 25 },
        nestedCoverage: {
          PerfectMap: {
            total: 5,
            covered: 5,
            percentage: 100.0,
            uncovered: [],
          },
        },
      }

      const reporter = new CoverageReporter(maxCoverage)

      const textResult = reporter.generateText()
      expect(textResult).toContain('100.0%')

      const htmlResult = reporter.generateHTML()
      expect(htmlResult).toContain('width: 100%')

      expect(JSON.parse(reporter.generateJSON())).toEqual(maxCoverage)
    })
  })
})
