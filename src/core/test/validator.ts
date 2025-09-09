/**
 * Test Suite Schema Validator
 *
 * Validates test suite YAML structure to catch typos and invalid keys
 */

interface ValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export class TestSuiteValidator {
  private errors: ValidationError[] = []
  private warnings: ValidationError[] = []

  /**
   * Validates a test suite and returns validation errors
   */
  validate(suite: unknown): {
    warnings: ValidationError[]
    errors: ValidationError[]
  } {
    this.errors = []
    this.warnings = []

    if (!suite || typeof suite !== 'object' || Array.isArray(suite)) {
      this.addError('', 'Suite must be an object')
      return { warnings: this.warnings, errors: this.errors }
    }

    // TypeScript doesn't narrow 'object' to Record<string, unknown> automatically
    const suiteObj = suite as Record<string, unknown>

    // Validate top-level structure
    this.validateTopLevel(suiteObj)

    // Validate each test case
    if (Array.isArray(suiteObj.testCases)) {
      suiteObj.testCases.forEach((testCase: unknown, index: number) => {
        if (testCase && typeof testCase === 'object' && !Array.isArray(testCase)) {
          this.validateTestCase(testCase as Record<string, unknown>, `testCases[${index}]`)
        }
      })
    }

    return { warnings: this.warnings, errors: this.errors }
  }

  /**
   * Check if validation passed (no errors, warnings allowed)
   */
  isValid(): boolean {
    return this.errors.length === 0
  }

  /**
   * Get only error-level issues
   */
  getErrors(): ValidationError[] {
    return this.errors
  }

  /**
   * Get only warnings
   */
  getWarnings(): ValidationError[] {
    return this.warnings
  }

  private validateTopLevel(suite: Record<string, unknown>): void {
    const validKeys = [
      'version',
      'name',
      'description',
      'stateMachine',
      'baseMock',
      'testCases',
      'settings',
      'assertions',
    ]

    this.checkUnknownKeys(suite, validKeys, '')

    // Required fields
    if (!suite.version) {
      this.addError('', 'version is required')
    }
    if (!suite.name) {
      this.addError('', 'name is required')
    }
    if (!Array.isArray(suite.testCases)) {
      this.addError('', 'testCases must be an array')
    }

    // Validate settings if present
    if (suite.settings && typeof suite.settings === 'object' && !Array.isArray(suite.settings)) {
      this.validateSettings(suite.settings as Record<string, unknown>, 'settings')
    }

    // Validate assertions if present
    if (
      suite.assertions &&
      typeof suite.assertions === 'object' &&
      !Array.isArray(suite.assertions)
    ) {
      this.validateAssertions(suite.assertions as Record<string, unknown>, 'assertions')
    }
  }

  private validateTestCase(testCase: Record<string, unknown>, path: string): void {
    const validKeys = [
      'name',
      'description',
      'input',
      'expectedOutput',
      'expectedPath',
      'expectedError',
      'stateExpectations',
      'mapExpectations',
      'parallelExpectations',
      'timeout',
      'skip',
      'only',
      'mockOverrides',
    ]

    this.checkUnknownKeys(testCase, validKeys, path)

    // Required fields
    if (!testCase.name) {
      this.addError(path, 'name is required')
    }
    if (testCase.input === undefined) {
      this.addError(path, 'input is required')
    }

    // Validate mapExpectations
    if (testCase.mapExpectations) {
      if (!Array.isArray(testCase.mapExpectations)) {
        this.addError(`${path}.mapExpectations`, 'must be an array')
      } else {
        testCase.mapExpectations.forEach((exp: unknown, index: number) => {
          if (exp && typeof exp === 'object') {
            this.validateMapExpectation(
              exp as Record<string, unknown>,
              `${path}.mapExpectations[${index}]`,
            )
          }
        })
      }
    }

    // Validate stateExpectations
    if (testCase.stateExpectations) {
      if (!Array.isArray(testCase.stateExpectations)) {
        this.addError(`${path}.stateExpectations`, 'must be an array')
      } else {
        testCase.stateExpectations.forEach((exp: unknown, index: number) => {
          if (exp && typeof exp === 'object') {
            this.validateStateExpectation(
              exp as Record<string, unknown>,
              `${path}.stateExpectations[${index}]`,
            )
          }
        })
      }
    }

    // Validate mockOverrides
    if (testCase.mockOverrides) {
      if (!Array.isArray(testCase.mockOverrides)) {
        this.addError(`${path}.mockOverrides`, 'must be an array')
      } else {
        testCase.mockOverrides.forEach((override: unknown, index: number) => {
          if (override && typeof override === 'object') {
            this.validateMockOverride(
              override as Record<string, unknown>,
              `${path}.mockOverrides[${index}]`,
            )
          }
        })
      }
    }
  }

  private validateMapExpectation(exp: Record<string, unknown>, path: string): void {
    const validKeys = ['state', 'iterationCount', 'iterationPaths']

    this.checkUnknownKeys(exp, validKeys, path)

    if (!exp.state) {
      this.addError(path, 'state is required')
    }

    // Check for common typos
    if ('iterationPath' in exp) {
      this.addError(path, 'Unknown key "iterationPath". Did you mean "iterationPaths"?')
    }
    if ('iteration' in exp) {
      this.addError(path, 'Unknown key "iteration". Did you mean "iterationCount"?')
    }

    // Validate iterationPaths structure
    if (exp.iterationPaths !== undefined) {
      if (Array.isArray(exp.iterationPaths)) {
        // Simple array format: [["State1", "State2"], ["State1", "State3"]]
        exp.iterationPaths.forEach((iterPath: unknown, index: number) => {
          if (!Array.isArray(iterPath)) {
            this.addError(
              `${path}.iterationPaths[${index}]`,
              'each iteration path must be an array of state names',
            )
          }
        })
      } else if (typeof exp.iterationPaths === 'object') {
        // Object format: { pathMatching: "exact", all: ["State1", "State2"], samples: {...} }
        const validKeys = ['pathMatching', 'all', 'samples']
        this.checkUnknownKeys(exp.iterationPaths, validKeys, `${path}.iterationPaths`)

        const iterationPaths = exp.iterationPaths as Record<string, unknown>
        if (
          iterationPaths.pathMatching &&
          !['exact', 'sequence', 'includes'].includes(iterationPaths.pathMatching as string)
        ) {
          this.addError(
            `${path}.iterationPaths.pathMatching`,
            `must be 'exact', 'sequence', or 'includes', got '${iterationPaths.pathMatching}'`,
          )
        }

        if (iterationPaths.all && !Array.isArray(iterationPaths.all)) {
          this.addError(`${path}.iterationPaths.all`, 'must be an array of state names')
        }

        if (iterationPaths.samples && typeof iterationPaths.samples !== 'object') {
          this.addError(
            `${path}.iterationPaths.samples`,
            'must be an object mapping iteration index to path array',
          )
        }
      } else {
        this.addError(
          `${path}.iterationPaths`,
          'must be an array or an object with pathMatching/all/samples',
        )
      }
    }
  }

  private validateStateExpectation(exp: Record<string, unknown>, path: string): void {
    const validKeys = ['state', 'input', 'output', 'outputMatching', 'variables']

    this.checkUnknownKeys(exp, validKeys, path)

    if (!exp.state) {
      this.addError(path, 'state is required')
    }
  }

  private validateMockOverride(override: Record<string, unknown>, path: string): void {
    const validKeys = [
      'state',
      'type',
      'response',
      'error',
      'delay',
      'conditions',
      'responses',
      'data',
      'dataFile',
      'dataFormat',
    ]

    this.checkUnknownKeys(override, validKeys, path)

    if (!override.state) {
      this.addError(path, 'state is required')
    }
    if (!override.type) {
      this.addError(path, 'type is required')
    }

    // Type-specific validation
    if (override.type === 'itemReader') {
      if (!(override.data || override.dataFile)) {
        this.addWarning(path, 'itemReader mock should have either data or dataFile')
      }
    }
  }

  private validateSettings(settings: Record<string, unknown>, path: string): void {
    const validKeys = ['timeout', 'parallel', 'stopOnFailure', 'verbose', 'strict']
    this.checkUnknownKeys(settings, validKeys, path)
  }

  private validateAssertions(assertions: Record<string, unknown>, path: string): void {
    const validKeys = ['outputMatching', 'pathMatching', 'stateMatching']
    this.checkUnknownKeys(assertions, validKeys, path)

    // Validate enum values
    if (
      assertions.outputMatching &&
      !['exact', 'partial'].includes(assertions.outputMatching as string)
    ) {
      this.addError(
        `${path}.outputMatching`,
        `must be 'exact' or 'partial', got '${assertions.outputMatching}'`,
      )
    }
    if (
      assertions.pathMatching &&
      !['exact', 'includes', 'sequence'].includes(assertions.pathMatching as string)
    ) {
      this.addError(
        `${path}.pathMatching`,
        `must be 'exact', 'includes', or 'sequence', got '${assertions.pathMatching}'`,
      )
    }
  }

  private checkUnknownKeys(obj: unknown, validKeys: string[], path: string): void {
    if (!obj || typeof obj !== 'object') return

    const objRecord = obj as Record<string, unknown>
    const objKeys = Object.keys(objRecord)
    const unknownKeys = objKeys.filter((key) => !validKeys.includes(key))

    unknownKeys.forEach((key) => {
      // Try to suggest corrections for common typos
      const suggestion = this.findSimilarKey(key, validKeys)
      const pathStr = path ? `${path}.${key}` : key

      if (suggestion) {
        this.addError(pathStr, `Unknown key "${key}". Did you mean "${suggestion}"?`)
      } else {
        this.addError(pathStr, `Unknown key "${key}"`)
      }
    })
  }

  private findSimilarKey(key: string, validKeys: string[]): string | null {
    // Simple Levenshtein distance implementation for typo detection
    const threshold = 2

    for (const validKey of validKeys) {
      if (this.levenshteinDistance(key.toLowerCase(), validKey.toLowerCase()) <= threshold) {
        return validKey
      }
    }

    return null
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length
    const n = s2.length
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0))

    for (let i = 0; i <= m; i++) {
      const row = dp[i]
      if (row) row[0] = i
    }
    for (let j = 0; j <= n; j++) {
      const row = dp[0]
      if (row) row[j] = j
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const currentRow = dp[i]
        const prevRow = dp[i - 1]
        if (s1[i - 1] === s2[j - 1]) {
          if (currentRow && prevRow && prevRow[j - 1] !== undefined) {
            currentRow[j] = prevRow[j - 1] || 0
          }
        } else {
          if (currentRow && prevRow) {
            const deletion =
              prevRow[j] !== undefined ? (prevRow[j] || 0) + 1 : Number.POSITIVE_INFINITY
            const insertion =
              currentRow[j - 1] !== undefined
                ? (currentRow[j - 1] || 0) + 1
                : Number.POSITIVE_INFINITY
            const substitution =
              prevRow[j - 1] !== undefined ? (prevRow[j - 1] || 0) + 1 : Number.POSITIVE_INFINITY
            currentRow[j] = Math.min(deletion, insertion, substitution)
          }
        }
      }
    }

    const result = dp[m]?.[n]
    return result !== undefined ? result : Number.POSITIVE_INFINITY
  }

  private addError(path: string, message: string): void {
    this.errors.push({
      path: path || 'root',
      message,
      severity: 'error',
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
