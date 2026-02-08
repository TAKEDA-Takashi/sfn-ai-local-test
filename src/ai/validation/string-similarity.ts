/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    if (matrix[0]) {
      matrix[0][j] = j
    }
  }

  for (let i = 1; i <= b.length; i++) {
    const currentRow = matrix[i]
    const prevRow = matrix[i - 1]
    if (!(currentRow && prevRow)) continue

    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        currentRow[j] = prevRow[j - 1] ?? 0
      } else {
        currentRow[j] = Math.min(
          (prevRow[j - 1] ?? 0) + 1, // substitution
          (currentRow[j - 1] ?? 0) + 1, // insertion
          (prevRow[j] ?? 0) + 1, // deletion
        )
      }
    }
  }

  const lastRow = matrix[b.length]
  return lastRow?.[a.length] ?? 0
}

/**
 * Find the most similar state name using Levenshtein distance
 */
export function findSimilarStateName(input: string, availableStates: string[]): string | null {
  let minDistance = Number.POSITIVE_INFINITY
  let closestMatch: string | null = null

  for (const state of availableStates) {
    const distance = levenshteinDistance(input.toLowerCase(), state.toLowerCase())

    // If distance is small relative to string length, consider it similar
    if (distance < minDistance && distance <= Math.max(input.length, state.length) * 0.3) {
      minDistance = distance
      closestMatch = state
    }
  }

  return closestMatch
}
