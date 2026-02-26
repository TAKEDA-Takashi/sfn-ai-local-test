import { describe, expect, it } from 'vitest'
import type { ValidationIssue } from './state-machine-validator'
import { formatReport } from './validation-report'

describe('formatReport', () => {
  it('should return success message when no issues', () => {
    expect(formatReport([])).toBe('✅ No issues found!')
  })

  it('should format errors with suggestions', () => {
    const issues: ValidationIssue[] = [
      { level: 'error', message: 'State not found', suggestion: 'Check state name' },
    ]
    const report = formatReport(issues)
    expect(report).toContain('❌ Errors (1)')
    expect(report).toContain('State not found')
    expect(report).toContain('💡 Check state name')
  })

  it('should format warnings', () => {
    const issues: ValidationIssue[] = [{ level: 'warning', message: 'Missing StatusCode' }]
    const report = formatReport(issues)
    expect(report).toContain('⚠️ Warnings (1)')
    expect(report).toContain('Missing StatusCode')
  })

  it('should format info messages', () => {
    const issues: ValidationIssue[] = [
      { level: 'info', message: 'Consider adding more test cases' },
    ]
    const report = formatReport(issues)
    expect(report).toContain('ℹ️ Info (1)')
    expect(report).toContain('Consider adding more test cases')
  })

  it('should format mixed issue types', () => {
    const issues: ValidationIssue[] = [
      { level: 'error', message: 'Error message' },
      { level: 'warning', message: 'Warning message' },
      { level: 'info', message: 'Info message' },
    ]
    const report = formatReport(issues)
    expect(report).toContain('❌ Errors (1)')
    expect(report).toContain('⚠️ Warnings (1)')
    expect(report).toContain('ℹ️ Info (1)')
  })
})
