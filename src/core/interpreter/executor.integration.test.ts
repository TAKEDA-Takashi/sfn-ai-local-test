import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { MockEngine } from '../mock/engine'
import { StateMachineExecutor } from './executor'

describe('StateMachineExecutor Integration Tests', () => {
  describe('JSONata Choice State Bug', () => {
    it('should handle Choice state with no matching condition and no Default', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test Choice with no match',
        StartAt: 'TestChoice',
        QueryLanguage: 'JSONata',
        States: {
          TestChoice: {
            Type: 'Choice',
            Choices: [
              {
                Condition: '{% $states.input.value > 100 %}',
                Next: 'Success',
              },
            ],
            // No Default specified
          },
          Success: {
            Type: 'Pass',
            Output: '{% { "result": "success" } %}',
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({
        version: '1.0',
        mocks: [],
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)

      // This should return an error result because no choice matches and no default is specified
      const result = await executor.execute({ value: 50 })
      expect(result.success).toBe(false)
      expect(result.error).toContain('No matching choice found and no default specified')
    })
  })

  describe('JSONata Workflow', () => {
    it('should execute complete JSONata workflow with Task, Choice, and Pass states', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'JSONata integration test',
        StartAt: 'ProcessData',
        QueryLanguage: 'JSONata',
        States: {
          ProcessData: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'ProcessFunction',
              Payload: {
                fullName: '{% $states.input.firstName & " " & $states.input.lastName %}',
                age: '{% $number($states.input.age) %}',
                isAdult: '{% $number($states.input.age) >= 18 %}',
              },
            },
            Output: '{% $states.result.Payload %}',
            Next: 'CheckCategory',
          },
          CheckCategory: {
            Type: 'Choice',
            Choices: [
              {
                Condition: '{% $states.input.isAdult = true %}',
                Next: 'ProcessAdult',
              },
            ],
            Default: 'ProcessMinor',
          },
          ProcessAdult: {
            Type: 'Pass',
            Output: '{% { "category": "adult", "name": $states.input.fullName } %}',
            End: true,
          },
          ProcessMinor: {
            Type: 'Pass',
            Output: '{% { "category": "minor", "name": $states.input.fullName } %}',
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({
        version: '1.0',
        mocks: [
          {
            state: 'ProcessData',
            type: 'fixed',
            response: {
              Payload: {
                fullName: 'John Doe',
                age: 25,
                isAdult: true,
              },
              StatusCode: 200,
            },
          },
        ],
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)
      const result = await executor.execute({
        firstName: 'John',
        lastName: 'Doe',
        age: '25',
      })

      // Test that the output is correctly extracted from Payload
      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      const output = result.output as JsonObject
      expect(output.category).toBe('adult')
      expect(output.name).toBe('John Doe')
    })

    it('should handle minor user flow correctly', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'JSONata integration test',
        StartAt: 'ProcessData',
        QueryLanguage: 'JSONata',
        States: {
          ProcessData: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'ProcessFunction',
              Payload: {
                fullName: '{% $states.input.firstName & " " & $states.input.lastName %}',
                age: '{% $number($states.input.age) %}',
                isAdult: '{% $number($states.input.age) >= 18 %}',
              },
            },
            Output: '{% $states.result.Payload %}',
            Next: 'CheckCategory',
          },
          CheckCategory: {
            Type: 'Choice',
            Choices: [
              {
                Condition: '{% $states.input.isAdult = true %}',
                Next: 'ProcessAdult',
              },
            ],
            Default: 'ProcessMinor',
          },
          ProcessAdult: {
            Type: 'Pass',
            Output: '{% { "category": "adult", "name": $states.input.fullName } %}',
            End: true,
          },
          ProcessMinor: {
            Type: 'Pass',
            Output: '{% { "category": "minor", "name": $states.input.fullName } %}',
            End: true,
          },
        },
      })

      const mockEngine = new MockEngine({
        version: '1.0',
        mocks: [
          {
            state: 'ProcessData',
            type: 'fixed',
            response: {
              Payload: {
                fullName: 'Jane Smith',
                age: 16,
                isAdult: false,
              },
              StatusCode: 200,
            },
          },
        ],
      })

      const executor = new StateMachineExecutor(stateMachine, mockEngine)
      const result = await executor.execute({
        firstName: 'Jane',
        lastName: 'Smith',
        age: '16',
      })

      // Test that the output is correctly extracted from Payload
      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      const output = result.output as JsonObject
      expect(output.category).toBe('minor')
      expect(output.name).toBe('Jane Smith')
    })
  })
})
