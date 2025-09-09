import { describe, expect, it } from 'vitest'
import type { JsonObject, StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/asl'
import { NestedCoverageTracker } from './nested-coverage-tracker'

function createStateMachine(config: Record<string, unknown>): StateMachine {
  const result = { ...config }

  if (!result.QueryLanguage) {
    result.QueryLanguage = 'JSONPath'
  }

  if (result.States && typeof result.States === 'object') {
    const states: Record<string, unknown> = {}
    for (const [name, stateConfig] of Object.entries(result.States as Record<string, unknown>)) {
      if (typeof stateConfig === 'object' && stateConfig !== null) {
        states[name] = StateFactory.createState(stateConfig as JsonObject)
      }
    }
    result.States = states

    if (!result.StartAt && Object.keys(states).length > 0) {
      result.StartAt = Object.keys(states)[0]
    }
  }
  return result as unknown as StateMachine
}

describe('NestedCoverageTracker', () => {
  describe('Nested states counting', () => {
    it('should count states in Map ItemProcessor', () => {
      const stateMachine: StateMachine = createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Next: 'Validate',
                },
                Validate: {
                  Type: 'Choice',
                  Choices: [
                    {
                      Variable: '$.valid',
                      BooleanEquals: true,
                      Next: 'Success',
                    },
                  ],
                  Default: 'Failure',
                },
                Success: {
                  Type: 'Pass',
                  End: true,
                },
                Failure: {
                  Type: 'Fail',
                  Error: 'ValidationError',
                },
              },
            },
            End: true,
          } as any,
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)
      const coverage = tracker.getCoverage()

      // Top level: Should count 1 state only (MapState)
      expect(coverage.topLevel.total).toBe(1)
      // Top level branches: 0 (no Choice states at top level)
      expect(coverage.branches.total).toBe(0)
    })

    it('should track coverage of nested states', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Pass',
                  Next: 'Validate',
                },
                Validate: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          } as any,
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)

      // Track top-level execution
      tracker.trackExecution(['MapState'])

      // Track map executions with nested paths
      tracker.trackMapExecutions([
        {
          state: 'MapState',
          iterationPaths: [
            ['Process', 'Validate'],
            ['Process', 'Validate'],
          ],
        },
      ])

      const coverage = tracker.getCoverage()

      // Top level: 1 state (MapState only)
      expect(coverage.topLevel.total).toBe(1)
      expect(coverage.topLevel.covered).toBe(1)
      expect(coverage.topLevel.percentage).toBe(100)

      // Nested coverage for MapState
      expect(coverage.nested).toBeDefined()
      expect(coverage.nested.MapState).toEqual({
        total: 2,
        covered: 2,
        percentage: 100,
        uncovered: [],
      })
    })

    it('should track partial coverage in nested states', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Choice',
                  Choices: [
                    {
                      Variable: '$.type',
                      StringEquals: 'A',
                      Next: 'HandleA',
                    },
                  ],
                  Default: 'HandleB',
                },
                HandleA: {
                  Type: 'Pass',
                  End: true,
                },
                HandleB: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          } as any,
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)

      // Track execution
      tracker.trackExecution(['MapState'])

      // Only execute one branch
      tracker.trackMapExecutions([
        {
          state: 'MapState',
          iterationPaths: [
            ['Process', 'HandleA'], // Only HandleA branch
          ],
        },
      ])

      const coverage = tracker.getCoverage()

      // Top level: 1 state (MapState only)
      expect(coverage.topLevel.total).toBe(1)
      expect(coverage.topLevel.covered).toBe(1)
      expect(coverage.topLevel.percentage).toBe(100)

      // Nested coverage for MapState: Process + HandleA covered, HandleB not covered
      expect(coverage.nested.MapState.total).toBe(3) // Process + HandleA + HandleB
      expect(coverage.nested.MapState.covered).toBe(2) // Process + HandleA
      expect(coverage.nested.MapState.uncovered).toContain('HandleB')

      // Branch coverage (top level only - no Choice at top level)
      expect(coverage.branches.total).toBe(0) // No Choice at top level
      expect(coverage.branches.covered).toBe(0) // No branches at top level
    })
  })

  describe('Distributed Map with real workflow', () => {
    it('should correctly count states in distributed map example', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'PrepareDataSource',
        States: {
          PrepareDataSource: {
            Type: 'Pass',
            Next: 'ProcessLargeDataset',
          },
          ProcessLargeDataset: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
                ExecutionType: 'EXPRESS',
              },
              StartAt: 'ProcessBatch',
              States: {
                ProcessBatch: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Next: 'ValidateResults',
                  Catch: [
                    {
                      ErrorEquals: ['States.ALL'],
                      Next: 'HandleBatchError',
                    },
                  ],
                },
                ValidateResults: {
                  Type: 'Choice',
                  Choices: [
                    {
                      Variable: '$.processedCount',
                      NumericGreaterThan: 0,
                      Next: 'LogSuccess',
                    },
                  ],
                  Default: 'LogEmptyBatch',
                },
                LogSuccess: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::aws-sdk:cloudwatchlogs:putLogEvents',
                  End: true,
                },
                LogEmptyBatch: {
                  Type: 'Pass',
                  End: true,
                },
                HandleBatchError: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            Next: 'SummarizeResults',
          } as any,
          SummarizeResults: {
            Type: 'Pass',
            End: true,
          },
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)
      const coverage = tracker.getCoverage()

      // Top level: Should count 3 states only
      expect(coverage.topLevel.total).toBe(3)

      // Total branches: 0 (ValidateResults is inside Map, not top-level)
      expect(coverage.branches.total).toBe(0)
    })

    it('should track coverage with different iteration paths', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'ProcessLargeDataset',
        States: {
          ProcessLargeDataset: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'ProcessBatch',
              States: {
                ProcessBatch: {
                  Type: 'Pass',
                  Next: 'ValidateResults',
                },
                ValidateResults: {
                  Type: 'Choice',
                  Choices: [
                    {
                      Variable: '$.count',
                      NumericGreaterThan: 0,
                      Next: 'LogSuccess',
                    },
                  ],
                  Default: 'LogEmpty',
                },
                LogSuccess: {
                  Type: 'Pass',
                  End: true,
                },
                LogEmpty: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          } as any,
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)

      // Track different paths in different iterations
      tracker.trackExecution(['ProcessLargeDataset'])
      tracker.trackMapExecutions([
        {
          state: 'ProcessLargeDataset',
          iterationPaths: [
            ['ProcessBatch', 'ValidateResults', 'LogSuccess'], // First batch: success
            ['ProcessBatch', 'ValidateResults', 'LogEmpty'], // Second batch: empty
            ['ProcessBatch', 'ValidateResults', 'LogSuccess'], // Third batch: success
          ],
        },
      ])

      const coverage = tracker.getCoverage()

      // Top level: 1 state (ProcessLargeDataset only)
      expect(coverage.topLevel.total).toBe(1)
      expect(coverage.topLevel.covered).toBe(1)
      expect(coverage.topLevel.percentage).toBe(100)

      // No branches at top level (Choice is inside Map)
      expect(coverage.branches.covered).toBe(0)
      expect(coverage.branches.percentage).toBe(100)

      // Nested coverage for ProcessLargeDataset should be complete
      expect(coverage.nested.ProcessLargeDataset).toEqual({
        total: 4,
        covered: 4,
        percentage: 100,
        uncovered: [],
      })
    })
  })

  describe('Bug reproduction tests', () => {
    it('should never exceed 100% coverage even with duplicate tracking', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'State1',
        States: {
          State1: {
            Type: 'Pass',
            Next: 'State2',
          },
          State2: {
            Type: 'Pass',
            Next: 'State3',
          },
          State3: {
            Type: 'Pass',
            End: true,
          },
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)

      // Track the same execution multiple times (this might cause over-counting)
      tracker.trackExecution(['State1', 'State2', 'State3'])
      tracker.trackExecution(['State1', 'State2', 'State3'])
      tracker.trackExecution(['State1', 'State2', 'State3'])
      tracker.trackExecution(['State1', 'State2'])
      tracker.trackExecution(['State1'])

      const coverage = tracker.getCoverage()

      // Even with multiple tracking, total should never exceed 100%
      expect(coverage.topLevel.total).toBe(3)
      expect(coverage.topLevel.covered).toBeLessThanOrEqual(3) // Should never exceed total
      expect(coverage.topLevel.percentage).toBeLessThanOrEqual(100) // Should never exceed 100%

      console.log('Coverage debug:', {
        total: coverage.topLevel.total,
        covered: coverage.topLevel.covered,
        percentage: coverage.topLevel.percentage,
      })
    })

    it('should reproduce 166.7% coverage bug with specific scenario', () => {
      // Create a scenario that might cause the 166.7% bug (5/3 = 1.667)
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'State1',
        States: {
          State1: {
            Type: 'Pass',
            Next: 'State2',
          },
          State2: {
            Type: 'Pass',
            Next: 'State3',
          },
          State3: {
            Type: 'Pass',
            End: true,
          },
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)

      // Try to simulate the conditions that might cause over-counting
      // This could happen if states are tracked through multiple different mechanisms
      tracker.trackExecution(['State1', 'State2', 'State3'])

      // Maybe the bug happens when trackExecution is called with partial paths
      // and then the coverage is somehow accumulated incorrectly
      tracker.trackExecution(['State1', 'State2'])
      tracker.trackExecution(['State2', 'State3'])
      tracker.trackExecution(['State1'])
      tracker.trackExecution(['State2'])

      const coverage = tracker.getCoverage()

      console.log('Potential bug scenario:', {
        total: coverage.topLevel.total,
        covered: coverage.topLevel.covered,
        percentage: coverage.topLevel.percentage,
        // Remove access to private property
        // coveredStates: Array.from(tracker.coverage.coveredStates || [])
      })

      // The bug would be if covered > total
      expect(coverage.topLevel.total).toBe(3)
      expect(coverage.topLevel.covered).toBeLessThanOrEqual(3) // Should never exceed total
      expect(coverage.topLevel.percentage).toBeLessThanOrEqual(100) // Should never exceed 100%
    })

    it('should handle complex Map scenario without exceeding 100%', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'StartState',
        States: {
          StartState: {
            Type: 'Pass',
            Next: 'MapState',
          },
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            Next: 'EndState',
          } as any,
          EndState: {
            Type: 'Pass',
            End: true,
          },
        },
      })

      const tracker = new NestedCoverageTracker(stateMachine)

      // Multiple overlapping executions
      tracker.trackExecution(['StartState', 'MapState', 'EndState'])
      tracker.trackExecution(['StartState', 'MapState'])
      tracker.trackMapExecutions([
        {
          state: 'MapState',
          iterationPaths: [['ProcessItem'], ['ProcessItem'], ['ProcessItem']],
        },
      ])

      const coverage = tracker.getCoverage()

      // Verify top-level never exceeds total
      expect(coverage.topLevel.total).toBe(3) // StartState, MapState, EndState
      expect(coverage.topLevel.covered).toBeLessThanOrEqual(3)
      expect(coverage.topLevel.percentage).toBeLessThanOrEqual(100)

      console.log('Map coverage debug:', {
        topLevel: coverage.topLevel,
        nested: coverage.nested,
      })
    })
  })
})
