import { describe, expect, it } from 'vitest'
import type { JsonObject, MapState } from './asl'
import { StateFactory } from './state-factory'
import { isDistributedMap, isInlineMap, isMap, isTask } from './state-guards'

describe('StateFactory.createStateMachine', () => {
  it('should create a StateMachine with all states converted', () => {
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
    // Verify type discrimination works
    expect(isTask(stateMachine.States.FirstState!)).toBe(true)
    expect(stateMachine.States.SecondState?.Type === 'Pass').toBe(true)
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
    expect(isMap(stateMachine.States.MapState!)).toBe(true)
    // ItemProcessor states should also be converted
    const mapState = stateMachine.States.MapState
    if (mapState && isMap(mapState)) {
      expect(mapState.ItemProcessor).toBeDefined()
      expect(mapState.ItemProcessor?.States.ProcessItem).toBeDefined()
      expect(isTask(mapState.ItemProcessor!.States.ProcessItem!)).toBe(true)
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
    expect(stateMachine.States.FirstState?.QueryLanguage).toBe('JSONata')
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
    // State should still be created with JSONPath (default) - no QueryLanguage set
    expect(stateMachine.States.FirstState?.QueryLanguage).toBeUndefined()
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
      const mapStateData: JsonObject = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      }

      const mapState = StateFactory.createState(mapStateData)

      expect(mapState).toBeDefined()
      expect(mapState.Type).toBe('Map')
    })

    it('should use Map QueryLanguage for ItemProcessor states, overriding state machine default', () => {
      const statesData: JsonObject = {
        MapState: {
          Type: 'Map',
          QueryLanguage: 'JSONPath',
          ItemProcessor: {
            StartAt: 'Process',
            States: {
              Process: {
                Type: 'Pass',
                End: true,
              },
            },
          },
          End: true,
        },
      }

      const states = StateFactory.createStates(statesData, 'JSONata')

      expect(states.MapState).toBeDefined()
      expect(states.MapState?.Type).toBe('Map')
    })
  })

  describe('Parallel State Branches QueryLanguage Inheritance', () => {
    it('should NOT inherit QueryLanguage from Parallel state to Branch states', () => {
      const parallelStateData: JsonObject = {
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Branches: [
          {
            StartAt: 'Branch1Task',
            States: {
              Branch1Task: {
                Type: 'Pass',
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
    })
  })

  describe('QueryLanguage Inheritance Priority', () => {
    it('should follow priority: State > Map > StateMachine', () => {
      const mapStateData: JsonObject = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemProcessor: {
          StartAt: 'Process1',
          States: {
            Process1: {
              Type: 'Pass',
              QueryLanguage: 'JSONPath',
              Next: 'Process2',
            },
            Process2: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      }

      const mapState = StateFactory.createState(mapStateData, 'JSONPath') as MapState

      expect(mapState).toBeDefined()
      expect(mapState.Type).toBe('Map')

      // Process1 should use its own QueryLanguage (JSONPath)
      expect(mapState.ItemProcessor.States.Process1?.QueryLanguage).toBeUndefined()
      // Process2 should inherit from Map (JSONata)
      expect(mapState.ItemProcessor.States.Process2?.QueryLanguage).toBe('JSONata')
    })

    it('should use StateMachine QueryLanguage when Map does not specify', () => {
      const mapStateData: JsonObject = {
        Type: 'Map',
        ItemProcessor: {
          StartAt: 'Process',
          States: {
            Process: {
              Type: 'Pass',
              End: true,
            },
          },
        },
        End: true,
      }

      const mapState = StateFactory.createState(mapStateData, 'JSONata')

      expect(mapState).toBeDefined()
      expect(mapState.Type).toBe('Map')
      // Map itself should use JSONata from StateMachine
      expect(mapState.QueryLanguage).toBe('JSONata')
    })
  })

  describe('State-level QueryLanguage Override', () => {
    it('should allow state to override QueryLanguage when state machine is JSONPath', () => {
      const statesData: JsonObject = {
        Task1: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          Next: 'Task2',
        },
        Task2: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          QueryLanguage: 'JSONata',
          End: true,
        },
      }

      const states = StateFactory.createStates(statesData)

      expect(states.Task1).toBeDefined()
      expect(states.Task2).toBeDefined()

      // Task2 should be created as JSONata state
      expect(states.Task2?.QueryLanguage).toBe('JSONata')
    })

    it('should use state machine QueryLanguage when state does not specify', () => {
      const statesData: JsonObject = {
        Task1: {
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          End: true,
        },
      }

      const states = StateFactory.createStates(statesData, 'JSONata')

      expect(states.Task1).toBeDefined()
      // Should be created as JSONata state
      expect(states.Task1?.QueryLanguage).toBe('JSONata')
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

describe('StateFactory Validation Boundary Tests', () => {
  describe('JSONPath mode rejects JSONata-only fields', () => {
    it('should throw error when Task state has Arguments in JSONPath mode', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Task',
          Resource: 'arn:aws:lambda:test',
          Arguments: { key: 'value' },
          End: true,
        }),
      ).toThrow('Task state does not support the following field: Arguments')
    })

    it('should throw error when Pass state has Output in JSONPath mode', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Pass',
          Output: { key: 'value' },
          End: true,
        }),
      ).toThrow('Pass state does not support the following field: Output')
    })

    it('should throw error when Wait state has Arguments in JSONPath mode', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Wait',
          Seconds: 10,
          Arguments: { key: 'value' },
          End: true,
        }),
      ).toThrow('Wait state does not support the following field: Arguments')
    })
  })

  describe('JSONata mode rejects JSONPath-only fields', () => {
    it('should throw error when JSONata Pass state has Parameters', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Pass',
          QueryLanguage: 'JSONata',
          Parameters: { key: 'value' },
          End: true,
        }),
      ).toThrow('Parameters field is not supported in JSONata mode. Use Arguments field instead')
    })

    it('should throw error when JSONata Wait state has SecondsPath', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Wait',
          QueryLanguage: 'JSONata',
          SecondsPath: '$.delay',
          End: true,
        }),
      ).toThrow('SecondsPath field is not supported in JSONata mode. Use Seconds field instead')
    })

    it('should throw error when JSONata Wait state has TimestampPath', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Wait',
          QueryLanguage: 'JSONata',
          TimestampPath: '$.ts',
          End: true,
        }),
      ).toThrow('TimestampPath field is not supported in JSONata mode. Use Timestamp field instead')
    })
  })

  describe('Map/DistributedMap field validation', () => {
    it('should create InlineMap state without ProcessorMode', () => {
      const state = StateFactory.createState({
        Type: 'Map',
        ItemProcessor: {
          StartAt: 'Process',
          States: { Process: { Type: 'Pass', End: true } },
        },
        End: true,
      })
      expect(isInlineMap(state)).toBe(true)
      expect(isDistributedMap(state)).toBe(false)
    })

    it('should create DistributedMap state with ProcessorMode DISTRIBUTED', () => {
      const state = StateFactory.createState({
        Type: 'Map',
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'Process',
          States: { Process: { Type: 'Pass', End: true } },
        },
        End: true,
      })
      expect(isDistributedMap(state)).toBe(true)
      expect(isInlineMap(state)).toBe(false)
    })

    it('should throw error when Map state has no ItemProcessor or Iterator', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          End: true,
        }),
      ).toThrow('Map state requires ItemProcessor or Iterator field')
    })

    it('should throw error when ItemProcessor has no StartAt', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Map',
          ItemProcessor: {
            States: { Process: { Type: 'Pass', End: true } },
          },
          End: true,
        }),
      ).toThrow('ItemProcessor/Iterator requires StartAt field')
    })
  })

  describe('Unsupported Set composition (JSONata + specific state types)', () => {
    it('should allow JSONata Task state with Arguments', () => {
      const state = StateFactory.createState({
        Type: 'Task',
        QueryLanguage: 'JSONata',
        Resource: 'arn:aws:states:::lambda:invoke',
        Arguments: { FunctionName: 'test', Payload: '{% $states.input %}' },
        End: true,
      })
      expect(state.Type).toBe('Task')
      expect(state.QueryLanguage).toBe('JSONata')
    })

    it('should allow JSONata Map state with Items', () => {
      const state = StateFactory.createState({
        Type: 'Map',
        QueryLanguage: 'JSONata',
        Items: '{% $states.input.items %}',
        ItemProcessor: {
          StartAt: 'Process',
          States: { Process: { Type: 'Pass', End: true } },
        },
        End: true,
      })
      expect(state.Type).toBe('Map')
      expect(state.QueryLanguage).toBe('JSONata')
    })

    it('should allow JSONata Parallel state with Arguments and Output', () => {
      const state = StateFactory.createState({
        Type: 'Parallel',
        QueryLanguage: 'JSONata',
        Arguments: { data: '{% $states.input %}' },
        Output: '{% $states.result %}',
        Branches: [{ StartAt: 'B', States: { B: { Type: 'Pass', End: true } } }],
        End: true,
      })
      expect(state.Type).toBe('Parallel')
      expect(state.QueryLanguage).toBe('JSONata')
    })

    it('should reject multiple JSONPath-only fields in JSONata mode', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Task',
          QueryLanguage: 'JSONata',
          Resource: 'arn:aws:states:::lambda:invoke',
          Arguments: { FunctionName: 'test' },
          InputPath: '$.data',
          OutputPath: '$.result',
          End: true,
        }),
      ).toThrow('does not support the following fields: InputPath, OutputPath')
    })
  })

  describe('Terminal state field restrictions', () => {
    it('should throw error when Succeed state has Next field', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Succeed',
          Next: 'SomeState',
        }),
      ).toThrow('Terminal state Succeed cannot have a Next field')
    })

    it('should throw error when Fail state has Next field', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Fail',
          Error: 'E',
          Next: 'SomeState',
        }),
      ).toThrow('Terminal state Fail cannot have a Next field')
    })

    it('should throw error when Fail state has both Cause and CausePath', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Fail',
          Cause: 'cause',
          CausePath: '$.cause',
        }),
      ).toThrow('Fail state cannot have both Cause and CausePath fields')
    })

    it('should throw error when Fail state has both Error and ErrorPath', () => {
      expect(() =>
        StateFactory.createState({
          Type: 'Fail',
          Error: 'error',
          ErrorPath: '$.error',
        }),
      ).toThrow('Fail state cannot have both Error and ErrorPath fields')
    })
  })
})
