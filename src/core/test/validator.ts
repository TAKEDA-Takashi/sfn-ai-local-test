/**
 * Test Suite Schema Validator using Zod
 *
 * Validates test suite YAML structure with comprehensive error reporting
 */

import type { TestSuite } from '../../schemas/test-schema'
import { testSuiteSchema } from '../../schemas/test-schema'

export interface ValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export class TestSuiteValidator {
  private warnings: ValidationError[] = []

  /**
   * Validates a test suite configuration
   * Throws an error for invalid format, returns warnings for non-critical issues
   */
  validate(suite: unknown): {
    warnings: ValidationError[]
    validatedSuite: TestSuite
  } {
    this.warnings = []

    const result = testSuiteSchema.safeParse(suite)

    if (!result.success) {
      // YAMLフォーマットエラーは即座にErrorを投げる（MockEngineと同じ挙動）
      throw new Error(`Invalid test suite format: ${result.error.message}`)
    }

    // フォーマットは正しいが、追加の検証が必要な場合のみwarningsを返す
    this.performCustomValidations(result.data)

    return { warnings: this.warnings, validatedSuite: result.data }
  }

  /**
   * Perform additional custom validations that result in warnings
   */
  private performCustomValidations(suite: TestSuite): void {
    if (!suite.testCases) return

    suite.testCases.forEach((testCase, testIndex) => {
      if (!testCase.mockOverrides) return

      testCase.mockOverrides.forEach((override, overrideIndex) => {
        if (override.type === 'itemReader' && !override.data && !override.dataFile) {
          this.addWarning(
            `testCases[${testIndex}].mockOverrides[${overrideIndex}]`,
            'itemReader mock should have either data or dataFile',
          )
        }
      })
    })
  }

  private addWarning(path: string, message: string): void {
    this.warnings.push({
      path: path || 'root',
      message,
      severity: 'warning',
    })
  }
}
