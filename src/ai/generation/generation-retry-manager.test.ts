import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HTTP_STATUS_OK } from '../../constants/defaults'
import { StateFactory } from '../../types/state-factory'
import { StateMachineValidator, type ValidationIssue } from '../validation/state-machine-validator'
import { GenerationRetryManager } from './generation-retry-manager'

// バリデータの動作をコントロールしてテスト
vi.mock('../validation/state-machine-validator')

describe('GenerationRetryManager', () => {
  let retryManager: GenerationRetryManager
  let mockGenerator: ReturnType<typeof vi.fn>
  let mockValidator: StateMachineValidator

  beforeEach(() => {
    vi.clearAllMocks()

    mockGenerator = vi.fn()
    mockValidator = new StateMachineValidator()
    retryManager = new GenerationRetryManager(mockGenerator, mockValidator)
  })

  describe('basic generation cycle', () => {
    it('should succeed on first attempt if no validation issues', async () => {
      const goodContent = `version: "1.0"
mocks:
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:
            Payload:
              userId: "user-001"
        response:
          Payload:
            age: 30
          StatusCode: ${HTTP_STATUS_OK}`

      mockGenerator.mockResolvedValueOnce(goodContent)
      vi.spyOn(mockValidator, 'validateMockContent').mockReturnValue([])

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'GetUserAge',
          States: {
            GetUserAge: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
            },
          },
        }),
        maxAttempts: 3,
        type: 'mock',
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(result.content).toBe(goodContent)
      expect(result.issues).toEqual([])
      expect(mockGenerator).toHaveBeenCalledTimes(1)
    })

    it('should retry with feedback on validation issues', async () => {
      const badContent = `version: "1.0"
mocks:
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:
            userId: "user-001"
        response:
          Payload:
            age: 30
          StatusCode: ${HTTP_STATUS_OK}`

      const goodContent = `version: "1.0"
mocks:
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:
            Payload:
              userId: "user-001"
        response:
          Payload:
            age: 30
          StatusCode: ${HTTP_STATUS_OK}`

      const validationIssues: ValidationIssue[] = [
        {
          level: 'error',
          message: 'Conditional mock for Lambda "GetUserAge" should use input.Payload structure',
          suggestion: 'Wrap condition in { input: { Payload: {...} } }',
        },
      ]

      mockGenerator
        .mockResolvedValueOnce(badContent) // First attempt fails
        .mockResolvedValueOnce(goodContent) // Second attempt succeeds

      vi.spyOn(mockValidator, 'validateMockContent')
        .mockReturnValueOnce(validationIssues) // First validation fails
        .mockReturnValueOnce([]) // Second validation passes

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'GetUserAge',
          States: {
            GetUserAge: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
            },
          },
        }),
        maxAttempts: 3,
        type: 'mock',
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(result.content).toBe(goodContent)

      // フィードバックが正しく含まれているか検証
      expect(mockGenerator).toHaveBeenCalledTimes(2)
      const secondCallArgs = mockGenerator.mock.calls[1]?.[0]
      expect(secondCallArgs).toContain('VALIDATION FEEDBACK')
      expect(secondCallArgs).toContain('input.Payload structure')
    })

    it('should stop after max attempts even with issues', async () => {
      const badContent = `version: "1.0"
mocks:
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:
            userId: "user-001"`

      const validationIssues: ValidationIssue[] = [
        {
          level: 'error',
          message: 'Missing Payload wrapper',
          suggestion: 'Add Payload wrapper',
        },
      ]

      mockGenerator.mockResolvedValue(badContent)
      vi.spyOn(mockValidator, 'validateMockContent').mockReturnValue(validationIssues)

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'GetUserAge',
          States: {
            GetUserAge: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
            },
          },
        }),
        maxAttempts: 2,
        type: 'mock',
      })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(2)
      expect(result.content).toBe(badContent)
      expect(result.issues).toEqual(validationIssues)
      expect(mockGenerator).toHaveBeenCalledTimes(2)
    })

    it('should consider warnings as acceptable if no errors', async () => {
      const contentWithWarnings = `version: "1.0"
mocks:
  - state: "GetUserAge"
    type: "fixed"
    response:
      Payload:
        age: 30
      StatusCode: ${HTTP_STATUS_OK}`

      const warningIssues: ValidationIssue[] = [
        {
          level: 'warning',
          message: 'Consider using conditional mock for more flexibility',
          suggestion: 'Use conditional type instead of fixed',
        },
      ]

      mockGenerator.mockResolvedValueOnce(contentWithWarnings)
      vi.spyOn(mockValidator, 'validateMockContent').mockReturnValue(warningIssues)

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'GetUserAge',
          States: {
            GetUserAge: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
            },
          },
        }),
        maxAttempts: 3,
        type: 'mock',
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(result.content).toBe(contentWithWarnings)
      expect(result.issues).toEqual(warningIssues)
      expect(mockGenerator).toHaveBeenCalledTimes(1)
    })
  })

  describe('feedback injection', () => {
    it('should format validation feedback clearly', async () => {
      const issues: ValidationIssue[] = [
        {
          level: 'error',
          message: 'Lambda mock missing Payload wrapper',
          suggestion: `Wrap in { Payload: {...}, StatusCode: ${HTTP_STATUS_OK} }`,
        },
        {
          level: 'error',
          message: 'Conditional mock input needs Payload',
          suggestion: 'Use { input: { Payload: {...} } }',
        },
      ]

      mockGenerator.mockResolvedValueOnce('bad content').mockResolvedValueOnce('good content')

      vi.spyOn(mockValidator, 'validateMockContent')
        .mockReturnValueOnce(issues)
        .mockReturnValueOnce([])

      await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'Start',
          States: {},
        }),
        maxAttempts: 2,
        type: 'mock',
      })

      const secondCallPrompt = mockGenerator.mock.calls[1]?.[0]
      // 初回リトライはフレンドリーなメッセージで修正を促す
      expect(secondCallPrompt).toContain('Lambda mock missing Payload wrapper')
      expect(secondCallPrompt).toContain(
        `Wrap in { Payload: {...}, StatusCode: ${HTTP_STATUS_OK} }`,
      )
      expect(secondCallPrompt).toContain('Conditional mock input needs Payload')
      expect(secondCallPrompt).toContain('Use { input: { Payload: {...} } }')
    })

    it('should include example corrections in feedback', async () => {
      const badContent = `version: "1.0"
mocks:
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:
            userId: "test"`

      mockGenerator.mockResolvedValueOnce(badContent).mockResolvedValueOnce('corrected content')

      vi.spyOn(mockValidator, 'validateMockContent')
        .mockReturnValueOnce([
          {
            level: 'error',
            message: 'Missing Payload wrapper',
            suggestion: 'Add Payload wrapper',
          },
        ])
        .mockReturnValueOnce([])

      await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'GetUserAge',
          States: {
            GetUserAge: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
            },
          },
        }),
        maxAttempts: 2,
        type: 'mock',
      })

      const secondCallPrompt = mockGenerator.mock.calls[1]?.[0]
      expect(secondCallPrompt).toContain('VALIDATION FEEDBACK')
      expect(secondCallPrompt).toContain('Remember: Lambda tasks need Payload wrapper')
    })
  })

  describe('test generation cycle', () => {
    it('should handle test generation with proper validation', async () => {
      const testContent = `version: "1.0"
name: "Test Suite"
stateMachine: "./workflow.asl.json"
baseMock: "./mock.yaml"
testCases:
  - name: "Test case"
    input:
      userId: "001"
    expectedOutput:
      result: "success"`

      mockGenerator.mockResolvedValueOnce(testContent)
      vi.spyOn(mockValidator, 'validateTestContent').mockReturnValue([])

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'Start',
          States: {},
        }),
        maxAttempts: 3,
        type: 'test',
        mockFile: './mock.yaml',
        aslFile: './workflow.asl.json',
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(result.content).toBe(testContent)
      expect(mockValidator.validateTestContent).toHaveBeenCalledWith(testContent, {
        QueryLanguage: 'JSONPath',
        StartAt: 'Start',
        States: {},
      })
    })
  })

  describe('early termination', () => {
    it('should stop if generation throws an error', async () => {
      mockGenerator.mockRejectedValueOnce(new Error('API timeout'))

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'Start',
          States: {},
        }),
        maxAttempts: 3,
        type: 'mock',
      })

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(1)
      expect(result.error).toBe('API timeout')
      expect(mockGenerator).toHaveBeenCalledTimes(1)
    })

    it('should handle timeout errors gracefully', async () => {
      mockGenerator
        .mockRejectedValueOnce(new Error('Claude CLI timed out'))
        .mockResolvedValueOnce('good content')

      vi.spyOn(mockValidator, 'validateMockContent').mockReturnValue([])

      const result = await retryManager.generate({
        stateMachine: StateFactory.createStateMachine({
          QueryLanguage: 'JSONPath' as const,
          StartAt: 'Start',
          States: {},
        }),
        maxAttempts: 3,
        type: 'mock',
        retryOnTimeout: true,
      })

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
      expect(mockGenerator).toHaveBeenCalledTimes(2)
    })
  })
})
