import type { JsonObject, JsonValue } from '../types/asl'

interface DiffResult {
  added: JsonObject
  removed: JsonObject
  changed: Record<string, { expected: unknown; actual: unknown }>
  unchanged: JsonObject
}

export class DiffFormatter {
  /**
   * Compare two JSON objects and return human-readable diff
   */
  static formatJsonDiff(expected: JsonValue, actual: JsonValue): string {
    if (typeof expected !== 'object' || typeof actual !== 'object') {
      // Simple values
      return `Expected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`
    }

    if (Array.isArray(expected) || Array.isArray(actual)) {
      return DiffFormatter.formatArrayDiff(expected as unknown[], actual as unknown[])
    }

    const diff = DiffFormatter.computeObjectDiff(expected as JsonObject, actual as JsonObject)

    return DiffFormatter.formatObjectDiff(diff)
  }

  private static computeObjectDiff(expected: JsonObject, actual: JsonObject): DiffResult {
    const diff: DiffResult = {
      added: {},
      removed: {},
      changed: {},
      unchanged: {},
    }

    const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)])

    for (const key of allKeys) {
      const expectedValue = expected[key]
      const actualValue = actual[key]

      if (!(key in expected)) {
        diff.added[key] = actualValue
      } else if (!(key in actual)) {
        diff.removed[key] = expectedValue
      } else if (JSON.stringify(expectedValue) !== JSON.stringify(actualValue)) {
        diff.changed[key] = { expected: expectedValue, actual: actualValue }
      } else {
        diff.unchanged[key] = actualValue
      }
    }

    return diff
  }

  private static formatObjectDiff(diff: DiffResult): string {
    const lines: string[] = []

    // Show changes first (most important)
    if (Object.keys(diff.changed).length > 0) {
      lines.push('Changed fields:')
      for (const [key, values] of Object.entries(diff.changed)) {
        lines.push(`  ${key}:`)
        lines.push(`    - Expected: ${JSON.stringify(values.expected)}`)
        lines.push(`    + Actual:   ${JSON.stringify(values.actual)}`)
      }
    }

    // Show missing fields
    if (Object.keys(diff.removed).length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('Missing fields (in actual):')
      for (const [key, value] of Object.entries(diff.removed)) {
        lines.push(`  - ${key}: ${JSON.stringify(value)}`)
      }
    }

    // Show extra fields
    if (Object.keys(diff.added).length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('Extra fields (in actual):')
      for (const [key, value] of Object.entries(diff.added)) {
        lines.push(`  + ${key}: ${JSON.stringify(value)}`)
      }
    }

    // Optionally show unchanged fields (for context)
    if (Object.keys(diff.unchanged).length > 0 && Object.keys(diff.unchanged).length <= 5) {
      if (lines.length > 0) lines.push('')
      lines.push('Unchanged fields:')
      for (const key of Object.keys(diff.unchanged)) {
        lines.push(`    ${key}`)
      }
    }

    return lines.join('\n')
  }

  private static formatArrayDiff(expected: unknown[], actual: unknown[]): string {
    const lines: string[] = []
    const maxLength = Math.max(expected.length, actual.length)

    lines.push(`Array length: Expected ${expected.length}, Actual ${actual.length}`)

    for (let i = 0; i < maxLength; i++) {
      if (i >= expected.length) {
        lines.push(`  [${i}] + ${JSON.stringify(actual[i])} (extra)`)
      } else if (i >= actual.length) {
        lines.push(`  [${i}] - ${JSON.stringify(expected[i])} (missing)`)
      } else if (JSON.stringify(expected[i]) !== JSON.stringify(actual[i])) {
        lines.push(`  [${i}]:`)
        lines.push(`    - Expected: ${JSON.stringify(expected[i])}`)
        lines.push(`    + Actual:   ${JSON.stringify(actual[i])}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Create a compact one-line diff for simple cases
   */
  static formatCompactDiff(expected: JsonValue, actual: JsonValue): string {
    if (typeof expected !== 'object' || typeof actual !== 'object') {
      return `${JSON.stringify(expected)} → ${JSON.stringify(actual)}`
    }

    const expectedObj = expected as JsonObject
    const actualObj = actual as JsonObject
    const diff = DiffFormatter.computeObjectDiff(expectedObj, actualObj)

    if (Object.keys(diff.changed).length === 0) {
      if (Object.keys(diff.added).length > 0) {
        return `Added: ${Object.keys(diff.added).join(', ')}`
      }
      if (Object.keys(diff.removed).length > 0) {
        return `Missing: ${Object.keys(diff.removed).join(', ')}`
      }
    }

    const changes: string[] = []
    for (const [key, values] of Object.entries(diff.changed)) {
      changes.push(`${key}: ${JSON.stringify(values.expected)} → ${JSON.stringify(values.actual)}`)
    }

    return changes.join(', ')
  }
}
