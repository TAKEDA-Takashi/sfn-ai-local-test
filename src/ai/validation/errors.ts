/**
 * Custom error types for test execution validation
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly stateName?: string,
    public readonly testCaseName?: string,
  ) {
    super(message)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class InvalidInputError extends ValidationError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInputError'
    Object.setPrototypeOf(this, InvalidInputError.prototype)
  }
}

export class TestExecutionError extends ValidationError {
  constructor(testCaseName: string, originalError: unknown) {
    const errorMessage =
      originalError instanceof Error ? originalError.message : String(originalError)
    super(`Failed to execute test case "${testCaseName}": ${errorMessage}`, undefined, testCaseName)
    this.name = 'TestExecutionError'
    Object.setPrototypeOf(this, TestExecutionError.prototype)
  }
}
