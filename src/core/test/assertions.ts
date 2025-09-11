import type {
  Assertions as AssertionSettings,
  MapExpectation,
  ParallelExpectation,
  StateExpectation,
  TestCase,
} from '../../schemas/test-schema'
import type { JsonObject, JsonValue } from '../../types/asl'
import type { AssertionResult, StateExecution } from '../../types/test'
import type { ExecutionResult } from '../interpreter/executor'

export class TestAssertions {
  static performAssertions(
    testCase: TestCase,
    result: ExecutionResult,
    suiteSettings?: AssertionSettings,
  ): AssertionResult[] {
    const assertions: AssertionResult[] = []
    // Use suite-level settings
    const settings: AssertionSettings = suiteSettings || {}

    // Output assertion
    if (testCase.expectedOutput !== undefined) {
      const outputAssertion = TestAssertions.assertOutput(
        testCase.expectedOutput,
        result.output,
        settings,
      )
      assertions.push(outputAssertion)
    }

    // Path assertion
    if (testCase.expectedPath !== undefined) {
      const pathAssertions = TestAssertions.assertPaths(
        testCase.expectedPath,
        result.executionPath,
        settings,
      )
      assertions.push(...pathAssertions)
    }

    // State-level assertions
    if (testCase.stateExpectations && result.stateExecutions) {
      const stateAssertions = TestAssertions.assertStateExpectations(
        testCase.stateExpectations,
        result.stateExecutions,
        settings,
      )
      assertions.push(...stateAssertions)
    }

    // Map state assertions
    if (testCase.mapExpectations && result.mapExecutions) {
      const mapAssertions = TestAssertions.assertMapExpectations(
        testCase.mapExpectations,
        result.mapExecutions,
        settings,
      )
      assertions.push(...mapAssertions)
    }

    // Parallel state assertions
    if (testCase.parallelExpectations && result.parallelExecutions) {
      const parallelAssertions = TestAssertions.assertParallelExpectations(
        testCase.parallelExpectations,
        result.parallelExecutions,
      )
      assertions.push(...parallelAssertions)
    }

    return assertions
  }

  private static assertOutput(
    expected: JsonValue,
    actual: JsonValue,
    settings: AssertionSettings,
  ): AssertionResult {
    const cleanExpected = TestAssertions.cleanForComparison(expected)
    const cleanActual = TestAssertions.cleanForComparison(actual)

    let success = false
    let message = ''

    switch (settings.outputMatching) {
      case 'exact':
        success = JSON.stringify(cleanExpected) === JSON.stringify(cleanActual)
        message = success
          ? 'Output matches expected value'
          : `Expected output: ${JSON.stringify(
              cleanExpected,
            )}, but got: ${JSON.stringify(cleanActual)}`
        break
      default:
        success = TestAssertions.isPartialMatch(cleanExpected, cleanActual)
        message = success
          ? 'Output partially matches expected value'
          : `Expected output to contain: ${JSON.stringify(
              cleanExpected,
            )}, but got: ${JSON.stringify(cleanActual)}`
        break
    }

    return {
      type: 'output',
      passed: success,
      expected: expected as JsonValue,
      actual: actual as JsonValue,
      message,
    }
  }

  private static assertPaths(
    expected: string[] | string[][],
    actual: string[],
    settings: AssertionSettings,
  ): AssertionResult[] {
    // If it's a single path
    if (expected.length > 0 && typeof expected[0] === 'string') {
      return [TestAssertions.assertSinglePath(expected as string[], actual, settings)]
    }

    // Multiple paths - check if any of them matches
    const multiplePaths = expected as string[][]
    const results: AssertionResult[] = []

    for (let i = 0; i < multiplePaths.length; i++) {
      const path = multiplePaths[i]
      if (!path) continue
      const result = TestAssertions.assertSinglePath(path, actual, settings)
      result.message = `Path variant ${i + 1}: ${result.message}`
      results.push(result)
    }

    return results
  }

  private static assertSinglePath(
    expected: string[],
    actual: string[],
    settings: AssertionSettings,
  ): AssertionResult {
    let success = false
    let message = ''

    switch (settings.pathMatching) {
      case 'exact':
        success = TestAssertions.comparePathStrict(expected, actual, 'exact')
        message = success
          ? 'Execution path matches expected sequence exactly'
          : `Expected path: [${expected.join(' → ')}], but got: [${actual.join(' → ')}]`
        break
      case 'includes':
        success = TestAssertions.pathContainsSequence(actual, expected)
        message = success
          ? 'Execution path contains expected sequence'
          : `Expected path to contain sequence: [${expected.join(
              ' → ',
            )}], but got: [${actual.join(' → ')}]`
        break
      default:
        success = TestAssertions.comparePathStrict(expected, actual, 'partial')
        message = success
          ? 'Execution path matches expected pattern'
          : `Expected path pattern: [${expected.join(' → ')}], but got: [${actual.join(' → ')}]`
        break
    }

    return { type: 'path', passed: success, expected, actual, message }
  }

  private static cleanForComparison(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj
    // Clean up any test-specific properties that shouldn't affect comparison
    return obj
  }

  private static isPartialMatch(expected: unknown, actual: unknown): boolean {
    if (typeof expected !== typeof actual) return false
    if (expected === null || actual === null) return expected === actual

    if (typeof expected === 'object' && typeof actual === 'object' && actual !== null) {
      for (const key in expected) {
        if (
          !(
            key in actual &&
            TestAssertions.isPartialMatch(
              (expected as Record<string, unknown>)[key],
              (actual as Record<string, unknown>)[key],
            )
          )
        ) {
          return false
        }
      }
      return true
    }

    return expected === actual
  }

  private static pathContainsSequence(actual: string[], expected: string[]): boolean {
    for (let i = 0; i <= actual.length - expected.length; i++) {
      let match = true
      for (let j = 0; j < expected.length; j++) {
        if (actual[i + j] !== expected[j]) {
          match = false
          break
        }
      }
      if (match) return true
    }
    return false
  }

  private static assertStateExpectations(
    expectations: StateExpectation[],
    stateExecutions: StateExecution[],
    settings: AssertionSettings,
  ): AssertionResult[] {
    const assertions: AssertionResult[] = []

    for (const expectation of expectations) {
      const statePath = TestAssertions.parseStatePath(expectation.state)
      const execution = TestAssertions.findStateExecution(stateExecutions, statePath)

      if (!execution) {
        assertions.push({
          type: 'state',
          passed: false,
          expected: expectation,
          actual: null,
          message: `State execution not found for: ${expectation.state}`,
        })
        continue
      }

      // Check input
      if (expectation.input !== undefined) {
        const inputMatch = TestAssertions.compareValues(
          expectation.input,
          execution.input,
          expectation.outputMatching || settings.outputMatching || 'partial',
        )
        assertions.push({
          type: 'state',
          passed: inputMatch,
          expected: expectation.input,
          actual: execution.input,
          message: inputMatch
            ? `State ${expectation.state} input matches expectation`
            : `State ${expectation.state} input mismatch. Expected: ${JSON.stringify(
                expectation.input,
              )}, Got: ${JSON.stringify(execution.input)}`,
        })
      }

      // Check output
      if (expectation.output !== undefined) {
        // Use state-specific outputMatching if provided, otherwise fall back to settings
        const outputMatching = expectation.outputMatching || settings.outputMatching || 'partial'
        const outputMatch = TestAssertions.compareValues(
          expectation.output,
          execution.output,
          outputMatching,
        )
        assertions.push({
          type: 'state',
          passed: outputMatch,
          expected: expectation.output,
          actual: execution.output,
          message: outputMatch
            ? `State ${expectation.state} output matches expectation`
            : `State ${expectation.state} output mismatch. Expected: ${JSON.stringify(
                expectation.output,
              )}, Got: ${JSON.stringify(execution.output)}`,
        })
      }

      // Check variables
      if (expectation.variables) {
        const variablesAfter = execution.variablesAfter || {}
        for (const [key, value] of Object.entries(expectation.variables)) {
          const matchingMode = expectation.outputMatching || settings.outputMatching || 'partial'
          if (process.env.DEBUG_ASSERTIONS) {
            console.log(
              `Variable comparison for ${key}: mode=${matchingMode}, settings.outputMatching=${settings.outputMatching}`,
            )
          }
          const varMatch = TestAssertions.compareValues(value, variablesAfter[key], matchingMode)
          assertions.push({
            type: 'state',
            passed: varMatch,
            expected: expectation,
            actual: execution,
            message: varMatch
              ? `State ${expectation.state} variable ${key} matches expectation`
              : `State ${expectation.state} variable ${key} mismatch. Expected: ${JSON.stringify(
                  value,
                )}, Got: ${JSON.stringify(variablesAfter[key])}`,
          })
        }
      }
    }

    return assertions
  }

  private static parseStatePath(path: string): string[] {
    // Parse both dot notation and bracket notation
    // e.g., "ProcessOrder[1].ValidateOrder" -> ["ProcessOrder", "1", "ValidateOrder"]
    return path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean)
  }

  private static findStateExecution(
    executions: StateExecution[],
    statePath: string[],
  ): StateExecution | undefined {
    // If statePath is a single element, find by state name (for Map/Parallel internal states)
    if (statePath.length === 1) {
      const stateName = statePath[0]
      return executions.find((exec) => exec.state === stateName)
    }

    // Otherwise, match the full path exactly
    return executions.find((exec) => {
      if (exec.statePath.length !== statePath.length) return false
      return exec.statePath.every((part, i) => part === statePath[i])
    })
  }

  private static compareValues(
    expected: unknown,
    actual: unknown,
    matching: 'exact' | 'partial',
  ): boolean {
    if (matching === 'partial') {
      return TestAssertions.isPartialMatch(expected, actual)
    }
    return JSON.stringify(expected) === JSON.stringify(actual)
  }

  private static assertMapExpectations(
    expectations: MapExpectation[],
    mapExecutions: JsonObject[],
    settings: AssertionSettings,
  ): AssertionResult[] {
    const assertions: AssertionResult[] = []

    for (const expectation of expectations) {
      // Find matching Map execution
      const mapExec = mapExecutions.find((exec) => exec.state === expectation.state)

      if (!mapExec) {
        assertions.push({
          type: 'map',
          passed: false,
          expected: expectation,
          actual: null,
          message: `Map execution not found for: ${expectation.state}`,
        })
        continue
      }

      // Check iteration count
      if (expectation.iterationCount !== undefined) {
        const countMatch = mapExec.iterationCount === expectation.iterationCount
        assertions.push({
          type: 'map',
          passed: countMatch,
          expected: expectation.iterationCount,
          actual: mapExec.iterationCount ?? null,
          message: countMatch
            ? `Map ${expectation.state} iteration count matches expectation`
            : `Map ${expectation.state} iteration count mismatch. Expected: ${expectation.iterationCount}, Got: ${mapExec.iterationCount}`,
        })
      }

      // Check iteration paths (object format only)
      if (expectation.iterationPaths) {
        const pathMatching =
          expectation.iterationPaths.pathMatching || settings.pathMatching || 'exact'

        // Check all iterations follow the same path
        if (expectation.iterationPaths.all) {
          const iterationPaths = mapExec.iterationPaths as string[][]
          for (let i = 0; i < iterationPaths.length; i++) {
            const actualPath = iterationPaths[i] as string[]
            if (actualPath) {
              const pathMatch = TestAssertions.comparePathStrict(
                expectation.iterationPaths.all,
                actualPath as string[],
                pathMatching,
              )
              assertions.push({
                type: 'map',
                passed: pathMatch,
                expected: expectation.iterationPaths.all,
                actual: actualPath,
                message: pathMatch
                  ? `Map ${expectation.state} iteration ${i} follows expected path`
                  : `Map ${expectation.state} iteration ${i} path mismatch. Expected: [${expectation.iterationPaths.all.join(
                      ' → ',
                    )}], Got: [${(actualPath as string[]).join(' → ')}]`,
              })
            }
          }
        }

        // Check specific iteration paths
        if (expectation.iterationPaths.samples) {
          for (const [index, expectedPath] of Object.entries(expectation.iterationPaths.samples)) {
            const idx = Number.parseInt(index, 10)
            const actualPath = (mapExec.iterationPaths as string[][])[idx]
            if (actualPath) {
              const pathMatch = TestAssertions.comparePathStrict(
                expectedPath,
                actualPath as string[],
                pathMatching,
              )
              assertions.push({
                type: 'map',
                passed: pathMatch,
                expected: expectedPath,
                actual: actualPath,
                message: pathMatch
                  ? `Map ${expectation.state} iteration ${idx} path matches sample expectation`
                  : `Map ${
                      expectation.state
                    } iteration ${idx} path mismatch. Expected: [${expectedPath.join(
                      ' → ',
                    )}], Got: [${(actualPath as string[]).join(' → ')}]`,
              })
            }
          }
        }
      }
    }

    return assertions
  }

  private static assertParallelExpectations(
    expectations: ParallelExpectation[],
    parallelExecutions: JsonObject[],
  ): AssertionResult[] {
    const assertions: AssertionResult[] = []

    for (const expectation of expectations) {
      // Find matching Parallel execution
      const parallelExec = parallelExecutions.find((exec) => exec.state === expectation.state)

      if (!parallelExec) {
        assertions.push({
          type: 'parallel',
          passed: false,
          expected: expectation,
          actual: null,
          message: `Parallel execution not found for: ${expectation.state}`,
        })
        continue
      }

      // Check branch count
      if (expectation.branchCount !== undefined) {
        const countMatch = parallelExec.branchCount === expectation.branchCount
        assertions.push({
          type: 'parallel',
          passed: countMatch,
          expected: expectation.branchCount,
          actual: parallelExec.branchCount as JsonValue,
          message: countMatch
            ? `Parallel ${expectation.state} branch count matches expectation`
            : `Parallel ${expectation.state} branch count mismatch. Expected: ${expectation.branchCount}, Got: ${(parallelExec as Record<string, unknown>).branchCount}`,
        })
      }

      // Check branch paths
      if (expectation.branchPaths) {
        const pathMatching =
          (expectation.branchPaths as { pathMatching?: string })?.pathMatching || 'exact'

        for (const [index, expectedPath] of Object.entries(expectation.branchPaths)) {
          if (index === 'pathMatching') continue // Skip the pathMatching property

          const idx = Number.parseInt(index, 10)
          const actualPath = (parallelExec.branchPaths as Record<number, string[]>)?.[idx]
          if (actualPath && Array.isArray(expectedPath)) {
            const pathMatch = TestAssertions.comparePathStrict(
              expectedPath,
              actualPath as string[],
              pathMatching,
            )
            assertions.push({
              type: 'parallel',
              passed: pathMatch,
              expected: expectedPath,
              actual: actualPath,
              message: pathMatch
                ? `Parallel ${expectation.state} branch ${idx} path matches expectation`
                : `Parallel ${
                    expectation.state
                  } branch ${idx} path mismatch. Expected: [${expectedPath.join(
                    ' → ',
                  )}], Got: [${(actualPath as string[]).join(' → ')}]`,
            })
          }
        }
      }
    }

    return assertions
  }

  private static comparePathStrict(
    expected: string[],
    actual: string[],
    pathMatching: string,
  ): boolean {
    switch (pathMatching) {
      case 'exact':
        return JSON.stringify(expected) === JSON.stringify(actual)
      case 'contains':
        return TestAssertions.pathContainsSequence(actual, expected)
      case 'partial':
        // Partial matching allows for subset comparison
        return expected.every((expectedState) => actual.includes(expectedState))
      default:
        return JSON.stringify(expected) === JSON.stringify(actual)
    }
  }
}
