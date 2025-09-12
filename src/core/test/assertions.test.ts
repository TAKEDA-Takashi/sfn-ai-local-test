import { describe, expect, it } from 'vitest'
import type {
  Assertions as AssertionSettings,
  MapExpectation,
  ParallelExpectation,
  TestCase,
} from '../../schemas/test-schema.js'
import type { StateExecution } from '../../types/test.js'
import type { ExecutionResult } from '../interpreter/executor.js'
import { TestAssertions } from './assertions.js'

describe('TestAssertions', () => {
  describe('performAssertions', () => {
    it('should perform output assertions when expectedOutput is defined', () => {
      const testCase: TestCase = {
        name: 'test',
        input: { test: 'input' },
        expectedOutput: { result: 'success' },
      }

      const result: ExecutionResult = {
        output: { result: 'success' },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(1)
      expect(assertions[0]?.type).toBe('output')
      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.expected).toEqual({ result: 'success' })
      expect(assertions[0]?.actual).toEqual({ result: 'success' })
    })

    it('should perform path assertions when expectedPath is defined', () => {
      const testCase: TestCase = {
        name: 'test',
        input: { test: 'input' },
        expectedPath: ['Start', 'Process', 'End'],
      }

      const result: ExecutionResult = {
        output: { result: 'success' },
        executionPath: ['Start', 'Process', 'End'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(1)
      expect(assertions[0]?.type).toBe('path')
      expect(assertions[0]?.passed).toBe(true)
    })

    it('should perform state expectations when defined', () => {
      const stateExecutions: StateExecution[] = [
        {
          statePath: ['Process'],
          state: 'Process',
          input: { data: 'test' },
          output: { result: 'processed' },
        },
      ]

      const testCase: TestCase = {
        name: 'test',
        input: { test: 'input' },
        stateExpectations: [
          {
            state: 'Process',
            output: { result: 'processed' },
          },
        ],
      }

      const result: ExecutionResult = {
        output: { result: 'success' },
        executionPath: ['Start', 'Process', 'End'],
        success: true,
        stateExecutions,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(1)
      expect(assertions[0]?.type).toBe('state')
      expect(assertions[0]?.passed).toBe(true)
      // Note: stateName may not be set in current implementation
    })

    it('should perform map expectations when defined', () => {
      const testCase: TestCase = {
        name: 'test',
        input: { items: [1, 2, 3] },
        mapExpectations: [
          {
            state: 'ProcessItems',
            iterationCount: 3,
          },
        ],
      }

      const result: ExecutionResult = {
        output: { results: ['a', 'b', 'c'] },
        executionPath: ['Start', 'ProcessItems', 'End'],
        success: true,
        mapExecutions: [
          {
            state: 'ProcessItems',
            iterationCount: 3,
            iterationPaths: [['Process'], ['Process'], ['Process']],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(1)
      expect(assertions[0]?.type).toBe('map')
      expect(assertions[0]?.passed).toBe(true)
    })

    it('should perform parallel expectations when defined', () => {
      const testCase: TestCase = {
        name: 'test',
        input: { data: 'test' },
        parallelExpectations: [
          {
            state: 'ParallelProcess',
            branchCount: 2,
          },
        ],
      }

      const result: ExecutionResult = {
        output: { results: ['a', 'b'] },
        executionPath: ['Start', 'ParallelProcess', 'End'],
        success: true,
        parallelExecutions: [
          {
            type: 'parallel',
            state: 'ParallelProcess',
            branchCount: 2,
            branchPaths: [['BranchA'], ['BranchB']],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(1)
      expect(assertions[0]?.type).toBe('parallel')
      expect(assertions[0]?.passed).toBe(true)
    })

    it('should return empty array when no expectations are defined', () => {
      const testCase: TestCase = {
        name: 'test',
        input: { test: 'input' },
      }

      const result: ExecutionResult = {
        output: { result: 'success' },
        executionPath: ['Start', 'End'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(0)
    })

    it('should combine multiple assertion types', () => {
      const testCase: TestCase = {
        name: 'test',
        input: { test: 'input' },
        expectedOutput: { result: 'success' },
        expectedPath: ['Start', 'End'],
        stateExpectations: [
          {
            state: 'Start',
            input: { test: 'input' },
          },
        ],
      }

      const result: ExecutionResult = {
        output: { result: 'success' },
        executionPath: ['Start', 'End'],
        success: true,
        stateExecutions: [
          {
            statePath: ['Start'],
            state: 'Start',
            input: { test: 'input' },
            output: { processed: true },
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(3) // output + path + state
      expect(assertions.map((a) => a.type)).toEqual(['output', 'path', 'state'])
      expect(assertions.every((a) => a.passed)).toBe(true)
    })
  })

  describe('output assertions', () => {
    it('should pass with exact matching for identical outputs', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: { result: 'success', count: 42 },
      }

      const result: ExecutionResult = {
        output: { result: 'success', count: 42 },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        outputMatching: 'exact',
      })

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.message).toContain('Output matches expected value')
    })

    it('should fail with exact matching for different outputs', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: { result: 'success' },
      }

      const result: ExecutionResult = {
        output: { result: 'failure' },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, {
        outputMatching: 'exact',
      })

      expect(assertions[0]?.passed).toBe(false)
      expect(assertions[0]?.message).toContain('Output mismatch:')
      expect(assertions[0]?.message).toContain('Changed fields:')
    })

    it('should pass with partial matching for subset outputs', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: { result: 'success' },
      }

      const result: ExecutionResult = {
        output: { result: 'success', extra: 'data' },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.message).toContain('Output partially matches')
    })

    it('should use partial matching as default', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: { result: 'success' },
        // No settings specified - should default to partial matching
      }

      const result: ExecutionResult = {
        output: { result: 'success', extra: 'data' },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.message).toContain('Output partially matches')
    })
  })

  describe('path assertions', () => {
    it('should handle single path expectation', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedPath: ['Start', 'Process', 'End'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'Process', 'End'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.type).toBe('path')
    })

    it('should handle multiple path expectations (AND condition)', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedPath: [
          ['Start', 'ProcessA', 'End'],
          ['Start', 'ProcessB', 'End'],
        ],
      }

      // This should fail as actual path matches only first expectation
      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'ProcessA', 'End'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions).toHaveLength(2)
      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[1]?.passed).toBe(false)
    })

    it('should handle path matching modes', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedPath: ['Process', 'End'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'Process', 'End', 'Cleanup'],
        success: true,
      }

      // デフォルトは'exact'なので、完全一致でないと失敗する
      const assertions = TestAssertions.performAssertions(testCase, result)
      expect(assertions[0]?.passed).toBe(false) // 'exact'モードでは失敗

      // 'includes'モードを指定すれば成功（Process, Endが連続して現れる）
      const assertionsIncludes = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })
      expect(assertionsIncludes[0]?.passed).toBe(true)
    })

    it('should handle includes path matching', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedPath: ['Process', 'Middle'],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start', 'Process', 'Middle', 'End'],
        success: true,
      }

      // includesモードでは連続して現れれば成功
      const assertions = TestAssertions.performAssertions(testCase, result, {
        pathMatching: 'includes',
      })
      expect(assertions[0]?.passed).toBe(true)

      // 連続していない場合は失敗
      const testCaseNonConsecutive: TestCase = {
        name: 'test',
        input: {},
        expectedPath: ['Start', 'End'],
      }
      const assertionsNonConsecutive = TestAssertions.performAssertions(
        testCaseNonConsecutive,
        result,
        {
          pathMatching: 'includes',
        },
      )
      expect(assertionsNonConsecutive[0]?.passed).toBe(false)
    })
  })

  describe('state expectations', () => {
    it('should validate state input', () => {
      const stateExecutions: StateExecution[] = [
        {
          statePath: ['Process'],
          state: 'Process',
          input: { data: 'test' },
          output: { result: 'processed' },
        },
      ]

      const testCase: TestCase = {
        name: 'test',
        input: {},
        stateExpectations: [
          {
            state: 'Process',
            input: { data: 'test' },
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Process'],
        success: true,
        stateExecutions,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.type).toBe('state')
      // Note: stateName may not be set in current implementation
    })

    it('should validate state output', () => {
      const stateExecutions: StateExecution[] = [
        {
          statePath: ['Process'],
          state: 'Process',
          input: { data: 'test' },
          output: { result: 'processed' },
        },
      ]

      const testCase: TestCase = {
        name: 'test',
        input: {},
        stateExpectations: [
          {
            state: 'Process',
            output: { result: 'processed' },
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Process'],
        success: true,
        stateExecutions,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle nested state paths', () => {
      const stateExecutions: StateExecution[] = [
        {
          statePath: ['MapState', '0', 'InnerTask'],
          state: 'InnerTask',
          parentState: 'MapState',
          iterationIndex: 0,
          input: { item: 'test' },
          output: { processed: true },
        },
      ]

      const testCase: TestCase = {
        name: 'test',
        input: {},
        stateExpectations: [
          {
            state: 'MapState[0].InnerTask',
            output: { processed: true },
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['MapState'],
        success: true,
        stateExecutions,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle state not found', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        stateExpectations: [
          {
            state: 'NonExistentState',
            output: { result: 'test' },
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start'],
        success: true,
        stateExecutions: [],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(false)
      expect(assertions[0]?.message).toContain('State execution not found for')
    })

    it('should validate variables when present', () => {
      const stateExecutions: StateExecution[] = [
        {
          statePath: ['Process'],
          state: 'Process',
          input: { data: 'test' },
          output: { result: 'processed' },
          variablesAfter: { counter: 1, status: 'active' },
        },
      ]

      const testCase: TestCase = {
        name: 'test',
        input: {},
        stateExpectations: [
          {
            state: 'Process',
            variables: { counter: 1, status: 'active' },
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Process'],
        success: true,
        stateExecutions,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })
  })

  describe('map expectations', () => {
    it('should validate iteration count', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        mapExpectations: [
          {
            state: 'ProcessItems',
            iterationCount: 3,
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['ProcessItems'],
        success: true,
        mapExecutions: [
          {
            state: 'ProcessItems',
            iterationCount: 3,
            iterationPaths: [['Process'], ['Process'], ['Process']],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.type).toBe('map')
    })

    it('should validate iteration paths with exact matching', () => {
      const mapExpectation: MapExpectation = {
        state: 'ProcessItems',
        iterationPaths: {
          pathMatching: 'exact',
          all: ['Process', 'End'],
        },
      }

      const testCase: TestCase = {
        name: 'test',
        input: {},
        mapExpectations: [mapExpectation],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['ProcessItems'],
        success: true,
        mapExecutions: [
          {
            state: 'ProcessItems',
            iterationCount: 2,
            iterationPaths: [
              ['Process', 'End'],
              ['Process', 'End'],
            ],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should validate specific iteration paths by samples', () => {
      const mapExpectation: MapExpectation = {
        state: 'ProcessItems',
        iterationPaths: {
          samples: {
            0: ['ProcessFirst'],
            1: ['ProcessSecond'],
          },
        },
      }

      const testCase: TestCase = {
        name: 'test',
        input: {},
        mapExpectations: [mapExpectation],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['ProcessItems'],
        success: true,
        mapExecutions: [
          {
            state: 'ProcessItems',
            iterationCount: 2,
            iterationPaths: [['ProcessFirst'], ['ProcessSecond']],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle map state not found', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        mapExpectations: [
          {
            state: 'NonExistentMap',
            iterationCount: 1,
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start'],
        success: true,
        mapExecutions: [],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(false)
      expect(assertions[0]?.message).toContain('Map execution not found for')
    })
  })

  describe('parallel expectations', () => {
    it('should validate branch count', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        parallelExpectations: [
          {
            state: 'ParallelProcess',
            branchCount: 2,
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['ParallelProcess'],
        success: true,
        parallelExecutions: [
          {
            type: 'parallel',
            state: 'ParallelProcess',
            branchCount: 2,
            branchPaths: [['BranchA'], ['BranchB']],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
      expect(assertions[0]?.type).toBe('parallel')
    })

    it('should validate branch paths', () => {
      const parallelExpectation: ParallelExpectation = {
        state: 'ParallelProcess',
        branchPaths: {
          0: ['ProcessA', 'EndA'],
          1: ['ProcessB', 'EndB'],
        },
      }

      const testCase: TestCase = {
        name: 'test',
        input: {},
        parallelExpectations: [parallelExpectation],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['ParallelProcess'],
        success: true,
        parallelExecutions: [
          {
            type: 'parallel',
            state: 'ParallelProcess',
            branchCount: 2,
            branchPaths: [
              ['ProcessA', 'EndA'],
              ['ProcessB', 'EndB'],
            ],
          },
        ],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle parallel state not found', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        parallelExpectations: [
          {
            state: 'NonExistentParallel',
            branchCount: 1,
          },
        ],
      }

      const result: ExecutionResult = {
        output: {},
        executionPath: ['Start'],
        success: true,
        parallelExecutions: [],
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(false)
      expect(assertions[0]?.message).toContain('Parallel execution not found for')
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle null/undefined values gracefully', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: null,
      }

      const result: ExecutionResult = {
        output: null,
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle complex nested objects', () => {
      const complexOutput = {
        results: [
          { id: 1, data: { nested: { value: 'test' } } },
          { id: 2, data: { nested: { value: 'test2' } } },
        ],
        metadata: { count: 2, processed: true },
      }

      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: complexOutput,
      }

      const result: ExecutionResult = {
        output: complexOutput,
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle empty arrays and objects', () => {
      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: { items: [], metadata: {} },
      }

      const result: ExecutionResult = {
        output: { items: [], metadata: {} },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result)

      expect(assertions[0]?.passed).toBe(true)
    })

    it('should handle custom assertion settings', () => {
      const settings: AssertionSettings = {
        outputMatching: 'partial',
        pathMatching: 'includes',
        stateMatching: 'exact',
      }

      const testCase: TestCase = {
        name: 'test',
        input: {},
        expectedOutput: { result: 'success' },
      }

      const result: ExecutionResult = {
        output: { result: 'success', extra: 'data' },
        executionPath: ['Start'],
        success: true,
      }

      const assertions = TestAssertions.performAssertions(testCase, result, settings)

      expect(assertions[0]?.passed).toBe(true)
    })
  })
})
