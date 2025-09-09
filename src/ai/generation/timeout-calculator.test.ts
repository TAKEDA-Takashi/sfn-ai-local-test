import { beforeEach, describe, expect, it } from 'vitest'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { TimeoutCalculator } from './timeout-calculator'

/**
 * Helper function to create a proper StateMachine with State instances from raw ASL data
 *
 * The state-traversal utility expects the top-level States to be State instances,
 * but nested states (in ItemProcessor.States and Branches[].States) should remain
 * as raw data because traverseStates() calls StateFactory.createState() on them.
 */
function createStateMachine(aslData: {
  QueryLanguage?: 'JSONPath' | 'JSONata'
  StartAt: string
  States: Record<string, any>
}): StateMachine {
  // Recursively ensure QueryLanguage is set but don't convert nested states to State instances
  function processStatesRecursively(
    states: Record<string, any>,
    queryLanguage: 'JSONPath' | 'JSONata',
  ): Record<string, any> {
    const processed: Record<string, any> = {}

    for (const [stateName, state] of Object.entries(states)) {
      const processedState = { ...state }

      // Set QueryLanguage if not already set at state level
      if (!processedState.QueryLanguage) {
        processedState.QueryLanguage = queryLanguage
      }

      // Handle Map state with ItemProcessor - ItemProcessor inherits Map's QueryLanguage
      if (state.Type === 'Map' && state.ItemProcessor) {
        // Map passes its QueryLanguage to ItemProcessor.States
        const mapQueryLanguage = processedState.QueryLanguage || queryLanguage
        processedState.ItemProcessor = {
          ...state.ItemProcessor,
          States: processStatesRecursively(state.ItemProcessor.States || {}, mapQueryLanguage),
        }
      }

      // Handle Parallel state with Branches - Branches inherit from StateMachine, not Parallel
      if (state.Type === 'Parallel' && Array.isArray(state.Branches)) {
        processedState.Branches = state.Branches.map((branch: any) => ({
          ...branch,
          States: processStatesRecursively(branch.States || {}, queryLanguage),
        }))
      }

      processed[stateName] = processedState
    }

    return processed
  }

  const queryLanguage = aslData.QueryLanguage || 'JSONPath'
  const processedStates = processStatesRecursively(aslData.States, queryLanguage)

  // Convert only the top-level States to State instances
  const states = StateFactory.createStates(processedStates, queryLanguage)

  // Create proper StateMachine
  const stateMachine: StateMachine = {
    QueryLanguage: queryLanguage,
    StartAt: aslData.StartAt,
    States: states,
  }

  return stateMachine
}

describe('TimeoutCalculator', () => {
  let calculator: TimeoutCalculator

  beforeEach(() => {
    calculator = new TimeoutCalculator()
  })

  describe('calculateTimeout', () => {
    it('should respect user-provided timeout', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'State1',
        States: {
          State1: { Type: 'Pass' },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine, 300000)
      expect(timeout).toBe(300000)
    })

    it('should calculate timeout for simple state machine', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'State1',
        States: {
          State1: { Type: 'Pass' },
          State2: { Type: 'Task', Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test' },
          State3: { Type: 'Succeed' },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // Base: 60000 + (3 states * 2000) = 66000
      expect(timeout).toBe(66000)
    })

    it('should increase timeout for Map states', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test',
                },
              },
            },
          },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // Base: 60000 + (2 states * 2000) = 64000
      // Map multiplier: 64000 * 1.5 = 96000
      expect(timeout).toBe(96000)
    })

    it('should increase timeout significantly for DistributedMap', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'DistMapState',
        States: {
          DistMapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'Process',
              States: {
                Process: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test',
                },
              },
            },
          },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // Base: 60000 + (2 states * 2000) = 64000
      // DistributedMap multiplier: 64000 * 2.0 = 128000
      expect(timeout).toBe(128000)
    })

    it('should handle complex nested structures', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'ParallelState',
        States: {
          ParallelState: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Branch1Map',
                States: {
                  Branch1Map: {
                    Type: 'Map',
                    ItemProcessor: {
                      StartAt: 'DeepTask',
                      States: {
                        DeepTask: {
                          Type: 'Task',
                          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test',
                        },
                      },
                    },
                  },
                },
              },
              {
                StartAt: 'Branch2',
                States: {
                  Branch2: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test',
                  },
                },
              },
            ],
          },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // 4 total states, with Map and Parallel multipliers
      expect(timeout).toBeGreaterThan(80000)
    })

    it('should apply JSONata multiplier', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONata',
        StartAt: 'State1',
        States: {
          State1: { Type: 'Task', Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test' },
          State2: { Type: 'Pass' },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // Base: 60000 + (2 states * 2000) = 64000
      // JSONata multiplier: 64000 * 1.3 = 83200
      expect(timeout).toBe(83200)
    })

    it('should apply variables multiplier', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'State1',
        States: {
          State1: {
            Type: 'Pass',
            Assign: {
              var1: '$.data',
            },
          },
          State2: { Type: 'Task', Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test' },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // Base: 60000 + (2 states * 2000) = 64000
      // Variables multiplier: 64000 * 1.2 = 76800
      expect(timeout).toBe(76800)
    })

    it('should cap timeout at 10 minutes', () => {
      // Create states object with 100 DistributedMap states
      const states: Record<string, any> = {}
      for (let i = 0; i < 100; i++) {
        states[`State${i}`] = {
          Type: 'Map',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
            },
            StartAt: 'Process',
            States: {
              Process: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:test',
              },
            },
          },
        }
      }

      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'State0',
        States: states,
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      expect(timeout).toBe(600000) // Capped at 10 minutes
    })

    it('should apply deep nesting multiplier', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONPath',
        StartAt: 'Level1',
        States: {
          Level1: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'Level2',
              States: {
                Level2: {
                  Type: 'Parallel',
                  Branches: [
                    {
                      StartAt: 'Level3',
                      States: {
                        Level3: {
                          Type: 'Map',
                          ItemProcessor: {
                            StartAt: 'Level4',
                            States: {
                              Level4: {
                                Type: 'Map',
                                ItemProcessor: {
                                  StartAt: 'Level5',
                                  States: {
                                    Level5: {
                                      Type: 'Task',
                                      Resource:
                                        'arn:aws:lambda:us-east-1:123456789012:function:test',
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      })

      const timeout = calculator.calculateTimeout(stateMachine)
      // Should apply deep nesting multiplier (depth > 3)
      expect(timeout).toBeGreaterThan(90000)
    })
  })

  describe('getTimeoutSuggestion', () => {
    it('should provide helpful suggestion for simple state machine', () => {
      const metrics = {
        totalStates: 5,
        mapStates: 0,
        distributedMapStates: 0,
        parallelStates: 0,
        choiceStates: 0,
        lambdaTasks: 0,
        maxDepth: 1,
        hasVariables: false,
        hasJSONata: false,
        hasItemReaders: false,
        hasResultWriters: false,
      }

      const suggestion = calculator.getTimeoutSuggestion(metrics)
      expect(suggestion).toContain('70 seconds')
      expect(suggestion).toContain('simple state machine')
    })

    it('should list complexity factors', () => {
      const metrics = {
        totalStates: 25,
        mapStates: 2,
        distributedMapStates: 1,
        parallelStates: 1,
        choiceStates: 3,
        lambdaTasks: 10,
        maxDepth: 5,
        hasVariables: true,
        hasJSONata: true,
        hasItemReaders: true,
        hasResultWriters: true,
      }

      const suggestion = calculator.getTimeoutSuggestion(metrics)
      expect(suggestion).toContain('25 states')
      expect(suggestion).toContain('2 Map states')
      expect(suggestion).toContain('1 DistributedMap states')
      expect(suggestion).toContain('1 Parallel states')
      expect(suggestion).toContain('deep nesting')
      expect(suggestion).toContain('JSONata')
    })
  })
})
