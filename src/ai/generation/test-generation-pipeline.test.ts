import { describe, expect, it, vi } from 'vitest'
import type { MockConfig } from '../../types/mock'
import { StateFactory } from '../../types/state-factory'
import { TestGenerationPipeline } from './test-generation-pipeline'

// Mock dependencies
const mockGenerator = vi.fn()

describe('TestGenerationPipeline', () => {
  describe('corrections field handling', () => {
    it('should exclude corrections field from YAML output', async () => {
      const pipeline = new TestGenerationPipeline(mockGenerator)

      // Mock the retry manager to return a successful generation
      const mockGenerationResult = {
        success: true,
        content: `version: '1.0'
name: Test Suite
testCases:
  - name: Test Case 1
    input: {}
    expectedOutput: {}`,
        attempts: 1,
        issues: [],
      }

      // Mock the generation retry manager
      const mockGenerate = vi.spyOn((pipeline as any).retryManager, 'generate')
      mockGenerate.mockResolvedValue(mockGenerationResult)

      // Mock the execution validator to return corrections
      const mockValidateAndImprove = vi.spyOn(
        (pipeline as any).executionValidator,
        'validateAndImprove',
      )
      mockValidateAndImprove.mockResolvedValue({
        version: '1.0',
        name: 'Test Suite',
        stateMachine: 'test-state-machine',
        testCases: [
          {
            name: 'Test Case 1',
            input: {},
            expectedOutput: {},
          },
        ],
        corrections: [
          {
            testCase: 'Test Case 1',
            state: 'SomeState',
            reason: 'Output mismatch',
            original: { old: 'value' },
            corrected: { new: 'value' },
          },
        ],
      })

      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test',
        StartAt: 'Pass',
        States: {
          Pass: { Type: 'Pass', End: true },
        },
      })

      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const result = await pipeline.generateTest({
        stateMachine,
        mockConfig,
        maxAttempts: 1,
        enableExecutionValidation: true,
      })

      // Verify that the result is successful
      expect(result.success).toBe(true)

      // Verify that corrections are returned in the pipeline result
      expect(result.executionCorrections).toEqual([
        {
          testCase: 'Test Case 1',
          state: 'SomeState',
          reason: 'Output mismatch',
          original: { old: 'value' },
          corrected: { new: 'value' },
        },
      ])

      // Most importantly: verify that corrections field is NOT in the YAML content
      expect(result.content).not.toContain('corrections:')

      // Verify the YAML content structure looks correct
      expect(result.content).toContain("version: '1.0'")
      expect(result.content).toContain('name: Test Suite')
      expect(result.content).toContain('testCases:')
      expect(result.content).toContain('- name: Test Case 1')
    })

    it('should handle execution validation disabled', async () => {
      const pipeline = new TestGenerationPipeline(mockGenerator)

      const mockGenerationResult = {
        success: true,
        content: 'version: 1.0\nname: Test\ntestCases: []',
        attempts: 1,
        issues: [],
      }

      const mockGenerate = vi.spyOn((pipeline as any).retryManager, 'generate')
      mockGenerate.mockResolvedValue(mockGenerationResult)

      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test',
        StartAt: 'Pass',
        States: {
          Pass: { Type: 'Pass', End: true },
        },
      })

      const mockConfig: MockConfig = {
        version: '1.0',
        mocks: [],
      }

      const result = await pipeline.generateTest({
        stateMachine,
        mockConfig,
        maxAttempts: 1,
        enableExecutionValidation: false,
      })

      expect(result.success).toBe(true)
      expect(result.executionCorrections).toBeUndefined()
      expect(result.content).not.toContain('corrections:')
    })
  })
})
