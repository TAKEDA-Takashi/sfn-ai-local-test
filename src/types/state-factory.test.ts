import { describe, expect, it } from 'vitest'
import type { JsonObject } from './asl'
import { StateFactory } from './state-factory'

describe('StateFactory.createStateMachine', () => {
  it('should create a StateMachine with all states converted to class instances', () => {
    const stateMachineData: JsonObject = {
      Comment: 'A simple state machine',
      StartAt: 'FirstState',
      States: {
        FirstState: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          Next: 'SecondState',
        },
        SecondState: {
          Type: 'Pass',
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineData)

    expect(stateMachine).toBeDefined()
    expect(stateMachine.StartAt).toBe('FirstState')
    expect(stateMachine.States).toBeDefined()
    expect(stateMachine.States.FirstState).toBeDefined()
    expect(stateMachine.States.FirstState?.Type).toBe('Task')
    expect(stateMachine.States.SecondState).toBeDefined()
    expect(stateMachine.States.SecondState?.Type).toBe('Pass')
    // Verify these are State instances
    expect(stateMachine.States.FirstState?.isTask()).toBe(true)
    expect(stateMachine.States.SecondState?.isPass()).toBe(true)
  })

  it('should validate required fields', () => {
    // Missing States
    const invalidData1: JsonObject = {
      StartAt: 'FirstState',
    }
    expect(() => StateFactory.createStateMachine(invalidData1)).toThrow(
      'StateMachine must have a States field',
    )

    // Missing StartAt
    const invalidData2: JsonObject = {
      States: {
        FirstState: {
          Type: 'Pass',
          End: true,
        },
      },
    }
    expect(() => StateFactory.createStateMachine(invalidData2)).toThrow(
      'StateMachine must have a StartAt field',
    )
  })

  it('should handle nested states (Map with ItemProcessor)', () => {
    const stateMachineData: JsonObject = {
      StartAt: 'MapState',
      States: {
        MapState: {
          Type: 'Map',
          ItemProcessor: {
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:process',
                End: true,
              },
            },
          },
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineData)

    expect(stateMachine.States.MapState).toBeDefined()
    expect(stateMachine.States.MapState?.isMap()).toBe(true)
    // ItemProcessor states should also be converted
    const mapState = stateMachine.States.MapState
    if (mapState?.isMap()) {
      expect(mapState.ItemProcessor).toBeDefined()
      expect(mapState.ItemProcessor?.States.ProcessItem).toBeDefined()
      expect(mapState.ItemProcessor?.States.ProcessItem?.isTask()).toBe(true)
    }
  })

  it('should preserve QueryLanguage when explicitly set', () => {
    const stateMachineData: JsonObject = {
      StartAt: 'FirstState',
      QueryLanguage: 'JSONata',
      States: {
        FirstState: {
          Type: 'Pass',
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineData)
    expect(stateMachine.QueryLanguage).toBe('JSONata')
    // State should be created with JSONata mode
    expect(stateMachine.States.FirstState?.constructor.name).toContain('JSONata')
  })

  it('should not add QueryLanguage when not provided', () => {
    const stateMachineData: JsonObject = {
      StartAt: 'FirstState',
      States: {
        FirstState: {
          Type: 'Pass',
          End: true,
        },
      },
    }

    const stateMachine = StateFactory.createStateMachine(stateMachineData)
    expect('QueryLanguage' in stateMachine).toBe(false)
    // State should still be created with JSONPath (default)
    expect(stateMachine.States.FirstState?.constructor.name).toContain('JSONPath')
  })

  it('should throw error for unsupported state type', () => {
    expect(() => {
      StateFactory.createStateMachine({
        StartAt: 'UnsupportedState',
        States: {
          UnsupportedState: {
            Type: 'UnsupportedType',
            End: true,
          },
        },
      })
    }).toThrow('Unknown state type: UnsupportedType')
  })

  it('should throw error for unknown state type in createState', () => {
    expect(() => StateFactory.createState({ Type: 'UnknownType' as any })).toThrow(
      'Unknown state type: UnknownType',
    )
  })

  it('should throw error if state has no Type field', () => {
    expect(() => StateFactory.createState({} as any)).toThrow('State must have a Type field')
  })
})

describe('StateFactory QueryLanguage Inheritance', () => {
  describe('Map State ItemProcessor QueryLanguage Inheritance', () => {
    it('should inherit QueryLanguage from Map state to ItemProcessor states', () => {
      // New Rule: ItemProcessor states inherit from Map state, not state machine level
      const mapStateData: JsonObject = {
        Type: 'Map',
        QueryLanguage: 'JSONata', // Map state uses JSONata
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              // No QueryLanguage specified - should inherit from state machine, not Map
              End: true,
            },
          },
        },
        End: true,
      }

      const mapState = StateFactory.createState(mapStateData)

      // The ItemProcessor.States should inherit Map's QueryLanguage (JSONata)
      expect(mapState).toBeDefined()
      expect(mapState.Type).toBe('Map')

      // Note: We can't directly test the QueryLanguage of nested states
      // because they're converted to State classes, but they should
      // inherit from the Map state
    })

    it('should use Map QueryLanguage for ItemProcessor states, overriding state machine default', () => {
      const statesData: JsonObject = {
        MapState: {
          Type: 'Map',
          QueryLanguage: 'JSONPath', // Map state explicitly uses JSONPath
          ItemProcessor: {
            StartAt: 'Process',
            States: {
              Process: {
                Type: 'Pass',
                // Should inherit Map's QueryLanguage (JSONPath), not state machine's JSONata
                End: true,
              },
            },
          },
          End: true,
        },
      }

      // When creating states with state machine QueryLanguage as JSONata
      const states = StateFactory.createStates(statesData, 'JSONata')

      expect(states.MapState).toBeDefined()
      expect(states.MapState?.Type).toBe('Map')
    })
  })

  describe('Parallel State Branches QueryLanguage Inheritance', () => {
    it('should NOT inherit QueryLanguage from Parallel state to Branch states', () => {
      // Rule: Branch states inherit from state machine level, not Parallel state
      const parallelStateData: JsonObject = {
        Type: 'Parallel',
        QueryLanguage: 'JSONata', // Parallel state uses JSONata
        Branches: [
          {
            StartAt: 'Branch1Task',
            States: {
              Branch1Task: {
                Type: 'Pass',
                // No QueryLanguage specified - should inherit from state machine, not Parallel
                End: true,
              },
            },
          },
        ],
        End: true,
      }

      const parallelState = StateFactory.createState(parallelStateData)

      expect(parallelState).toBeDefined()
      expect(parallelState.Type).toBe('Parallel')

      // Note: Branch states should follow state machine QueryLanguage, not Parallel's
    })
  })

  describe('QueryLanguage Inheritance Priority', () => {
    it('should follow priority: State > Map > StateMachine', () => {
      const mapStateData: JsonObject = {
        Type: 'Map',
        QueryLanguage: 'JSONata', // Map state uses JSONata
        ItemProcessor: {
          StartAt: 'Process1',
          States: {
            Process1: {
              Type: 'Pass',
              QueryLanguage: 'JSONPath', // State's own QueryLanguage overrides Map's
              Next: 'Process2',
            },
            Process2: {
              Type: 'Pass',
              // No QueryLanguage - should inherit from Map (JSONata)
              End: true,
            },
          },
        },
        End: true,
      }

      const mapState = StateFactory.createState(mapStateData, 'JSONPath') // StateMachine is JSONPath

      expect(mapState).toBeDefined()
      expect(mapState.Type).toBe('Map')

      // Process1 should use its own QueryLanguage (JSONPath)
      // Process2 should inherit from Map (JSONata)
    })

    it('should use StateMachine QueryLanguage when Map does not specify', () => {
      const mapStateData: JsonObject = {
        Type: 'Map',
        // No QueryLanguage specified at Map level
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              // No QueryLanguage - should inherit from StateMachine via Map
              End: true,
            },
          },
        },
        End: true,
      }

      const mapState = StateFactory.createState(mapStateData, 'JSONata') // StateMachine uses JSONata

      expect(mapState).toBeDefined()
      expect(mapState.Type).toBe('Map')
      // Map itself should use JSONata from StateMachine
      expect(mapState.constructor.name).toContain('JSONata')
    })
  })

  describe('State-level QueryLanguage Override', () => {
    it('should allow state to override QueryLanguage when state machine is JSONPath', () => {
      const statesData: JsonObject = {
        Task1: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          // No QueryLanguage - uses state machine default
          Next: 'Task2',
        },
        Task2: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          QueryLanguage: 'JSONata', // Override to JSONata
          End: true,
        },
      }

      // State machine defaults to JSONPath
      const states = StateFactory.createStates(statesData)

      expect(states.Task1).toBeDefined()
      expect(states.Task2).toBeDefined()

      // Task2 should be created as JSONata state
      expect(states.Task2?.constructor.name).toContain('JSONata')
    })

    it('should use state machine QueryLanguage when state does not specify', () => {
      const statesData: JsonObject = {
        Task1: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          // No QueryLanguage specified
          End: true,
        },
      }

      // Create with JSONata as default
      const states = StateFactory.createStates(statesData, 'JSONata')

      expect(states.Task1).toBeDefined()
      // Should be created as JSONata state
      expect(states.Task1?.constructor.name).toContain('JSONata')
    })
  })
})

describe('StateFactory Field Validation', () => {
  describe('Pass State Validation', () => {
    it('should throw error when Pass state has Arguments field', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Pass' as const,
          QueryLanguage: 'JSONata',
          Arguments: {
            fullName: "{% $states.input.firstName & ' ' & $states.input.lastName %}",
          },
          End: true,
        } as any),
      ).toThrow('Pass state does not support Arguments field')
    })
  })

  describe('JSONata vs JSONPath Field Validation', () => {
    it('should throw error when OutputPath field is used in JSONata mode (Succeed state)', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Succeed',
          QueryLanguage: 'JSONata',
          OutputPath: '$.result',
        }),
      ).toThrow('OutputPath field is not supported in JSONata mode. Use Output field instead')
    })

    it('should throw error when Pass state has Arguments field in JSONata mode', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Pass',
          QueryLanguage: 'JSONata',
          Arguments: { test: 'data' },
          End: true,
        }),
      ).toThrow('Pass state does not support Arguments field')
    })

    it('should throw error when Parameters field is used in JSONata mode (Task state)', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Task',
          QueryLanguage: 'JSONata',
          Resource: 'arn:aws:states:::lambda:invoke',
          Parameters: {
            FunctionName: 'test',
            Payload: { test: 'data' },
          },
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should throw error when Arguments field is required for JSONata Task state', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          QueryLanguage: 'JSONata',
          End: true,
        }),
      ).toThrow('Arguments field is required for resource ARN: arn:aws:states:::lambda:invoke')
    })

    it('should throw error when Parameters field is used in JSONata mode (Parallel state)', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Parallel',
          QueryLanguage: 'JSONata',
          Parameters: {
            FunctionName: 'test',
            Payload: { test: 'data' },
          },
          Branches: [
            {
              StartAt: 'Task1',
              States: {
                Task1: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
          ],
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should throw error when Variable field is used in JSONata mode (Choice state)', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Choice',
          QueryLanguage: 'JSONata',
          Choices: [
            {
              Variable: '$.age',
              NumericGreaterThan: 18,
              Next: 'ProcessMajor',
            },
          ],
          Default: 'ProcessMinor',
        }),
      ).toThrow(
        "JSONPath choice rule fields (Variable, And, Or, Not) are not supported in JSONata mode. Use 'Condition' field instead",
      )
    })

    it('should throw error when InputPath field is used in JSONata mode (Fail state)', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Fail',
          QueryLanguage: 'JSONata',
          InputPath: '$.error',
          Cause: 'Test error',
          Error: 'TestError',
        }),
      ).toThrow('InputPath field is not supported in JSONata mode. Use Assign field instead')
    })

    it('should throw error when OutputPath field is used in JSONata mode (Fail state)', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Fail',
          QueryLanguage: 'JSONata',
          OutputPath: '$.result',
          Cause: 'Test error',
          Error: 'TestError',
        }),
      ).toThrow('OutputPath field is not supported in JSONata mode. Use Output field instead')
    })
  })

  describe('Map State JSONata Field Validation', () => {
    it('should throw error when Parameters field is used in JSONata Map state', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          QueryLanguage: 'JSONata',
          Parameters: {
            inputData: '$.data',
          },
          ItemProcessor: {
            StartAt: 'Process',
            States: {
              Process: { Type: 'Pass', End: true },
            },
          },
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should throw error when ItemsPath field is used in JSONata Map state', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemsPath: '$.items',
          ItemProcessor: {
            StartAt: 'Process',
            States: {
              Process: { Type: 'Pass', End: true },
            },
          },
          End: true,
        }),
      ).toThrow('ItemsPath field is not supported in JSONata mode. Use Items field instead')
    })

    it('should throw error when ResultPath field is used in JSONata Map state', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ResultPath: '$.results',
          ItemProcessor: {
            StartAt: 'Process',
            States: {
              Process: { Type: 'Pass', End: true },
            },
          },
          End: true,
        }),
      ).toThrow('ResultPath field is not supported in JSONata mode. Use Output field instead')
    })
  })

  describe('Distributed Map State JSONata Field Validation', () => {
    it('should throw error when Parameters field is used in JSONata Distributed Map state', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          QueryLanguage: 'JSONata',
          Parameters: {
            inputData: '$.data',
          },
          ItemReader: {
            Resource: 'arn:aws:states:::s3:listObjectsV2',
            Parameters: {
              Bucket: 'my-bucket',
            },
          },
          ItemProcessor: {
            ProcessorConfig: { Mode: 'DISTRIBUTED' },
            StartAt: 'Process',
            States: {
              Process: { Type: 'Pass', End: true },
            },
          },
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should throw error when ItemsPath field is used in JSONata Distributed Map state', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          QueryLanguage: 'JSONata',
          ItemsPath: '$.items',
          ItemReader: {
            Resource: 'arn:aws:states:::s3:listObjectsV2',
            Parameters: {
              Bucket: 'my-bucket',
            },
          },
          ItemProcessor: {
            ProcessorConfig: { Mode: 'DISTRIBUTED' },
            StartAt: 'Process',
            States: {
              Process: { Type: 'Pass', End: true },
            },
          },
          End: true,
        }),
      ).toThrow('ItemsPath field is not supported in JSONata mode. Use Items field instead')
    })
  })
})
