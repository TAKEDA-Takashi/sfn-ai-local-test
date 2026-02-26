import { describe, expect, it } from 'vitest'
import { findSimilarStateName, levenshteinDistance } from './string-similarity'

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0)
  })

  it('should return string length for empty vs non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3)
    expect(levenshteinDistance('abc', '')).toBe(3)
  })

  it('should return 1 for single character difference', () => {
    expect(levenshteinDistance('abc', 'adc')).toBe(1)
  })

  it('should handle insertion', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1)
  })

  it('should handle deletion', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1)
  })
})

describe('findSimilarStateName', () => {
  it('should find similar state name with small typo', () => {
    const states = ['ProcessOrder', 'ValidatePayment', 'SendNotification']
    expect(findSimilarStateName('ProcessOrdr', states)).toBe('ProcessOrder')
  })

  it('should find similar state name with extra character', () => {
    const states = ['ProcessOrder', 'ValidatePayment']
    expect(findSimilarStateName('ProcessOrders', states)).toBe('ProcessOrder')
  })

  it('should return null when name is too different', () => {
    const states = ['ProcessOrder', 'ValidatePayment']
    expect(findSimilarStateName('CompletelyDifferentName', states)).toBeNull()
  })

  it('should return null for empty states list', () => {
    expect(findSimilarStateName('SomeState', [])).toBeNull()
  })

  it('should be case-insensitive', () => {
    const states = ['ProcessOrder']
    expect(findSimilarStateName('processorder', states)).toBe('ProcessOrder')
  })
})
