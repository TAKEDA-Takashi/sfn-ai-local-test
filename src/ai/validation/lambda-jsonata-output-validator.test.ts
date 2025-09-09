import { beforeEach, describe, expect, it } from 'vitest'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { StateMachineValidator } from './state-machine-validator'

describe('StateMachineValidator - Lambda JSONata Output Integration', () => {
  let validator: StateMachineValidator

  beforeEach(() => {
    validator = new StateMachineValidator()
  })

  describe('Test Case Validation', () => {
    it('should detect incorrect expectation for Lambda invoke with JSONata Output', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine',
        StartAt: 'TestState',
        States: {
          TestState: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            QueryLanguage: 'JSONata',
            Arguments: {
              FunctionName: 'TestFunction',
              Payload: { test: 'data' },
            },
            Output: '{% $states.result.Payload %}',
            Next: 'NextState',
          },
          NextState: {
            Type: 'Succeed',
          },
        },
      }) as StateMachine

      // Test case with WRONG expectation (includes Payload wrapper)
      const wrongTestContent = `
version: "1.0"
name: "Test Suite"
testCases:
  - name: "Test case"
    stateExpectations:
      - state: "TestState"
        output:
          ExecutedVersion: "$LATEST"
          Payload:
            result: "success"
          StatusCode: 200
`

      const issues = validator.validateTestContent(wrongTestContent, stateMachine)

      // Should detect that the expectation is wrong for JSONata Output
      expect(
        issues.some(
          (issue) =>
            issue.level === 'error' &&
            issue.message.includes('JSONata Output') &&
            issue.message.includes('Payload'),
        ),
      ).toBe(true)
    })

    it('should accept correct expectation for Lambda invoke with JSONata Output', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test state machine',
        StartAt: 'TestState',
        States: {
          TestState: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            QueryLanguage: 'JSONata',
            Arguments: {
              FunctionName: 'TestFunction',
              Payload: { test: 'data' },
            },
            Output: '{% $states.result.Payload %}',
            Next: 'NextState',
          },
          NextState: {
            Type: 'Succeed',
          },
        },
      }) as StateMachine

      // Test case with CORRECT expectation (only Payload content)
      const correctTestContent = `
version: "1.0"
name: "Test Suite"
testCases:
  - name: "Test case"
    stateExpectations:
      - state: "TestState"
        output:
          result: "success"
`

      const issues = validator.validateTestContent(correctTestContent, stateMachine)

      // Should not have errors about JSONata Output expectations
      expect(
        issues.some((issue) => issue.level === 'error' && issue.message.includes('JSONata Output')),
      ).toBe(false)
    })
  })
})
