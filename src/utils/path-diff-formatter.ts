export class PathDiffFormatter {
  /**
   * Format path difference for exact matching
   */
  static formatExactDiff(expected: string[], actual: string[]): string {
    const maxLength = Math.max(expected.length, actual.length)
    const lines: string[] = []

    // Find first difference
    let firstDiff = -1
    for (let i = 0; i < maxLength; i++) {
      if (expected[i] !== actual[i]) {
        firstDiff = i
        break
      }
    }

    if (firstDiff === -1) {
      return 'Paths are identical'
    }

    lines.push('Path divergence:')

    // Show common prefix if exists
    if (firstDiff > 0) {
      lines.push(`  Common: [${expected.slice(0, firstDiff).join(' → ')}]`)
    }

    // Show where paths diverge
    lines.push(`  Then:`)

    // Expected path continuation
    if (firstDiff < expected.length) {
      lines.push(`    - Expected: ${expected.slice(firstDiff).join(' → ')}`)
    } else {
      lines.push(`    - Expected: (end of path)`)
    }

    // Actual path continuation
    if (firstDiff < actual.length) {
      lines.push(`    + Actual:   ${actual.slice(firstDiff).join(' → ')}`)
    } else {
      lines.push(`    + Actual:   (end of path)`)
    }

    // Show length difference if any
    if (expected.length !== actual.length) {
      lines.push(`  Length: Expected ${expected.length} states, Actual ${actual.length} states`)
    }

    return lines.join('\n')
  }

  /**
   * Format path difference for sequence/includes matching
   */
  static formatSequenceDiff(expected: string[], actual: string[]): string {
    const lines: string[] = []

    // Check if sequence exists
    const sequenceIndex = PathDiffFormatter.findSequence(expected, actual)

    if (sequenceIndex !== -1) {
      lines.push('Sequence found:')
      lines.push(`  At position ${sequenceIndex}: [${expected.join(' → ')}]`)
      return lines.join('\n')
    }

    // Sequence not found - show partial matches
    lines.push('Sequence not found:')
    lines.push(`  Looking for: [${expected.join(' → ')}]`)
    lines.push(`  In path:     [${actual.join(' → ')}]`)

    // Find partial matches
    const partialMatches = PathDiffFormatter.findPartialMatches(expected, actual)
    if (partialMatches.length > 0) {
      lines.push(`  Partial matches found:`)
      for (const match of partialMatches) {
        lines.push(`    - "${match.state}" at position ${match.position}`)
      }
    } else {
      lines.push(`  No matching states found`)
    }

    return lines.join('\n')
  }

  private static findSequence(sequence: string[], path: string[]): number {
    for (let i = 0; i <= path.length - sequence.length; i++) {
      let match = true
      for (let j = 0; j < sequence.length; j++) {
        if (path[i + j] !== sequence[j]) {
          match = false
          break
        }
      }
      if (match) return i
    }
    return -1
  }

  private static findPartialMatches(
    expected: string[],
    actual: string[],
  ): Array<{ state: string; position: number }> {
    const matches: Array<{ state: string; position: number }> = []

    for (const state of expected) {
      const position = actual.indexOf(state)
      if (position !== -1) {
        matches.push({ state, position })
      }
    }

    return matches.sort((a, b) => a.position - b.position)
  }
}
