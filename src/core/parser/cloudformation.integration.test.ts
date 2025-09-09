import { describe, expect, it } from 'vitest'
import type { CloudFormationTemplate } from './cloudformation'
import { CloudFormationParser } from './cloudformation'

describe('CloudFormationParser Integration Tests', () => {
  const parser = new CloudFormationParser()

  // 実際のCDKテンプレートに似た構造のテストデータ
  const cdkLikeTemplate: CloudFormationTemplate = {
    Resources: {
      OrderProcessingWorkflowE8B6F123: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          StateMachineName: 'OrderProcessingWorkflow',
          DefinitionString:
            '{"StartAt":"ProcessOrder","States":{"ProcessOrder":{"Type":"Task","Resource":"arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder","End":true}}}',
        },
      },
      UserRegistrationWorkflowA4C2D567: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          StateMachineName: 'UserRegistrationWorkflow',
          DefinitionString:
            '{"StartAt":"RegisterUser","States":{"RegisterUser":{"Type":"Task","Resource":"arn:aws:lambda:us-east-1:123456789012:function:RegisterUser","End":true}}}',
        },
      },
      ProcessOrderLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {},
      },
    },
  }

  describe('Prefix matching for CDK-style logical IDs', () => {
    it('should extract state machine using exact match', () => {
      const result = parser.extractStateMachineById(
        cdkLikeTemplate,
        'OrderProcessingWorkflowE8B6F123',
      )

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('OrderProcessingWorkflowE8B6F123')
      expect(result?.stateMachineName).toBe('OrderProcessingWorkflow')
    })

    it('should extract state machine using prefix match for CDK workflow names', () => {
      const result = parser.extractStateMachineById(cdkLikeTemplate, 'OrderProcessingWorkflow')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('OrderProcessingWorkflowE8B6F123')
      expect(result?.stateMachineName).toBe('OrderProcessingWorkflow')
    })

    it('should extract state machine using partial prefix', () => {
      const result = parser.extractStateMachineById(cdkLikeTemplate, 'OrderProcessing')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('OrderProcessingWorkflowE8B6F123')
      expect(result?.stateMachineName).toBe('OrderProcessingWorkflow')
    })

    it('should extract different state machine using different prefix', () => {
      const result = parser.extractStateMachineById(cdkLikeTemplate, 'UserRegistration')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('UserRegistrationWorkflowA4C2D567')
      expect(result?.stateMachineName).toBe('UserRegistrationWorkflow')
    })

    it('should provide helpful error message with available state machines', () => {
      expect(() => {
        parser.extractStateMachineById(cdkLikeTemplate, 'PaymentProcessing')
      }).toThrow(
        "State machine 'PaymentProcessing' not found. Available state machines: OrderProcessingWorkflowE8B6F123, UserRegistrationWorkflowA4C2D567",
      )
    })
  })

  describe('Edge cases', () => {
    it('should handle template with no state machines', () => {
      const emptyTemplate: CloudFormationTemplate = {
        Resources: {
          SomeLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
        },
      }

      expect(() => {
        parser.extractStateMachineById(emptyTemplate, 'NonExistent')
      }).toThrow("State machine 'NonExistent' not found. Available state machines: none")
    })

    it('should sort prefix matches consistently', () => {
      const multiMatchTemplate: CloudFormationTemplate = {
        Resources: {
          WorkflowZ123: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              StateMachineName: 'WorkflowZ',
              DefinitionString:
                '{"StartAt":"TaskZ","States":{"TaskZ":{"Type":"Task","Resource":"arn:aws:lambda:us-east-1:123456789012:function:TaskZ","End":true}}}',
            },
          },
          WorkflowA456: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              StateMachineName: 'WorkflowA',
              DefinitionString:
                '{"StartAt":"TaskA","States":{"TaskA":{"Type":"Task","Resource":"arn:aws:lambda:us-east-1:123456789012:function:TaskA","End":true}}}',
            },
          },
        },
      }

      // 前方一致で複数マッチする場合、アルファベット順で最初のものを選択
      const result = parser.extractStateMachineById(multiMatchTemplate, 'Workflow')

      expect(result).not.toBeNull()
      expect(result?.logicalId).toBe('WorkflowA456') // アルファベット順で最初
      expect(result?.stateMachineName).toBe('WorkflowA')
    })
  })
})
