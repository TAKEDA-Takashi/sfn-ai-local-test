import type { ValidationIssue } from './state-machine-validator'

/**
 * Format validation issues into a human-readable report
 */
export function formatReport(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return '✅ No issues found!'
  }

  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const info = issues.filter((i) => i.level === 'info')

  let report = ''

  if (errors.length > 0) {
    report += `❌ Errors (${errors.length}):\n`
    for (const error of errors) {
      report += `  - ${error.message}\n`
      if (error.suggestion) {
        report += `    💡 ${error.suggestion}\n`
      }
    }
    report += '\n'
  }

  if (warnings.length > 0) {
    report += `⚠️ Warnings (${warnings.length}):\n`
    for (const warning of warnings) {
      report += `  - ${warning.message}\n`
      if (warning.suggestion) {
        report += `    💡 ${warning.suggestion}\n`
      }
    }
    report += '\n'
  }

  if (info.length > 0) {
    report += `ℹ️ Info (${info.length}):\n`
    for (const item of info) {
      report += `  - ${item.message}\n`
    }
  }

  return report
}
