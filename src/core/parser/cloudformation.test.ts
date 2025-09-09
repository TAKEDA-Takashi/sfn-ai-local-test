import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../types/asl'
import type { CloudFormationTemplate } from './cloudformation'
import { CloudFormationParser } from './cloudformation'

describe('CloudFormationParser', () => {
  const parser = new CloudFormationParser()

  const mockTemplate: CloudFormationTemplate = {
    Resources: {
      OrderProcessingStateMachineABC123: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          StateMachineName: 'OrderProcessingWorkflow',
          DefinitionString: JSON.stringify({
            StartAt: 'ProcessOrder',
            States: {
              ProcessOrder: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder',
                End: true,
              },
            },
          }),
        },
      },
      UserManagementStateMachineDEF456: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          StateMachineName: 'UserManagementWorkflow',
          DefinitionString: JSON.stringify({
            StartAt: 'ValidateUser',
            States: {
              ValidateUser: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ValidateUser',
                End: true,
              },
            },
          }),
        },
      },
      PaymentStateMachineGHI789: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          StateMachineName: 'PaymentProcessingWorkflow',
          DefinitionString: JSON.stringify({
            StartAt: 'ProcessPayment',
            States: {
              ProcessPayment: {
                Type: 'Task',
                Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessPayment',
                End: true,
              },
            },
          }),
        },
      },
      SomeOtherResource: {
        Type: 'AWS::Lambda::Function',
        Properties: {},
      },
    },
  }

  describe('extractStateMachines - multiple state machines', () => {
    it('should extract all state machines from template', () => {
      const extractions = parser.extractStateMachines(mockTemplate)

      expect(extractions).toHaveLength(3)

      const orderProcessing = extractions.find(
        (sm) => sm.logicalId === 'OrderProcessingStateMachineABC123',
      )
      expect(orderProcessing).toBeDefined()
      expect(orderProcessing?.stateMachineName).toBe('OrderProcessingWorkflow')

      const userManagement = extractions.find(
        (sm) => sm.logicalId === 'UserManagementStateMachineDEF456',
      )
      expect(userManagement).toBeDefined()
      expect(userManagement?.stateMachineName).toBe('UserManagementWorkflow')

      const payment = extractions.find((sm) => sm.logicalId === 'PaymentStateMachineGHI789')
      expect(payment).toBeDefined()
      expect(payment?.stateMachineName).toBe('PaymentProcessingWorkflow')
    })

    it('should skip non-state-machine resources', () => {
      const templateWithMixed: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: { Task1: { Type: 'Pass', End: true } },
              }),
            },
          },
          LambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
          ApiGateway: {
            Type: 'AWS::ApiGateway::RestApi',
            Properties: {},
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithMixed)
      expect(extractions).toHaveLength(1)
      expect(extractions[0]?.logicalId).toBe('StateMachine1')
    })

    it('should handle state machines without definitions', () => {
      const templateWithInvalid: CloudFormationTemplate = {
        Resources: {
          ValidStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: { Task1: { Type: 'Pass', End: true } },
              }),
            },
          },
          InvalidStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {}, // No definition
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithInvalid)
      expect(extractions).toHaveLength(1)
      expect(extractions[0]?.logicalId).toBe('ValidStateMachine')
    })
  })

  describe('CloudFormation intrinsic functions', () => {
    it('should resolve Fn::Join in DefinitionString', () => {
      const templateWithJoin: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: {
                'Fn::Join': [
                  '',
                  ['{"StartAt":"Task1","States":{"Task1":{"Type":"Pass","End":true}}}'],
                ],
              },
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithJoin)
      expect(extractions).toHaveLength(1)
      expect(extractions[0]?.definition.StartAt).toBe('Task1')
      const states = extractions[0]?.definition.States as JsonObject
      const task1 = states?.Task1 as JsonObject
      expect(task1?.Type).toBe('Pass')
    })

    it('should resolve Fn::Sub with variables', () => {
      const templateWithSub: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: {
                'Fn::Sub': [
                  `{"StartAt":"\${TaskName}","States":{"\${TaskName}":{"Type":"Pass","End":true}}}`,
                  { TaskName: 'ProcessOrder' },
                ],
              },
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithSub)
      expect(extractions).toHaveLength(1)
      expect(extractions[0]?.definition.StartAt).toBe('ProcessOrder')
      const states2 = extractions[0]?.definition.States as JsonObject
      const processOrder = states2?.ProcessOrder as JsonObject
      expect(processOrder?.Type).toBe('Pass')
    })

    it('should resolve AWS pseudo parameters in Fn::Sub', () => {
      const templateWithPseudo: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: {
                'Fn::Sub': `{"StartAt":"Task1","States":{"Task1":{"Type":"Task","Resource":"arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:test","End":true}}}`,
              },
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithPseudo)
      expect(extractions).toHaveLength(1)
      const states3 = extractions[0]?.definition.States as JsonObject
      const task1State = states3?.Task1 as JsonObject
      expect(task1State?.Resource).toBe('arn:aws:lambda:us-east-1:123456789012:function:test')
    })

    it('should resolve Ref for pseudo parameters', () => {
      const templateWithRef: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              StateMachineName: { Ref: 'AWS::StackName' },
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: { Task1: { Type: 'Pass', End: true } },
              }),
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithRef)
      expect(extractions).toHaveLength(1)
      // StateMachineName の intrinsic function は文字列でない場合、logicalIdを使用
      expect(extractions[0]?.stateMachineName).toEqual('StateMachine1')
    })

    it('should resolve Fn::GetAtt', () => {
      const templateWithGetAtt: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              RoleArn: { 'Fn::GetAtt': ['MyRole', 'Arn'] },
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: { Task1: { Type: 'Pass', End: true } },
              }),
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithGetAtt)
      expect(extractions).toHaveLength(1)
      // RoleArn の intrinsic function は文字列でない場合、undefined
      expect(extractions[0]?.roleArn).toBeUndefined()
    })

    it('should handle Definition object (not string)', () => {
      const templateWithDefinition: CloudFormationTemplate = {
        Resources: {
          StateMachine1: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              Definition: {
                StartAt: 'Task1',
                States: {
                  Task1: {
                    Type: 'Task',
                    Resource: { Ref: 'MyFunction' },
                    End: true,
                  },
                },
              },
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithDefinition)
      expect(extractions).toHaveLength(1)
      expect(extractions[0]?.definition.StartAt).toBe('Task1')
      const states3 = extractions[0]?.definition.States as JsonObject
      const task1State = states3?.Task1 as JsonObject
      expect(task1State?.Resource).toBe('resolved-MyFunction')
    })
  })

  describe('extractStateMachineById with prefix matching', () => {
    it('should return state machine when exact match found', () => {
      const result = parser.extractStateMachineById(
        mockTemplate,
        'OrderProcessingStateMachineABC123',
      )

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('OrderProcessingStateMachineABC123')
      expect(result?.stateMachineName).toBe('OrderProcessingWorkflow')
    })

    it('should return state machine when prefix match found', () => {
      const result = parser.extractStateMachineById(mockTemplate, 'OrderProcessing')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('OrderProcessingStateMachineABC123')
      expect(result?.stateMachineName).toBe('OrderProcessingWorkflow')
    })

    it('should return first match when multiple prefix matches exist', () => {
      const result = parser.extractStateMachineById(mockTemplate, 'User')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('UserManagementStateMachineDEF456')
      expect(result?.stateMachineName).toBe('UserManagementWorkflow')
    })

    it('should prioritize exact match over prefix match', () => {
      const templateWithBoth: CloudFormationTemplate = {
        Resources: {
          OrderProcessing: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              StateMachineName: 'ExactMatch',
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: {
                  Task1: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Task1',
                    End: true,
                  },
                },
              }),
            },
          },
          OrderProcessingStateMachineABC123: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              StateMachineName: 'PrefixMatch',
              DefinitionString: JSON.stringify({
                StartAt: 'Task2',
                States: {
                  Task2: {
                    Type: 'Task',
                    Resource: 'arn:aws:lambda:us-east-1:123456789012:function:Task2',
                    End: true,
                  },
                },
              }),
            },
          },
        },
      }

      const result = parser.extractStateMachineById(templateWithBoth, 'OrderProcessing')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('OrderProcessing')
      expect(result?.stateMachineName).toBe('ExactMatch')
    })

    it('should throw error when no match found', () => {
      expect(() => {
        parser.extractStateMachineById(mockTemplate, 'NonExistent')
      }).toThrow("State machine 'NonExistent' not found. Available state machines:")
    })

    it('should throw error when matched resource is not a state machine', () => {
      expect(() => {
        parser.extractStateMachineById(mockTemplate, 'SomeOther')
      }).toThrow("State machine 'SomeOther' not found. Available state machines:")
    })
  })

  describe('Error handling and edge cases', () => {
    it('should handle invalid JSON in DefinitionString', () => {
      const templateWithInvalidJson: CloudFormationTemplate = {
        Resources: {
          InvalidStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: 'invalid json {',
            },
          },
        },
      }

      expect(() => parser.extractStateMachines(templateWithInvalidJson)).not.toThrow() // Should warn but not throw
    })

    it('should handle invalid ASL structure', () => {
      const templateWithInvalidASL: CloudFormationTemplate = {
        Resources: {
          InvalidStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({ Comment: 'Missing StartAt and States' }),
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithInvalidASL)
      expect(extractions).toHaveLength(0) // Should be filtered out
    })

    it('should handle state machine without StateMachineName', () => {
      const templateWithoutName: CloudFormationTemplate = {
        Resources: {
          MyStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: { Task1: { Type: 'Pass', End: true } },
              }),
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithoutName)
      expect(extractions).toHaveLength(1)
      expect(extractions[0]?.stateMachineName).toBe('MyStateMachine') // Uses logical ID
    })
  })

  describe('ARN normalization', () => {
    it('should normalize resolved ARN placeholders in ItemReader resource', () => {
      const templateWithResolvedArn: CloudFormationTemplate = {
        Resources: {
          TestStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'DistributedMapState',
                States: {
                  DistributedMapState: {
                    Type: 'Map',
                    ItemReader: {
                      Resource: 'arn:resolved-AWS::Partition:states:::s3:getObject',
                      ReaderConfig: {
                        InputType: 'JSONL',
                        Bucket: 'test-bucket',
                        Key: 'test.jsonl',
                      },
                    },
                    End: true,
                  },
                },
              }),
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithResolvedArn)
      expect(extractions).toHaveLength(1)

      const stateMachine = extractions[0]?.definition
      const states4 = stateMachine?.States as JsonObject
      const mapState = states4?.DistributedMapState as JsonObject
      const itemReader = mapState?.ItemReader as JsonObject
      expect(itemReader?.Resource).toBe('arn:aws:states:::s3:getObject')
    })

    it('should normalize multiple ARN patterns', () => {
      const templateWithMultipleArns: CloudFormationTemplate = {
        Resources: {
          TestStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'Task1',
                States: {
                  Task1: {
                    Type: 'Task',
                    Resource: 'arn:resolved-Custom::Partition:states:::lambda:invoke',
                    Next: 'Task2',
                  },
                  Task2: {
                    Type: 'Task',
                    Resource: 'arn:resolved-TestBucketABC123:Partition:states:::s3:listObjectsV2',
                    End: true,
                  },
                },
              }),
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithMultipleArns)
      const stateMachine = extractions[0]?.definition
      const states5 = stateMachine?.States as JsonObject
      const task1 = states5?.Task1 as JsonObject
      const task2 = states5?.Task2 as JsonObject

      expect(task1?.Resource).toBe('arn:aws:states:::lambda:invoke')
      expect(task2?.Resource).toBe('arn:aws:states:::s3:listObjectsV2')
    })

    it('should handle AWS::Partition reference correctly', () => {
      const templateWithPartitionRef: CloudFormationTemplate = {
        Resources: {
          TestStateMachine: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              Definition: {
                StartAt: 'LambdaTask',
                States: {
                  LambdaTask: {
                    Type: 'Task',
                    Resource: {
                      'Fn::Sub': 'arn:${AWS::Partition}:states:::lambda:invoke',
                    },
                    End: true,
                  },
                },
              },
            },
          },
        },
      }

      const extractions = parser.extractStateMachines(templateWithPartitionRef)
      const stateMachine = extractions[0]?.definition
      const states6 = stateMachine?.States as JsonObject
      const lambdaTask = states6?.LambdaTask as JsonObject

      expect(lambdaTask?.Resource).toBe('arn:aws:states:::lambda:invoke')
    })
  })
})
