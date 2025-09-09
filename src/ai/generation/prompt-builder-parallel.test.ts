import { describe, expect, it } from 'vitest'
import { StateFactory, type StateMachine } from '../../types/asl'
import { PromptBuilder } from './prompt-builder'

describe('PromptBuilder - Parallel State Mock Generation', () => {
  describe('Parallel state with nested tasks', () => {
    it('should identify all tasks inside Parallel branches for mock generation', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'State machine with Parallel state containing tasks',
        StartAt: 'InitializeData',
        States: {
          InitializeData: {
            Type: 'Pass',
            Next: 'ParallelChecks',
          },
          ParallelChecks: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'CheckServiceA',
                States: {
                  CheckServiceA: {
                    Type: 'Task',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Parameters: {
                      FunctionName: 'ServiceAChecker',
                      Payload: {
                        'input.$': '$',
                      },
                    },
                    End: true,
                  },
                },
              },
              {
                StartAt: 'CheckServiceB',
                States: {
                  CheckServiceB: {
                    Type: 'Task',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Parameters: {
                      FunctionName: 'ServiceBChecker',
                      Payload: {
                        'input.$': '$',
                      },
                    },
                    Next: 'ProcessServiceBResult',
                  },
                  ProcessServiceBResult: {
                    Type: 'Task',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Parameters: {
                      FunctionName: 'ServiceBProcessor',
                      'Payload.$': '$.Payload',
                    },
                    End: true,
                  },
                },
              },
            ],
            Next: 'FinalStep',
          },
          FinalStep: {
            Type: 'Succeed',
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // Parallelステート内のすべてのタスクが言及されることを確認
      expect(prompt).toContain('CheckServiceA')
      expect(prompt).toContain('CheckServiceB')
      expect(prompt).toContain('ProcessServiceBResult')

      // モック可能なステートのリストに含まれることを確認
      expect(prompt).toContain('Mockable States')

      // Parallel内部タスクへの特別な指示があることを確認
      const hasParallelInstructions =
        prompt.includes('Parallel branches') ||
        prompt.includes('nested states') ||
        prompt.includes('branch states')
      expect(hasParallelInstructions).toBe(true)
    })

    it('should handle JSONata mode Parallel states with nested tasks', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'JSONata mode Parallel state',
        StartAt: 'PrepareData',
        States: {
          PrepareData: {
            Type: 'Pass',
            QueryLanguage: 'JSONata',
            Assign: {
              config: '{% { "timeout": 30000 } %}',
            },
            Next: 'ParallelValidation',
          },
          ParallelValidation: {
            Type: 'Parallel',
            QueryLanguage: 'JSONata',
            Branches: [
              {
                StartAt: 'ValidateFormat',
                States: {
                  ValidateFormat: {
                    Type: 'Task',
                    QueryLanguage: 'JSONata',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Arguments: {
                      FunctionName: 'FormatValidator',
                      Payload: '{% { "data": $states.input } %}',
                    },
                    End: true,
                  },
                },
              },
              {
                StartAt: 'ValidateContent',
                States: {
                  ValidateContent: {
                    Type: 'Task',
                    QueryLanguage: 'JSONata',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Arguments: {
                      FunctionName: 'ContentValidator',
                      Payload: '{% { "data": $states.input, "config": $config } %}',
                    },
                    End: true,
                  },
                },
              },
            ],
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // JSONataモードのParallel内タスクも認識されることを確認
      expect(prompt).toContain('ValidateFormat')
      expect(prompt).toContain('ValidateContent')

      // JSONataモード特有の説明があることを確認
      expect(prompt).toContain('JSONata')
    })

    it('should provide clear naming conventions for nested states', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Complex nested structure',
        StartAt: 'MainParallel',
        States: {
          MainParallel: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Branch1Task',
                States: {
                  Branch1Task: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Function1',
                    End: true,
                  },
                },
              },
              {
                StartAt: 'Branch2Map',
                States: {
                  Branch2Map: {
                    Type: 'Map',
                    ItemsPath: '$.items',
                    ItemProcessor: {
                      ProcessorConfig: {
                        Mode: 'INLINE',
                      },
                      StartAt: 'MapTask',
                      States: {
                        MapTask: {
                          Type: 'Task',
                          Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MapFunction',
                          End: true,
                        },
                      },
                    },
                    End: true,
                  },
                },
              },
            ],
            End: true,
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // ネストした状態の命名規則が説明されていることを確認
      expect(prompt).toContain('Branch1Task')
      expect(prompt).toContain('Branch2Map')
      expect(prompt).toContain('MapTask')

      // 命名規則の説明を確認
      const hasNamingGuidance =
        prompt.includes('state name only') ||
        prompt.includes('without parent') ||
        prompt.includes('NOT "ParallelState.Branch') ||
        prompt.includes('use ONLY the state name')
      expect(hasNamingGuidance).toBe(true)
    })

    it('should list all mockable states including those in Parallel branches', () => {
      const promptBuilder = new PromptBuilder()
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        Comment: 'Testing mockable states listing',
        StartAt: 'Start',
        States: {
          Start: {
            Type: 'Pass',
            Next: 'ParallelExecution',
          },
          ParallelExecution: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Task1',
                States: {
                  Task1: {
                    Type: 'Task',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Parameters: {
                      FunctionName: 'Function1',
                      Payload: {},
                    },
                    Next: 'Task2',
                  },
                  Task2: {
                    Type: 'Task',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Parameters: {
                      FunctionName: 'Function2',
                      Payload: {},
                    },
                    End: true,
                  },
                },
              },
              {
                StartAt: 'Task3',
                States: {
                  Task3: {
                    Type: 'Task',
                    Resource: 'arn:aws:states:::lambda:invoke',
                    Parameters: {
                      FunctionName: 'Function3',
                      Payload: {},
                    },
                    End: true,
                  },
                },
              },
            ],
            Next: 'End',
          },
          End: {
            Type: 'Succeed',
          },
        },
      })

      const prompt = promptBuilder.buildMockPrompt(stateMachine)

      // モック可能なステートのセクションを確認
      expect(prompt).toContain('The following states can be mocked:')

      // すべてのタスクがリストされていることを確認
      const mockableStatesSection =
        prompt.match(/The following states can be mocked:([\s\S]*?)(?:\n\n|$)/)?.[1] || ''
      expect(mockableStatesSection).toContain('Task1')
      expect(mockableStatesSection).toContain('Task2')
      expect(mockableStatesSection).toContain('Task3')
    })
  })
})
