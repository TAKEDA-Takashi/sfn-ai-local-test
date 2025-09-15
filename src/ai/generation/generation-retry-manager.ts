import {
  FRIENDLY_FEEDBACK_ATTEMPT,
  HTTP_STATUS_OK,
  INITIAL_ERROR_DISPLAY_LIMIT,
  LAMBDA_VERSION_LATEST,
  STRICT_FEEDBACK_ATTEMPT,
  STRICT_VALIDATION_THRESHOLD,
  WARNING_DISPLAY_LIMIT,
} from '../../constants/defaults'
import type { JsonObject, StateMachine } from '../../types/asl'
import type { ValidationIssue } from '../validation/state-machine-validator'
import { TimeoutCalculator } from './timeout-calculator'

interface Validator {
  validateMockContent: (content: string, stateMachine: StateMachine) => ValidationIssue[]
  validateTestContent: (content: string, stateMachine: StateMachine) => ValidationIssue[]
  formatReport: (issues: ValidationIssue[]) => string
}

interface GenerationResult {
  success: boolean
  content: string
  attempts: number
  issues: ValidationIssue[]
  error?: string
  timeoutUsed?: number
}

interface GenerationOptions {
  stateMachine: StateMachine
  maxAttempts: number
  type: 'mock' | 'test'
  mockFile?: string
  aslFile?: string
  retryOnTimeout?: boolean
  timeout?: number
  verbose?: boolean
}

type GeneratorFunction = (
  prompt: string,
  stateMachine: StateMachine,
  options?: JsonObject,
) => Promise<string>

export class GenerationRetryManager {
  private timeoutCalculator: TimeoutCalculator

  constructor(
    private generator: GeneratorFunction,
    private validator: Validator,
  ) {
    this.timeoutCalculator = new TimeoutCalculator()
  }

  async generate(options: GenerationOptions): Promise<GenerationResult> {
    const { stateMachine, maxAttempts, type, mockFile, aslFile, retryOnTimeout = false } = options

    // Calculate dynamic timeout if not provided
    const timeout = this.timeoutCalculator.calculateTimeout(stateMachine, options.timeout)

    let attempts = 0
    let lastContent = ''
    let lastIssues: ValidationIssue[] = []

    while (attempts < maxAttempts) {
      attempts++

      try {
        // Build prompt with feedback from previous attempt
        const prompt = this.buildPromptWithFeedback(type, attempts > 1 ? lastIssues : [], attempts)

        // Generate content with calculated timeout
        lastContent = await this.generator(prompt, stateMachine, {
          mockFile: mockFile || '',
          aslFile: aslFile || '',
          timeout,
          verbose: options.verbose ?? false,
        })

        if (type === 'mock') {
          lastIssues = this.validator.validateMockContent(lastContent, stateMachine)
        } else {
          lastIssues = this.validator.validateTestContent(lastContent, stateMachine)
        }

        const errors = lastIssues.filter((issue) => issue.level === 'error')

        if (errors.length === 0) {
          // No errors, we're done (warnings are acceptable)
          return {
            success: true,
            content: lastContent,
            attempts,
            issues: lastIssues,
            timeoutUsed: timeout,
          }
        }

        // Continue to next attempt if we have errors and haven't reached max attempts
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (retryOnTimeout && errorMessage.includes('timed out') && attempts < maxAttempts) {
          continue
        }

        return {
          success: false,
          content: lastContent,
          attempts,
          issues: lastIssues,
          error: errorMessage,
          timeoutUsed: timeout,
        }
      }
    }

    // Max attempts reached
    return {
      success: false,
      content: lastContent,
      attempts,
      issues: lastIssues,
      timeoutUsed: timeout,
    }
  }

  private buildPromptWithFeedback(
    type: 'mock' | 'test',
    issues: ValidationIssue[],
    attemptNumber: number = 2,
  ): string {
    // Base prompt is handled by the generator function
    // We just need to inject feedback if there are issues

    if (issues.length === 0) {
      return '' // Let generator use its default prompt
    }

    // Progressive feedback: less verbose in early attempts, more detailed in later attempts
    const isDetailedMode = attemptNumber > STRICT_VALIDATION_THRESHOLD

    let feedbackPrompt = '\n\n'

    if (attemptNumber === FRIENDLY_FEEDBACK_ATTEMPT) {
      // First retry: friendly and concise
      feedbackPrompt += '📝 VALIDATION FEEDBACK\n'
      feedbackPrompt += '────────────────────────────\n\n'
      feedbackPrompt += 'Please fix these issues:\n\n'
    } else if (attemptNumber === STRICT_FEEDBACK_ATTEMPT) {
      // Second retry: more emphasis
      feedbackPrompt += '⚠️ IMPORTANT: VALIDATION ISSUES REMAIN\n'
      feedbackPrompt += '═══════════════════════════════════════\n\n'
      feedbackPrompt += 'These issues still need to be fixed:\n\n'
    } else {
      // Third+ retry: critical mode
      feedbackPrompt += '🔴 CRITICAL: MUST FIX THESE VALIDATION ERRORS 🔴\n'
      feedbackPrompt += '═══════════════════════════════════════════════════\n\n'
      feedbackPrompt += 'YOUR OUTPUT STILL HAS THESE ISSUES:\n\n'
    }

    // Group issues by level
    const errors = issues.filter((i) => i.level === 'error')
    const warnings = issues.filter((i) => i.level === 'warning')

    // Prioritize errors over warnings
    if (errors.length > 0) {
      if (isDetailedMode) {
        feedbackPrompt += '❌ ERRORS (MUST FIX):\n'
      } else {
        feedbackPrompt += 'Errors to fix:\n'
      }

      // Show more errors in later attempts
      const errorsToShow =
        attemptNumber === FRIENDLY_FEEDBACK_ATTEMPT
          ? errors.slice(0, INITIAL_ERROR_DISPLAY_LIMIT)
          : errors

      for (const error of errorsToShow) {
        if (isDetailedMode) {
          feedbackPrompt += `  ❌ ERROR: ${error.message}\n`
        } else {
          feedbackPrompt += `  • ${error.message}\n`
        }

        if (error.suggestion) {
          if (isDetailedMode) {
            feedbackPrompt += `     💡 FIX: ${error.suggestion}\n`
          } else {
            feedbackPrompt += `    → ${error.suggestion}\n`
          }
        }
        feedbackPrompt += '\n'
      }

      if (errors.length > errorsToShow.length) {
        feedbackPrompt += `  ... and ${errors.length - errorsToShow.length} more errors\n\n`
      }
    }

    // Only show warnings in later attempts or if no errors
    if (attemptNumber > STRICT_VALIDATION_THRESHOLD && warnings.length > 0 && errors.length === 0) {
      feedbackPrompt += '⚠️ WARNINGS:\n'
      for (const warning of warnings.slice(0, WARNING_DISPLAY_LIMIT)) {
        feedbackPrompt += `  • ${warning.message}\n`
        if (warning.suggestion) {
          feedbackPrompt += `    → ${warning.suggestion}\n`
        }
        feedbackPrompt += '\n'
      }
    }

    // Add specific examples for common issues, but progressively
    if (this.hasLambdaPayloadIssue(issues)) {
      if (attemptNumber === FRIENDLY_FEEDBACK_ATTEMPT) {
        // First retry: brief reminder
        feedbackPrompt +=
          '📌 Remember: Lambda tasks need Payload wrapper in both input and response\n\n'
      } else {
        // Later retries: full example
        feedbackPrompt += this.getLambdaPayloadExample(type)
      }
    }

    if (this.hasMapArrayIssue(issues)) {
      if (attemptNumber === FRIENDLY_FEEDBACK_ATTEMPT) {
        feedbackPrompt += '📌 Remember: Map/DistributedMap states must return arrays\n\n'
      } else {
        feedbackPrompt += this.getMapArrayExample(type)
      }
    }

    if (attemptNumber === FRIENDLY_FEEDBACK_ATTEMPT) {
      feedbackPrompt += 'Please regenerate with these fixes.\n'
    } else if (attemptNumber === STRICT_FEEDBACK_ATTEMPT) {
      feedbackPrompt += '\n🎯 PLEASE CAREFULLY APPLY THESE CORRECTIONS\n'
    } else {
      feedbackPrompt += `\n🔴 THIS IS ATTEMPT #${attemptNumber} - PLEASE FIX ALL ERRORS 🔴\n`
    }

    feedbackPrompt += '────────────────────────────\n\n'

    return feedbackPrompt
  }

  private hasLambdaPayloadIssue(issues: ValidationIssue[]): boolean {
    return issues.some(
      (issue) =>
        issue.message.toLowerCase().includes('payload') ||
        issue.message.toLowerCase().includes('lambda'),
    )
  }

  private hasMapArrayIssue(issues: ValidationIssue[]): boolean {
    return issues.some(
      (issue) =>
        (issue.message.toLowerCase().includes('map') ||
          issue.message.toLowerCase().includes('distributedmap')) &&
        issue.message.toLowerCase().includes('array'),
    )
  }

  private getLambdaPayloadExample(type: 'mock' | 'test'): string {
    if (type === 'mock') {
      return `
📝 CORRECT FORMAT EXAMPLE FOR LAMBDA MOCKS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For Lambda Task with Parameters.Payload:

✅ CORRECT (with Payload wrapper):
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:
            Payload:  # <-- REQUIRED for Lambda!
              userId: "user-001"
        response:
          Payload:    # <-- REQUIRED for Lambda!
            age: 30
            name: "John"
          StatusCode: ${HTTP_STATUS_OK}
          ExecutedVersion: "${LAMBDA_VERSION_LATEST}"

❌ WRONG (missing Payload wrapper):
  - state: "GetUserAge"
    type: "conditional"
    conditions:
      - when:
          input:      # <-- MISSING Payload!
            userId: "user-001"
        response:
          age: 30     # <-- MISSING Payload wrapper!

Remember: If the state has "Resource": "arn:aws:states:::lambda:invoke"
and "Parameters": { "Payload": {...} }, then the mock MUST use input.Payload!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    }

    return ''
  }

  private getMapArrayExample(type: 'mock' | 'test'): string {
    if (type === 'mock') {
      return `
📝 CORRECT FORMAT FOR MAP STATE MOCKS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ CORRECT (returns array):
  - state: "ProcessItems"
    type: "fixed"
    response:  # <-- MUST be an array!
      - processedItem: "item1"
        status: "success"
      - processedItem: "item2"
        status: "success"

❌ WRONG (returns single object):
  - state: "ProcessItems"
    type: "fixed"
    response:  # <-- This is WRONG!
      processedItem: "item1"
      status: "success"

Remember: Map and DistributedMap ALWAYS return arrays!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    }

    if (type === 'test') {
      return `
📝 CORRECT FORMAT FOR MAP STATE EXPECTATIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ CORRECT (expects array):
  stateExpectations:
    - state: "ProcessItems"
      outputMatching: "partial"
      output:  # <-- MUST be an array!
        - itemId: "1"
          result: "processed"
        - itemId: "2"
          result: "processed"

❌ WRONG (expects single object):
  stateExpectations:
    - state: "ProcessItems"
      output:  # <-- This is WRONG!
        result: "success"

Remember: Map states output arrays!

📊 IMPORTANT FOR DISTRIBUTED MAP ProcessedItemCount:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When testing DistributedMap with ItemReader, the ProcessedItemCount 
should match the actual number of items in the test data file.

✅ If test data has 30 lines → ProcessedItemCount: 30
✅ If test data has 5 lines → ProcessedItemCount: 5

❌ Don't hardcode ProcessedItemCount: 3 without checking data size!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    }

    return ''
  }
}
