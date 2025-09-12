import { describe, expect, it } from 'vitest'
import type { TestCase } from '../../schemas/test-schema'
import type { ExecutionResult } from '../interpreter/executor'
import { TestAssertions } from './assertions'

describe('Path matching modes', () => {
  describe('exact matching (default)', () => {
    it('should use exact matching by default', () => {
      const testCase: TestCase = {
        name: 'Default matching test',
        input: {},
        expectedPath: ['Start', 'Process', 'End'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'Process', 'Middle', 'End'],
        success: true,
      }

      // No settings provided - should default to exact
      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(false) // Should fail with exact matching
      expect(assertions[0].message).toContain('Path mismatch:')
      expect(assertions[0].message).toContain('Common: [Start → Process]')
      expect(assertions[0].message).toContain('- Expected: End')
      expect(assertions[0].message).toContain('+ Actual:   Middle → End')
    })

    it('should show proper diff for exact matching failure', () => {
      const testCase: TestCase = {
        name: 'Exact matching test',
        input: {},
        expectedPath: ['Start', 'ValidateInput', 'ProcessData', 'SendNotification', 'End'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: [
          'Start',
          'ValidateInput',
          'ProcessData',
          'HandleError',
          'Retry',
          'ProcessData',
          'SendNotification',
          'End',
        ],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'exact',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(false)

      const message = assertions[0].message
      console.log('\n=== Exact matching diff ===')
      console.log(message)
      console.log('===========================\n')

      expect(message).toContain('Path divergence:')
      expect(message).toContain('Common: [Start → ValidateInput → ProcessData]')
      expect(message).toContain('- Expected: SendNotification → End')
      expect(message).toContain(
        '+ Actual:   HandleError → Retry → ProcessData → SendNotification → End',
      )
    })
  })

  describe('includes matching (single array)', () => {
    it('should find sequence when states are consecutive', () => {
      const testCase: TestCase = {
        name: 'Sequence test',
        input: {},
        expectedPath: ['ProcessData', 'SendNotification'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'ValidateInput', 'ProcessData', 'SendNotification', 'End'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(true)
    })

    it('should fail when states are not in order', () => {
      const testCase: TestCase = {
        name: 'Sequence failure test',
        input: {},
        expectedPath: ['SendNotification', 'ProcessData'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: [
          'Start',
          'ValidateInput',
          'ProcessData',
          'HandleError',
          'SendNotification',
          'End',
        ],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(false)

      const message = assertions[0].message
      console.log('\n=== Sequence matching failure ===')
      console.log(message)
      console.log('=================================\n')

      expect(message).toContain('Sequence not found:')
      expect(message).toContain('Looking for: [SendNotification → ProcessData]')
    })

    it('should fail when states are not consecutive', () => {
      const testCase: TestCase = {
        name: 'Non-consecutive test',
        input: {},
        expectedPath: ['ProcessData', 'SendNotification'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: [
          'Start',
          'ValidateInput',
          'ProcessData',
          'HandleError', // This breaks the sequence
          'SendNotification',
          'End',
        ],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(false)

      const message = assertions[0].message
      console.log('\n=== Non-consecutive sequence failure ===')
      console.log(message)
      console.log('========================================\n')

      expect(message).toContain('Sequence not found:')
      expect(message).toContain('[ProcessData → SendNotification]')
    })

    it('should handle single state in includes mode', () => {
      const testCase: TestCase = {
        name: 'Single state sequence',
        input: {},
        expectedPath: ['ProcessData'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'ValidateInput', 'ProcessData', 'End'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(true)
    })
  })

  describe('includes matching (multiple sequences with AND condition)', () => {
    it('should validate all sequences are present', () => {
      const testCase: TestCase = {
        name: 'Sequence test',
        input: {},
        expectedPath: [
          ['Initialize', 'Validate'],
          ['ProcessMain', 'Transform', 'Store'],
          ['Cleanup', 'Complete'],
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: [
          'Start',
          'Initialize',
          'Validate',
          'CheckCondition',
          'ProcessMain',
          'Transform',
          'Store',
          'SendNotification',
          'Cleanup',
          'Complete',
          'End',
        ],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(true)
      expect(assertions[0].message).toBe('All specified sequences found in execution path')
    })

    it('should fail when some sequences are missing', () => {
      const testCase: TestCase = {
        name: 'Sequence failure test',
        input: {},
        expectedPath: [
          ['Initialize', 'Validate'],
          ['ProcessMain', 'Transform', 'Store'],
          ['Cleanup', 'Complete'],
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: [
          'Start',
          'Initialize',
          'Validate',
          'CheckCondition',
          'ProcessMain',
          'HandleError', // Transform is missing
          'Store',
          'SendNotification',
          'Cleanup',
          'Complete',
          'End',
        ],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })

      expect(assertions).toHaveLength(1)
      expect(assertions[0].passed).toBe(false)

      const message = assertions[0].message
      console.log('\n=== Sequence matching failure ===')
      console.log(message)
      console.log('=================================\n')

      expect(message).toContain('Multiple sequences validation failed:')
      expect(message).toContain('Found sequences:')
      expect(message).toContain('✓ [Initialize → Validate]')
      expect(message).toContain('✓ [Cleanup → Complete]')
      expect(message).toContain('Missing sequences:')
      expect(message).toContain('✗ [ProcessMain → Transform → Store]')
    })
  })
})
