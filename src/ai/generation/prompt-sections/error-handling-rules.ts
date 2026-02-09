/**
 * Error handling (Catch/Retry) rules for mock and test generation
 */

import { HTTP_STATUS_OK } from '../../../constants/defaults'

interface CatchInfo {
  stateName: string
  errorTypes: string[]
  hasRetry: boolean
  maxRetryAttempts: number
}

export function getErrorHandlingMockRules(catchInfos: CatchInfo[]): string {
  const sections: string[] = []

  sections.push(`## Error Handling Mock Rules (Catch/Retry)

### How Catch/Retry Works in Step Functions
1. **Retry executes FIRST** - If a task fails and has Retry, it retries before Catch activates
2. **Catch activates AFTER all retries fail** - Only when Retry exhausts all attempts
3. **ErrorEquals matching** - The error \`type\` in your mock must match the \`ErrorEquals\` array in the Catch handler

### Mocking Error Paths with Conditional Mocks

To test error handling paths, use the \`error\` field inside conditional mock rules:

\`\`\`yaml
- state: "TaskWithCatch"
  type: "conditional"
  conditions:
    # Trigger a specific error to test Catch handler
    - when:
        input:
          Payload:
            action: "fail"
      error:
        type: "CustomError"         # MUST match ErrorEquals value
        cause: "Simulated failure"
        message: "Error details"
    # Normal success case
    - default:
        Payload:
          result: "success"
        StatusCode: ${HTTP_STATUS_OK}
\`\`\`

### ⚠️ CRITICAL: error.type Must Match ErrorEquals

The \`error.type\` value in your mock MUST exactly match one of the \`ErrorEquals\` values in the Catch handler:

\`\`\`json
// ASL Catch definition
"Catch": [
  { "ErrorEquals": ["InsufficientFundsError"], "Next": "HandleFunds" },
  { "ErrorEquals": ["States.ALL"], "Next": "HandleGeneral" }
]
\`\`\`

\`\`\`yaml
# ✅ CORRECT: type matches ErrorEquals
error:
  type: "InsufficientFundsError"  # Matches exactly
  cause: "Not enough balance"

# ❌ WRONG: type doesn't match any ErrorEquals
error:
  type: "SomeOtherError"  # Won't be caught correctly
\`\`\`

### Common Error Types
- \`States.ALL\` - Catches all errors (wildcard)
- \`States.TaskFailed\` - Task execution failure
- \`States.Timeout\` - Task timeout
- \`Lambda.ServiceException\` - Lambda service error
- Custom error types (e.g., \`InsufficientFundsError\`, \`ValidationError\`)`)

  // Add state-specific guidance
  if (catchInfos.length > 0) {
    sections.push('')
    sections.push('### States with Error Handling in This State Machine')
    sections.push('')

    for (const info of catchInfos) {
      sections.push(`**${info.stateName}:**`)
      sections.push(`- Catches: ${info.errorTypes.map((e) => `\`${e}\``).join(', ')}`)
      if (info.hasRetry) {
        sections.push(
          `- Has Retry (max ${info.maxRetryAttempts} attempts) - errors trigger Catch only after retries are exhausted`,
        )
      }
      sections.push(
        `- To test error paths, create conditional mock with \`error.type\` matching one of: ${info.errorTypes.map((e) => `\`${e}\``).join(', ')}`,
      )
      sections.push('')
    }
  }

  return sections.join('\n')
}

export function getErrorHandlingTestRules(catchInfos: CatchInfo[]): string {
  const sections: string[] = []

  sections.push(`## Testing Error Handling Paths

### How to Test Catch Handlers
Use \`mockOverrides\` with \`error\` field to force error paths in specific test cases:

\`\`\`yaml
testCases:
  # Test the normal success path
  - name: "Success path"
    input: { action: "process" }
    expectedPath: ["TaskWithCatch", "SuccessHandler"]

  # Test an error path via Catch
  - name: "Error handling path"
    input: { action: "fail" }
    expectedPath: ["TaskWithCatch", "ErrorHandler"]
    mockOverrides:
      - state: "TaskWithCatch"
        type: "error"
        error:
          type: "CustomError"
          cause: "Test failure"
\`\`\`

### Testing Multiple Error Types
Create separate test cases for each error type to verify all Catch branches:

\`\`\`yaml
testCases:
  - name: "Specific error type A"
    input: { trigger: "errorA" }
    expectedPath: ["ProcessTask", "HandleErrorA"]
    mockOverrides:
      - state: "ProcessTask"
        type: "error"
        error:
          type: "ErrorTypeA"

  - name: "Specific error type B"
    input: { trigger: "errorB" }
    expectedPath: ["ProcessTask", "HandleErrorB"]
    mockOverrides:
      - state: "ProcessTask"
        type: "error"
        error:
          type: "ErrorTypeB"

  - name: "Catch-all error"
    input: { trigger: "unknown" }
    expectedPath: ["ProcessTask", "HandleGeneral"]
    mockOverrides:
      - state: "ProcessTask"
        type: "error"
        error:
          type: "States.TaskFailed"
\`\`\``)

  if (catchInfos.length > 0) {
    sections.push('')
    sections.push('### Error Paths Available in This State Machine')
    sections.push('')
    for (const info of catchInfos) {
      sections.push(`**${info.stateName}** can trigger these error types:`)
      for (const errorType of info.errorTypes) {
        sections.push(`- \`${errorType}\``)
      }
      sections.push('')
    }
  }

  return sections.join('\n')
}

/**
 * Extract Catch/Retry information from a state machine's states
 */
export function extractCatchInfo(
  states: Record<
    string,
    { Catch?: Array<{ ErrorEquals: string[] }>; Retry?: Array<{ MaxAttempts?: number }> }
  >,
): CatchInfo[] {
  const catchInfos: CatchInfo[] = []

  for (const [stateName, state] of Object.entries(states)) {
    if (state.Catch && state.Catch.length > 0) {
      const errorTypes = new Set<string>()
      for (const catchRule of state.Catch) {
        for (const errorType of catchRule.ErrorEquals) {
          errorTypes.add(errorType)
        }
      }

      const retryRules = state.Retry ?? []
      const hasRetry = retryRules.length > 0
      const maxRetryAttempts = hasRetry ? Math.max(...retryRules.map((r) => r.MaxAttempts ?? 3)) : 0

      catchInfos.push({
        stateName,
        errorTypes: [...errorTypes],
        hasRetry,
        maxRetryAttempts,
      })
    }
  }

  return catchInfos
}
