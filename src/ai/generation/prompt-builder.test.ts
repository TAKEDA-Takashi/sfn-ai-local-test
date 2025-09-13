import { beforeEach, describe, expect, it } from 'vitest'
import type { JsonObject, StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { PromptBuilder } from './prompt-builder'

// Helper function to create a StateMachine with proper State instances
function createStateMachine(config: Record<string, unknown>): StateMachine {
  const result = { ...config }

  // Add QueryLanguage if not specified
  if (!result.QueryLanguage) {
    result.QueryLanguage = 'JSONPath'
  }

  // Add StartAt if not specified
  if (!result.StartAt && result.States && typeof result.States === 'object') {
    const stateNames = Object.keys(result.States)
    if (stateNames.length > 0) {
      result.StartAt = stateNames[0]
    }
  }

  return StateFactory.createStateMachine(result as JsonObject)
}

describe('PromptBuilder', () => {
  let builder: PromptBuilder

  beforeEach(() => {
    builder = new PromptBuilder()
  })

  describe('detectChoiceLoops', () => {
    it('should detect TimestampEqualsPath as problematic pattern', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckTime',
        States: {
          CheckTime: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.timestamp',
                TimestampEqualsPath: '$$.Execution.StartTime',
                Next: 'Process',
              },
            ],
            Default: 'Wait',
          },
          Wait: {
            Type: 'Wait',
            Seconds: 10,
            Next: 'CheckTime',
          },
          Process: {
            Type: 'Succeed',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
      expect(result.problematicStates).toContain('CheckTime')
    })

    it('should detect TimestampLessThanPath as problematic pattern', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckDeadline',
        States: {
          CheckDeadline: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.currentTime',
                TimestampLessThanPath: '$.deadline',
                Next: 'Continue',
              },
            ],
            Default: 'Timeout',
          },
          Continue: {
            Type: 'Succeed',
          },
          Timeout: {
            Type: 'Fail',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
      expect(result.problematicStates).toContain('CheckDeadline')
    })

    it('should detect context variables like $$.Task.Token', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckState',
        States: {
          CheckState: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$$.Task.Token',
                IsPresent: true,
                Next: 'Process',
              },
            ],
            Default: 'Wait',
          },
          Wait: {
            Type: 'Wait',
            Seconds: 5,
            Next: 'CheckState',
          },
          Process: {
            Type: 'Succeed',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
      expect(result.problematicStates).toContain('CheckState')
    })

    it('should detect structural loops even without timestamp patterns', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckCounter',
        States: {
          CheckCounter: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.counter',
                NumericGreaterThan: 10,
                Next: 'Done',
              },
            ],
            Default: 'Increment',
          },
          Increment: {
            Type: 'Pass',
            ResultPath: '$.counter',
            Next: 'CheckCounter',
          },
          Done: {
            Type: 'Succeed',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasStructuralLoops).toBe(true)
      expect(result.problematicStates).toContain('CheckCounter')
    })

    it('should detect JSONata mode non-deterministic functions', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONata',
        StartAt: 'RandomChoice',
        States: {
          RandomChoice: {
            Type: 'Choice',
            QueryLanguage: 'JSONata',
            Choices: [
              {
                Condition: '{% $random() > 0.5 %}',
                Next: 'PathA',
              },
            ],
            Default: 'PathB',
          },
          PathA: {
            Type: 'Succeed',
          },
          PathB: {
            Type: 'Succeed',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
      expect(result.problematicStates).toContain('RandomChoice')
    })

    it('should not flag normal deterministic Choice states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckValue',
        States: {
          CheckValue: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.status',
                StringEquals: 'COMPLETE',
                Next: 'Success',
              },
              {
                Variable: '$.status',
                StringEquals: 'FAILED',
                Next: 'Failure',
              },
            ],
            Default: 'Unknown',
          },
          Success: {
            Type: 'Succeed',
          },
          Failure: {
            Type: 'Fail',
          },
          Unknown: {
            Type: 'Fail',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(false)
      expect(result.hasStructuralLoops).toBe(false)
      expect(result.problematicStates).toHaveLength(0)
    })

    it('should detect the polling wait-and-retry pattern', () => {
      const stateMachine = createStateMachine({
        StartAt: 'Query',
        States: {
          Query: {
            Type: 'Task',
            Resource: 'arn:aws:states:::aws-sdk:dynamodb:query',
            Next: 'Running Choice',
          },
          'Running Choice': {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$SessionItems.Items[0].StartTime.S',
                TimestampEqualsPath: '$$.Execution.StartTime',
                Next: 'Process',
              },
            ],
            Default: 'Current Running Wait',
          },
          'Current Running Wait': {
            Type: 'Wait',
            Seconds: 30,
            Next: 'Query',
          },
          Process: {
            Type: 'Succeed',
          },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
      expect(result.hasStructuralLoops).toBe(true)
      expect(result.problematicStates).toContain('Running Choice')
    })
  })

  describe('hasProblematicChoicePatterns', () => {
    it('should return true for state machines with problematic Choice patterns', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckTime',
        States: {
          CheckTime: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.timestamp',
                TimestampEqualsPath: '$$.Execution.StartTime',
                Next: 'Process',
              },
            ],
            Default: 'Wait',
          },
          Wait: {
            Type: 'Wait',
            Seconds: 10,
            Next: 'CheckTime',
          },
          Process: {
            Type: 'Succeed',
          },
        },
      })

      const result = builder.hasProblematicChoicePatterns(stateMachine)

      expect(result).toBe(true)
    })

    it('should return false for state machines without Choice states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'Task1',
        States: {
          Task1: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
            Next: 'Task2',
          },
          Task2: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction2',
            End: true,
          },
        },
      })

      const result = builder.hasProblematicChoicePatterns(stateMachine)

      expect(result).toBe(false)
    })
  })

  describe('buildTestPrompt', () => {
    it('should build test prompt with basic state machine', () => {
      const stateMachine: StateMachine = createStateMachine({
        StartAt: 'SimpleTask',
        States: {
          SimpleTask: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
            End: true,
          },
        },
      })

      const prompt = builder.buildTestPrompt(stateMachine)

      expect(prompt).toContain('State Machine Definition')
      expect(prompt).toContain('SimpleTask')
      expect(prompt).toContain('version: "1.0"')
    })

    it('should include mock content when provided', () => {
      const stateMachine = createStateMachine({
        StartAt: 'SimpleTask',
        States: {
          SimpleTask: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
            End: true,
          },
        },
      })

      const mockContent = `version: "1.0"
mocks:
  - state: "SimpleTask"
    type: "fixed"
    response:
      result: "success"`

      const prompt = builder.buildTestPrompt(stateMachine, mockContent)

      expect(prompt).toContain('Mock Configuration')
      expect(prompt).toContain(mockContent)
    })

    it('should include parallel test guidance for Parallel states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'ParallelState',
        States: {
          ParallelState: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Branch1',
                States: {
                  Branch1: { Type: 'Pass', End: true },
                },
              },
              {
                StartAt: 'Branch2',
                States: {
                  Branch2: { Type: 'Pass', End: true },
                },
              },
            ],
            End: true,
          },
        },
      })

      const prompt = builder.buildTestPrompt(stateMachine)

      expect(prompt).toContain('Parallel State')
    })

    it('should include map test guidance for Map states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'MapTask',
              States: {
                MapTask: { Type: 'Pass', End: true },
              },
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildTestPrompt(stateMachine)

      expect(prompt).toContain('Map State')
    })

    it('should include distributed map test guidance for DistributedMap states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'DistMapState',
        States: {
          DistMapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'MapTask',
              States: {
                MapTask: { Type: 'Pass', End: true },
              },
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildTestPrompt(stateMachine)

      expect(prompt).toContain('Distributed Map')
    })

    it('should include variables test guidance when Variables are present', () => {
      const stateMachine = createStateMachine({
        QueryLanguage: 'JSONata',
        StartAt: 'TaskWithVariables',
        States: {
          TaskWithVariables: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
            Variables: {
              foo: 'bar',
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildTestPrompt(stateMachine)

      expect(prompt).toContain('Variables')
    })
  })

  describe('buildMockPrompt', () => {
    it('should include Choice mock guidelines for problematic patterns', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckTime',
        States: {
          CheckTime: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.timestamp',
                TimestampEqualsPath: '$$.Execution.StartTime',
                Next: 'Process',
              },
            ],
            Default: 'Wait',
          },
          Wait: {
            Type: 'Wait',
            Seconds: 10,
            Next: 'CheckTime',
          },
          Process: {
            Type: 'Succeed',
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)

      expect(prompt).toContain('Choice State Mock Guidelines')
      expect(prompt).toContain('detected potential infinite loops')
      expect(prompt).toContain('CheckTime')
    })

    it('should not include Choice mock guidelines for normal Choice states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'CheckValue',
        States: {
          CheckValue: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.status',
                StringEquals: 'COMPLETE',
                Next: 'Success',
              },
            ],
            Default: 'Failure',
          },
          Success: {
            Type: 'Succeed',
          },
          Failure: {
            Type: 'Fail',
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)

      expect(prompt).not.toContain('Choice State Mock Guidelines')
    })
  })

  describe('detectChoiceLoops edge cases', () => {
    it('should handle And/Or conditions with timestamp patterns', () => {
      const stateMachine = createStateMachine({
        StartAt: 'ComplexChoice',
        States: {
          ComplexChoice: {
            Type: 'Choice',
            Choices: [
              {
                And: [
                  { Variable: '$.status', StringEquals: 'PENDING' },
                  { Variable: '$.timestamp', TimestampLessThanPath: '$.deadline' },
                ],
                Next: 'Process',
              },
            ],
            Default: 'Wait',
          },
          Wait: { Type: 'Wait', Seconds: 10, Next: 'ComplexChoice' },
          Process: { Type: 'Succeed' },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
      expect(result.problematicStates).toContain('ComplexChoice')
    })

    it('should detect patterns in nested Or conditions', () => {
      const stateMachine = createStateMachine({
        StartAt: 'NestedChoice',
        States: {
          NestedChoice: {
            Type: 'Choice',
            Choices: [
              {
                Or: [
                  { Variable: '$.retry', NumericGreaterThan: 3 },
                  { Variable: '$.time', TimestampGreaterThanPath: '$.deadline' },
                ],
                Next: 'Fail',
              },
            ],
            Default: 'Retry',
          },
          Retry: { Type: 'Pass', Next: 'NestedChoice' },
          Fail: { Type: 'Fail' },
        },
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(true)
    })

    it('should handle empty States object', () => {
      const stateMachine = createStateMachine({
        StartAt: 'Start',
        States: {},
      })

      const result = builder.detectChoiceLoops(stateMachine)

      expect(result.hasProblematicPatterns).toBe(false)
      expect(result.hasStructuralLoops).toBe(false)
      expect(result.problematicStates).toHaveLength(0)
    })
  })

  describe('hasLambdaTasks', () => {
    it('should detect Lambda tasks in Map states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'LambdaTask',
              States: {
                LambdaTask: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)
      expect(prompt).toContain('Lambda')
    })

    it('should detect Lambda tasks in Parallel branches', () => {
      const stateMachine = createStateMachine({
        StartAt: 'ParallelState',
        States: {
          ParallelState: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'LambdaTask',
                States: {
                  LambdaTask: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
                    End: true,
                  },
                },
              },
            ],
            End: true,
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)
      expect(prompt).toContain('Lambda')
    })

    it('should detect Lambda tasks in Map Iterator (legacy)', () => {
      const stateMachine = createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            Iterator: {
              StartAt: 'LambdaTask',
              States: {
                LambdaTask: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)
      expect(prompt).toContain('Lambda')
    })
  })

  describe('hasVariables', () => {
    it('should detect Variables in nested states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'ParallelState',
        States: {
          ParallelState: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'TaskWithVars',
                States: {
                  TaskWithVars: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction',
                    Variables: { foo: 'bar' },
                    End: true,
                  },
                },
              },
            ],
            End: true,
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)
      expect(prompt).toContain('Variables')
    })

    it('should detect Assign in Map ItemProcessor states', () => {
      const stateMachine = createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'AssignTask',
              States: {
                AssignTask: {
                  Type: 'Pass',
                  Assign: { result: 'processed' },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)
      expect(prompt).toContain('Variables')
    })

    it('should detect Assign in Map Iterator (legacy)', () => {
      const stateMachine = createStateMachine({
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            Iterator: {
              StartAt: 'AssignTask',
              States: {
                AssignTask: {
                  Type: 'Pass',
                  Assign: { result: 'processed' },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const prompt = builder.buildMockPrompt(stateMachine)
      expect(prompt).toContain('Variables')
    })
  })
})
