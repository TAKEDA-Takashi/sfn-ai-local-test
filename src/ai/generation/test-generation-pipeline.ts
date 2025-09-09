import * as yaml from 'js-yaml'
import type { JsonObject, StateMachine } from '../../types/asl'
import type { MockConfig } from '../../types/mock'
import type { TestSuite } from '../../types/test'
import { StateMachineValidator, type ValidationIssue } from '../validation/state-machine-validator'
import { TestExecutionValidator } from '../validation/test-execution-validator'
import { GenerationRetryManager } from './generation-retry-manager'

type GeneratorFunction = (
  prompt: string,
  stateMachine: StateMachine,
  options?: JsonObject,
) => Promise<string>

interface GenerationOptions {
  stateMachine: StateMachine
  maxAttempts: number
  mockFile?: string
  aslFile?: string
  timeout?: number
  enableExecutionValidation?: boolean
  basePath?: string
  verbose?: boolean
}

interface PipelineResult {
  success: boolean
  content: string
  attempts: number
  staticIssues: ValidationIssue[]
  executionCorrections?: Array<{
    testCase: string
    state: string
    reason: string
    original: unknown
    corrected: unknown
  }>
  error?: string
}

/**
 * テスト生成パイプライン
 * 1. AIでテストケースを生成
 * 2. 静的検証（StateMachineValidator）
 * 3. 実行ベース検証・修正（TestExecutionValidator）
 */
export class TestGenerationPipeline {
  private staticValidator: StateMachineValidator
  private executionValidator: TestExecutionValidator
  private retryManager: GenerationRetryManager

  constructor(generator: GeneratorFunction) {
    this.staticValidator = new StateMachineValidator()
    this.executionValidator = new TestExecutionValidator()
    this.retryManager = new GenerationRetryManager(generator, this.staticValidator)
  }

  async generateTest(
    options: GenerationOptions & { mockConfig: MockConfig },
  ): Promise<PipelineResult> {
    const { stateMachine, mockConfig, enableExecutionValidation = true, basePath } = options

    // Phase 1: AI生成 + 静的検証（GenerationRetryManager使用）
    const generationResult = await this.retryManager.generate({
      ...options,
      type: 'test',
    })

    if (!generationResult.success) {
      return {
        success: false,
        content: generationResult.content,
        attempts: generationResult.attempts,
        staticIssues: generationResult.issues,
        error: generationResult.error,
      }
    }

    // Phase 2: 実行ベース検証・修正（有効な場合）
    if (enableExecutionValidation) {
      try {
        // Parse generated YAML to TestSuite
        const testSuite = yaml.load(generationResult.content) as TestSuite

        // Validate test suite format before execution
        if (!testSuite?.testCases || testSuite.testCases.length === 0) {
          throw new Error('Generated test suite is empty or invalid format')
        }

        // Execute and improve test cases
        const improvedSuite = await this.executionValidator.validateAndImprove(
          stateMachine,
          testSuite,
          mockConfig,
          { basePath },
        )

        // Extract corrections before converting to YAML (don't include in file)
        const { corrections, ...cleanSuite } = improvedSuite

        // Convert improved suite back to YAML
        const improvedContent = yaml.dump(cleanSuite, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
        })

        return {
          success: true,
          content: improvedContent,
          attempts: generationResult.attempts,
          staticIssues: [],
          executionCorrections: corrections,
        }
      } catch (error) {
        // If execution validation fails, return the original generated content
        // Note: This is internal processing info, not an error for the user
        return {
          success: true,
          content: generationResult.content,
          attempts: generationResult.attempts,
          staticIssues: generationResult.issues,
          error: `Execution-based improvement skipped: ${error}`,
        }
      }
    }

    // Return static validated content without execution validation
    return {
      success: true,
      content: generationResult.content,
      attempts: generationResult.attempts,
      staticIssues: generationResult.issues,
    }
  }

  async generateMock(options: GenerationOptions): Promise<PipelineResult> {
    // Mock generation uses only static validation
    const generationResult = await this.retryManager.generate({
      ...options,
      type: 'mock',
    })

    return {
      success: generationResult.success,
      content: generationResult.content,
      attempts: generationResult.attempts,
      staticIssues: generationResult.issues,
      error: generationResult.error,
    }
  }
}
