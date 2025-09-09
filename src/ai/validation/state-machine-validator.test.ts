import { beforeEach, describe, expect, it } from 'vitest'
import type { JsonObject } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { StateMachineValidator } from './state-machine-validator'

// Helper function to convert any object to StateMachine for tests
const createStateMachine = (json: any) => {
  return StateFactory.createStateMachine(json as JsonObject)
}

describe('StateMachineValidator', () => {
  let validator: StateMachineValidator

  beforeEach(() => {
    validator = new StateMachineValidator()
  })

  describe('Nested state support', () => {
    it('should recognize Map ItemProcessor states', () => {
      const stateMachine = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'INLINE',
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessItem"
    type: "fixed"
    response:
      result: "test"
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))
      expect(issues).toHaveLength(0)
    })

    it('should recognize DistributedMap ItemProcessor states', () => {
      const stateMachine = {
        StartAt: 'DistributedMapState',
        States: {
          DistributedMapState: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  Next: 'TransformItem',
                },
                TransformItem: {
                  Type: 'Pass',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessItem"
    type: "fixed"
    response:
      result: "test"
  - state: "TransformItem"
    type: "fixed"
    response: {}
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))
      expect(issues).toHaveLength(0)
    })

    it('should recognize Parallel Branch states', () => {
      const stateMachine = {
        StartAt: 'ParallelState',
        States: {
          ParallelState: {
            Type: 'Parallel',
            Branches: [
              {
                StartAt: 'Branch1Task',
                States: {
                  Branch1Task: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Branch1Function',
                    End: true,
                  },
                },
              },
              {
                StartAt: 'Branch2Task',
                States: {
                  Branch2Task: {
                    Type: 'Pass',
                    End: true,
                  },
                },
              },
            ],
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "Branch1Task"
    type: "fixed"
    response:
      result: "branch1"
  - state: "Branch2Task"
    type: "fixed"
    response: {}
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))
      expect(issues).toHaveLength(0)
    })

    it('should detect non-existent nested states', () => {
      const stateMachine = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'ValidNestedState',
              States: {
                ValidNestedState: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidNestedState',
                  End: true,
                },
              },
            },
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "InvalidNestedState"
    type: "fixed"
    response:
      result: "test"
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))
      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.level).toBe('error')
      expect(issues?.[0]?.message).toContain('State "InvalidNestedState" does not exist')
      expect(issues?.[0]?.suggestion).toContain('ValidNestedState')
    })

    it('should validate test case references to nested states', () => {
      const stateMachine = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            Next: 'NextState',
          },
          NextState: {
            Type: 'Pass',
            End: true,
          },
        },
      }

      const testContent = `
version: "1.0"
testCases:
  - name: "Test with nested state reference"
    input: {}
    expectedPath:
      - "MapState"
      - "NextState"
    stateExpectations:
      - state: "ProcessItem"
        output:
          result: "test"
`

      const issues = validator.validateTestStateReferences(
        testContent,
        createStateMachine(stateMachine),
      )
      expect(issues).toHaveLength(0)
    })

    it('should detect invalid nested state references in test cases', () => {
      const stateMachine = {
        StartAt: 'MapState',
        States: {
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'ValidState',
              States: {
                ValidState: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidState',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const testContent = `
version: "1.0"
testCases:
  - name: "Test with invalid nested state"
    input: {}
    expectedPath:
      - "MapState"
      - "InvalidState"
`

      const issues = validator.validateTestStateReferences(
        testContent,
        createStateMachine(stateMachine),
      )
      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.level).toBe('error')
      expect(issues?.[0]?.message).toContain('State "InvalidState" in expectedPath does not exist')
    })
  })

  describe('State existence validation', () => {
    it('should detect non-existent states', () => {
      const stateMachine = {
        StartAt: 'ValidState',
        States: {
          ValidState: {
            Type: 'Pass',
            Next: 'AnotherValidState',
          },
          AnotherValidState: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:AnotherValidState',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "CompletelyDifferentState"
    type: "fixed"
    response:
      result: "test"
  - state: "ValidState"
    type: "fixed"
    response:
      result: "test"
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.level).toBe('error')
      expect(issues?.[0]?.message).toContain('State "CompletelyDifferentState" does not exist')
      expect(issues?.[0]?.suggestion).toContain('Available states: ValidState, AnotherValidState')
    })

    it('should suggest similar state names', () => {
      const stateMachine = {
        StartAt: 'ProcessOrder',
        States: {
          ProcessOrder: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder',
            Next: 'ValidateOrder',
          },
          ValidateOrder: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidateOrder',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessOrders"  # Typo: extra 's'
    type: "fixed"
    response:
      result: "test"
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.suggestion).toContain('Did you mean "ProcessOrder"?')
    })
  })

  describe('Map/DistributedMap validation', () => {
    it('should require array response for Map states', () => {
      const stateMachine = {
        StartAt: 'ProcessItems',
        States: {
          ProcessItems: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessItems"
    type: "fixed"
    response:  # Wrong: single object instead of array
      processedItem: "result"
      status: "success"
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.level).toBe('error')
      expect(issues?.[0]?.message).toContain('Map state "ProcessItems" must return an array')
      expect(issues?.[0]?.suggestion).toContain('Change response to an array')
    })

    it('should accept array response for Map states', () => {
      const stateMachine = {
        StartAt: 'ProcessItems',
        States: {
          ProcessItems: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessItems"
    type: "fixed"
    response:  # Correct: array
      - processedItem: "item1"
        status: "success"
      - processedItem: "item2"
        status: "success"
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(0)
    })

    it('should handle DistributedMap states', () => {
      const stateMachine = {
        StartAt: 'ProcessLargeDataset',
        States: {
          ProcessLargeDataset: {
            Type: 'Map',
            ItemsPath: '$.dataset',
            ItemProcessor: {
              ProcessorConfig: {
                Mode: 'DISTRIBUTED',
              },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessLargeDataset"
    type: "fixed"
    response:
      singleResult: "wrong"
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.message).toContain(
        'DistributedMap state "ProcessLargeDataset" must return an array',
      )
    })
  })

  describe('Detailed error messages', () => {
    it('should provide detailed Lambda error with structure comparison', () => {
      const stateMachine = {
        StartAt: 'GetUser',
        States: {
          GetUser: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "GetUser"
    type: "conditional"
    conditions:
      - when:
          input:
            userId: "123"  # Missing Payload wrapper
        response:
          name: "John"  # Missing Payload wrapper
`

      const issues = validator.validateLambdaStructure(
        mockContent,
        createStateMachine(stateMachine),
      )

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.level).toBe('error')
      expect(issues?.[0]?.message).toContain('Your current structure')
      expect(issues?.[0]?.message).toContain('Required structure')
      expect(issues?.[0]?.message).toContain('Payload')
    })
  })

  describe('Map states with conditional and stateful mocks', () => {
    it('should validate conditional responses for Map states', () => {
      const stateMachine = {
        StartAt: 'ProcessItems',
        States: {
          ProcessItems: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessItems"
    type: "conditional"
    conditions:
      - when:
          input:
            count: 1
        response:
          singleItem: "wrong"
      - default:
          - item1: "correct"
          - item2: "correct"
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.message).toContain('conditional response must return an array')
    })

    it('should validate stateful responses for Map states', () => {
      const stateMachine = {
        StartAt: 'ProcessBatch',
        States: {
          ProcessBatch: {
            Type: 'Map',
            ItemsPath: '$.batch',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessItem',
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessBatch"
    type: "stateful"
    responses:
      - - firstCall: "array response"
      - secondCall: "non-array response"
      - - thirdCall: "array response"
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.message).toContain('stateful response #2 must return an array')
    })

    it('should allow object response for DistributedMap with ResultWriter', () => {
      const stateMachine = {
        StartAt: 'ProcessBatch',
        States: {
          ProcessBatch: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'Process',
              States: { Process: { Type: 'Pass', End: true } },
            },
            ResultWriter: {
              Resource: 'arn:aws:states:::s3:putObject',
              Arguments: { Bucket: 'output-bucket' },
            },
            End: true,
          },
        },
      }
      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessBatch"
    type: "fixed"
    response:
      ProcessedItemCount: 100
      ResultWriterDetails:
        Bucket: "output-bucket"
        Key: "results/manifest.json"
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      // Should NOT have any issues - object response is valid for DistributedMap with ResultWriter
      expect(issues).toHaveLength(0)
    })

    it('should require array response for DistributedMap without ResultWriter', () => {
      const stateMachine = {
        StartAt: 'ProcessBatch',
        States: {
          ProcessBatch: {
            Type: 'Map',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'Process',
              States: { Process: { Type: 'Pass', End: true } },
            },
            // No ResultWriter
            End: true,
          },
        },
      }
      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessBatch"
    type: "fixed"
    response:
      ProcessedItemCount: 100  # Should be array
`

      const issues = validator.validateMapStates(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.message).toContain('must return an array')
    })
  })

  describe('Error handling', () => {
    it('should handle invalid YAML content gracefully', () => {
      const stateMachine = {
        StartAt: 'Test',
        States: { Test: { Type: 'Pass', End: true } },
      }
      const invalidYaml = 'invalid: yaml: content: ['

      const issues = validator.validateStateExistence(invalidYaml, createStateMachine(stateMachine))
      expect(issues).toHaveLength(0) // Should not throw, just return empty
    })

    it('should handle invalid JSON state machine gracefully', () => {
      const mockContent = `
version: "1.0"
mocks:
  - state: "Test"
    type: "fixed"
    response: {}
`
      try {
        const issues = validator.validateStateExistence(mockContent, createStateMachine({}))
        expect(issues).toHaveLength(0) // Should not throw, just return empty
      } catch (error) {
        // Expected to throw due to missing required fields
        expect(error).toBeDefined()
        expect(String(error)).toContain('StateMachine')
      }
    })

    it('should handle missing mocks property', () => {
      const stateMachine = {
        StartAt: 'Test',
        States: { Test: { Type: 'Pass' } },
      }
      const mockContent = `
version: "1.0"
# No mocks property
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))
      expect(issues).toHaveLength(0)
    })

    it('should handle missing States property in state machine', () => {
      const stateMachine = { Comment: 'Test state machine without States' }
      const mockContent = `
version: "1.0"
mocks:
  - state: "Test"
    type: "fixed"
    response: {}
`

      try {
        const issues = validator.validateStateExistence(
          mockContent,
          createStateMachine(stateMachine),
        )
        expect(issues).toHaveLength(0)
      } catch (error) {
        // Expected to throw due to missing required fields
        expect(error).toBeDefined()
        expect(String(error)).toContain('States')
      }
    })
  })

  describe('State name similarity detection', () => {
    it('should detect similar state names with small differences', () => {
      const stateMachine = {
        StartAt: 'ProcessOrder',
        States: {
          ProcessOrder: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder',
            Next: 'ValidatePayment',
          },
          ValidatePayment: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidatePayment',
            Next: 'SendNotification',
          },
          SendNotification: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:SendNotification',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "ProcessOrdr"  # Missing 'e'
    type: "fixed"
    response: {}
  - state: "ValidatePaymnt"  # Missing 'e'
    type: "fixed"
    response: {}
  - state: "SendNotifications"  # Extra 's'
    type: "fixed"
    response: {}
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(3)
      expect(issues?.[0]?.suggestion).toContain('Did you mean "ProcessOrder"?')
      expect(issues?.[1]?.suggestion).toContain('Did you mean "ValidatePayment"?')
      expect(issues?.[2]?.suggestion).toContain('Did you mean "SendNotification"?')
    })

    it('should not suggest when state name is too different', () => {
      const stateMachine = {
        StartAt: 'ProcessOrder',
        States: {
          ProcessOrder: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder',
            Next: 'ValidatePayment',
          },
          ValidatePayment: {
            Type: 'Task',
            Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidatePayment',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "CompletelyDifferentName"
    type: "fixed"
    response: {}
`

      const issues = validator.validateStateExistence(mockContent, createStateMachine(stateMachine))

      expect(issues).toHaveLength(1)
      expect(issues?.[0]?.suggestion).toContain('Available states: ProcessOrder, ValidatePayment')
      expect(issues?.[0]?.suggestion).not.toContain('Did you mean')
    })
  })

  describe('Lambda validation edge cases', () => {
    it('should not validate non-Lambda tasks', () => {
      const stateMachine = {
        StartAt: 'RegularTask',
        States: {
          RegularTask: {
            Type: 'Task',
            Resource: 'arn:aws:states:::some-other-service',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "RegularTask"
    type: "conditional"
    conditions:
      - when:
          input:
            data: "no payload needed"
        response:
          result: "ok"
`

      const issues = validator.validateLambdaStructure(
        mockContent,
        createStateMachine(stateMachine),
      )
      expect(issues).toHaveLength(0)
    })

    it('should handle Lambda state without conditions', () => {
      const stateMachine = {
        StartAt: 'LambdaTask',
        States: {
          LambdaTask: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "LambdaTask"
    type: "fixed"
    response:
      Payload:
        result: "ok"
`

      const issues = validator.validateLambdaStructure(
        mockContent,
        createStateMachine(stateMachine),
      )
      expect(issues).toHaveLength(0)
    })

    it('should handle Lambda state with Payload in when clause', () => {
      const stateMachine = {
        StartAt: 'LambdaTask',
        States: {
          LambdaTask: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "LambdaTask"
    type: "conditional"
    conditions:
      - when:
          input:
            Payload:
              userId: "123"
        response:
          Payload:
            name: "John"
`

      const issues = validator.validateLambdaStructure(
        mockContent,
        createStateMachine(stateMachine),
      )
      expect(issues).toHaveLength(0)
    })
  })

  describe('Complete validation', () => {
    it('should run all validations', () => {
      const stateMachine = {
        StartAt: 'ValidState',
        States: {
          ValidState: {
            Type: 'Pass',
            Next: 'MapState',
          },
          MapState: {
            Type: 'Map',
            ItemProcessor: {
              StartAt: 'ProcessItem',
              States: { ProcessItem: { Type: 'Pass', End: true } },
            },
            Next: 'LambdaState',
          },
          LambdaState: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            End: true,
          },
        },
      }

      const mockContent = `
version: "1.0"
mocks:
  - state: "InvalidState"
    type: "fixed"
    response: {}
  - state: "MapState"
    type: "fixed"
    response:
      singleItem: "wrong"
  - state: "LambdaState"
    type: "conditional"
    conditions:
      - when:
          input:
            id: "123"
        response:
          result: "test"
`

      const issues = validator.validateMockContent(mockContent, createStateMachine(stateMachine))

      // 3つのエラー：存在しないステート、Map配列形式、Lambda Payloadラッピング
      const errors = issues.filter((i) => i.level === 'error')
      expect(errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('formatReport', () => {
    it('should return success message when no issues', () => {
      const report = validator.formatReport([])
      expect(report).toBe('✅ No issues found!')
    })

    it('should format errors with suggestions', () => {
      const issues = [
        {
          level: 'error' as const,
          message: 'State not found',
          suggestion: 'Check state name',
        },
      ]
      const report = validator.formatReport(issues)
      expect(report).toContain('❌ Errors (1)')
      expect(report).toContain('State not found')
      expect(report).toContain('💡 Check state name')
    })

    it('should format warnings', () => {
      const issues = [
        {
          level: 'warning' as const,
          message: 'Lambda state should have Payload wrapper',
        },
      ]
      const report = validator.formatReport(issues)
      expect(report).toContain('⚠️ Warnings (1)')
      expect(report).toContain('Lambda state should have Payload wrapper')
    })

    it('should format info messages', () => {
      const issues = [
        {
          level: 'info' as const,
          message: 'Consider adding more test cases',
        },
      ]
      const report = validator.formatReport(issues)
      expect(report).toContain('ℹ️ Info (1)')
      expect(report).toContain('Consider adding more test cases')
    })

    it('should format mixed issue types', () => {
      const issues = [
        { level: 'error' as const, message: 'Error message' },
        { level: 'warning' as const, message: 'Warning message' },
        { level: 'info' as const, message: 'Info message' },
      ]
      const report = validator.formatReport(issues)
      expect(report).toContain('❌ Errors (1)')
      expect(report).toContain('⚠️ Warnings (1)')
      expect(report).toContain('ℹ️ Info (1)')
    })
  })
})
