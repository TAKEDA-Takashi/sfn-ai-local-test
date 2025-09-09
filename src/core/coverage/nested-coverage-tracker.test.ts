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

      // Should count 1 top-level + 4 nested states = 5 total
      expect(coverage.states.total).toBe(5)
      // Should count 2 branches (Choice has 1 choice + 1 default)
      expect(coverage.branches.total).toBe(2)
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

      // Total: 3 states (1 top + 2 nested)
      expect(coverage.states.total).toBe(3)
      // All should be covered
      expect(coverage.states.covered).toBe(3)
      expect(coverage.states.percentage).toBe(100)

      // Check nested coverage report
      expect(coverage.nestedCoverage).toBeDefined()
      expect(coverage.nestedCoverage?.MapState).toEqual({
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

      // Total: 4 states (1 top + 3 nested)
      expect(coverage.states.total).toBe(4)
      // Covered: 3 states (MapState, Process, HandleA)
      expect(coverage.states.covered).toBe(3)
      // HandleB is not covered
      expect(coverage.states.uncovered).toContain('MapState.HandleB')

      // Branch coverage
      expect(coverage.branches.total).toBe(2) // Choice + Default
      expect(coverage.branches.covered).toBe(1) // Only Choice branch covered
      expect(coverage.branches.uncovered).toContain('MapState.Process->HandleB')
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

      // Total states: 3 top-level + 5 nested = 8
      expect(coverage.states.total).toBe(8)

      // Total branches: 2 (ValidateResults has 1 choice + 1 default)
      expect(coverage.branches.total).toBe(2)
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

      // All states should be covered
      expect(coverage.states.covered).toBe(5) // 1 top + 4 nested
      expect(coverage.states.percentage).toBe(100)

      // All branches should be covered
      expect(coverage.branches.covered).toBe(2)
      expect(coverage.branches.percentage).toBe(100)

      // Nested coverage should be complete
      expect(coverage.nestedCoverage?.ProcessLargeDataset).toEqual({
        total: 4,
        covered: 4,
        percentage: 100,
        uncovered: [],
      })
    })
  })
})
