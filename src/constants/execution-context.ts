/**
 * ExecutionContext default values and constants
 * These values are used for test reproducibility and deterministic execution
 */

/**
 * Default AWS account ID
 */
const DEFAULT_ACCOUNT_ID = '123456789012' as const

/**
 * Default AWS region
 */
const DEFAULT_REGION = 'us-east-1' as const

/**
 * Default ExecutionContext values
 */
export const EXECUTION_CONTEXT_DEFAULTS = {
  /**
   * Default execution name
   */
  NAME: 'test-execution',

  /**
   * Default execution start time (ISO 8601 format)
   * Fixed to New Year 2024 midnight UTC for consistency
   */
  START_TIME: '2024-01-01T00:00:00.000Z',

  /**
   * Default execution stop time (ISO 8601 format)
   * Fixed to 1 minute after start time for consistency
   */
  STOP_TIME: '2024-01-01T00:01:00.000Z',

  /**
   * Default IAM role ARN (constructed from account ID)
   */
  ROLE_ARN: `arn:aws:iam::${DEFAULT_ACCOUNT_ID}:role/StepFunctionsRole`,

  /**
   * Default AWS account ID
   */
  ACCOUNT_ID: DEFAULT_ACCOUNT_ID,

  /**
   * Default AWS region
   */
  REGION: DEFAULT_REGION,

  /**
   * Default state machine name (used in ARN generation)
   */
  STATE_MACHINE_NAME: 'StateMachine',

  /**
   * Fixed UUID for deterministic testing
   * Based on ADR-001: ExecutionContext fixed values
   * Format follows UUID v4 specification with predictable values
   */
  FIXED_UUID: 'test-uuid-00000000-0000-4000-8000-000000000001',
} as const

/**
 * Build Execution ID ARN
 */
export function buildExecutionId(
  name: string = EXECUTION_CONTEXT_DEFAULTS.NAME,
  accountId: string = EXECUTION_CONTEXT_DEFAULTS.ACCOUNT_ID,
  region: string = EXECUTION_CONTEXT_DEFAULTS.REGION,
  stateMachineName: string = EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME,
): string {
  return `arn:aws:states:${region}:${accountId}:execution:${stateMachineName}:${name}`
}

/**
 * Build StateMachine ID ARN
 */
export function buildStateMachineId(
  accountId: string = EXECUTION_CONTEXT_DEFAULTS.ACCOUNT_ID,
  region: string = EXECUTION_CONTEXT_DEFAULTS.REGION,
  stateMachineName: string = EXECUTION_CONTEXT_DEFAULTS.STATE_MACHINE_NAME,
): string {
  return `arn:aws:states:${region}:${accountId}:stateMachine:${stateMachineName}`
}
