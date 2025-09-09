import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/state-factory'
import type { TestSuite } from '../../types/test'
import { InvalidInputError } from './errors'
import { TestExecutionValidator } from './test-execution-validator'

describe('TestExecutionValidator', () => {
  describe('validateAndImprove', () => {
    it('should correct output expectations based on actual execution', async () => {
      // JSONata Output that transforms the Lambda response
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Lambda with JSONata transformation',
        StartAt: 'ProcessData',
        States: {
          ProcessData: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: {
              FunctionName: 'MyFunction',
              Payload: '{% { "input": $ } %}',
            },
            Output: '{% { "result": $states.result.Payload.total * 2, "status": "processed" } %}',
            End: true,
          },
        },
      })

      // Mock that returns Lambda response
      const mockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'ProcessData',
            type: 'fixed' as const,
            response: {
              ExecutedVersion: '$LATEST',
              StatusCode: 200,
              Payload: {
                total: 100,
                items: ['a', 'b'],
              },
            },
          },
        ],
      }

      // Incorrectly generated test (expects raw Lambda response)
      const originalTest: TestSuite = {
        version: '1.0',
        name: 'Test Suite',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'Test case',
            input: { value: 1 },
            stateExpectations: [
              {
                state: 'ProcessData',
                outputMatching: 'partial',
                output: {
                  ExecutedVersion: '$LATEST',
                  Payload: {
                    total: 100,
                  },
                },
              },
            ],
          },
        ],
      }

      const validator = new TestExecutionValidator()
      const improvedTest = await validator.validateAndImprove(
        stateMachine,
        originalTest,
        mockConfig,
      )

      // The validator should have corrected the expectation
      expect(improvedTest.testCases[0].stateExpectations?.[0].output).toEqual({
        result: 200, // 100 * 2
        status: 'processed',
      })
    })

    it('should handle ResultSelector transformations', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Lambda with ResultSelector',
        StartAt: 'GetUser',
        States: {
          GetUser: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'GetUserFunction',
            },
            ResultSelector: {
              'userId.$': '$.Payload.id',
              'userName.$': '$.Payload.name',
              'isActive.$': '$.Payload.active',
            },
            End: true,
          },
        },
      })

      const mockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'GetUser',
            type: 'fixed' as const,
            response: {
              ExecutedVersion: '$LATEST',
              StatusCode: 200,
              Payload: {
                id: '123',
                name: 'John Doe',
                active: true,
                email: 'john@example.com',
              },
            },
          },
        ],
      }

      const originalTest: TestSuite = {
        version: '1.0',
        name: 'Test Suite',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'Test case',
            input: {},
            stateExpectations: [
              {
                state: 'GetUser',
                outputMatching: 'partial',
                output: {
                  Payload: {
                    id: '123',
                    name: 'John Doe',
                  },
                },
              },
            ],
          },
        ],
      }

      const validator = new TestExecutionValidator()
      const improvedTest = await validator.validateAndImprove(
        stateMachine,
        originalTest,
        mockConfig,
      )

      // Should be transformed by ResultSelector
      expect(improvedTest.testCases[0].stateExpectations?.[0].output).toEqual({
        userId: '123',
        userName: 'John Doe',
        isActive: true,
      })
    })

    it('should handle OutputPath filtering', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Task with OutputPath',
        StartAt: 'ProcessOrder',
        States: {
          ProcessOrder: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            OutputPath: '$.Payload.order',
            End: true,
          },
        },
      })

      const mockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'ProcessOrder',
            type: 'fixed' as const,
            response: {
              ExecutedVersion: '$LATEST',
              StatusCode: 200,
              Payload: {
                order: {
                  id: '456',
                  total: 999,
                },
                metadata: {
                  timestamp: '2024-01-01',
                },
              },
            },
          },
        ],
      }

      const originalTest: TestSuite = {
        version: '1.0',
        name: 'Test Suite',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'Test case',
            input: {},
            stateExpectations: [
              {
                state: 'ProcessOrder',
                outputMatching: 'partial',
                output: {
                  Payload: {
                    order: {
                      id: '456',
                    },
                  },
                },
              },
            ],
          },
        ],
      }

      const validator = new TestExecutionValidator()
      const improvedTest = await validator.validateAndImprove(
        stateMachine,
        originalTest,
        mockConfig,
      )

      // OutputPath should extract only $.Payload.order
      expect(improvedTest.testCases[0].stateExpectations?.[0].output).toEqual({
        id: '456',
        total: 999,
      })
    })

    it('should provide detailed feedback about corrections', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Simple transform',
        StartAt: 'Transform',
        States: {
          Transform: {
            Type: 'Pass',
            Result: { fixed: 'value' },
            OutputPath: '$.fixed',
            End: true,
          },
        },
      })

      const originalTest: TestSuite = {
        version: '1.0',
        name: 'Test Suite',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'Test case',
            input: {},
            stateExpectations: [
              {
                state: 'Transform',
                outputMatching: 'partial',
                output: {
                  fixed: 'value',
                },
              },
            ],
          },
        ],
      }

      const validator = new TestExecutionValidator()
      const result = await validator.validateAndImprove(
        stateMachine,
        originalTest,
        { version: '1.0', mocks: [] }, // No mocks needed for Pass state
      )

      expect(result.corrections).toBeDefined()
      expect(result.corrections?.[0]).toMatchObject({
        testCase: 'Test case',
        state: 'Transform',
        reason: expect.stringContaining('OutputPath'),
        original: { fixed: 'value' },
        corrected: 'value',
      })
    })

    it('should handle multiple test cases with different inputs', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Conditional processing',
        StartAt: 'CheckValue',
        States: {
          CheckValue: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.value',
                NumericGreaterThan: 10,
                Next: 'HighValue',
              },
            ],
            Default: 'LowValue',
          },
          HighValue: {
            Type: 'Pass',
            Result: 'HIGH',
            End: true,
          },
          LowValue: {
            Type: 'Pass',
            Result: 'LOW',
            End: true,
          },
        },
      })

      const originalTest: TestSuite = {
        version: '1.0',
        name: 'Test Suite',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'High value test',
            input: { value: 20 },
            stateExpectations: [
              {
                state: 'HighValue',
                outputMatching: 'partial',
                output: 'WRONG', // Incorrect expectation
              },
            ],
          },
          {
            name: 'Low value test',
            input: { value: 5 },
            stateExpectations: [
              {
                state: 'LowValue',
                outputMatching: 'partial',
                output: 'WRONG', // Incorrect expectation
              },
            ],
          },
        ],
      }

      const validator = new TestExecutionValidator()
      const improvedTest = await validator.validateAndImprove(stateMachine, originalTest, {
        version: '1.0',
        mocks: [],
      })

      expect(improvedTest.testCases[0].stateExpectations?.[0].output).toBe('HIGH')
      expect(improvedTest.testCases[1].stateExpectations?.[0].output).toBe('LOW')
    })
  })

  describe('Input validation', () => {
    it('should throw InvalidInputError when state machine is invalid', async () => {
      const validator = new TestExecutionValidator()
      const invalidStateMachine = {} as any
      const testSuite: TestSuite = {
        version: '1.0',
        name: 'Test',
        stateMachine: 'test.asl.json',
        testCases: [{ name: 'test', input: {} }],
      }
      const mockConfig = { version: '1.0', mocks: [] }

      await expect(
        validator.validateAndImprove(invalidStateMachine, testSuite, mockConfig),
      ).rejects.toThrow(InvalidInputError)
    })

    it('should throw InvalidInputError when test suite has no test cases', async () => {
      const validator = new TestExecutionValidator()
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'Pass',
        States: { Pass: { Type: 'Pass', End: true } },
      })
      const invalidTestSuite: TestSuite = {
        version: '1.0',
        name: 'Test',
        stateMachine: 'test.asl.json',
        testCases: [],
      }
      const mockConfig = { version: '1.0', mocks: [] }

      await expect(
        validator.validateAndImprove(stateMachine, invalidTestSuite, mockConfig),
      ).rejects.toThrow(InvalidInputError)
    })

    it('should throw InvalidInputError when mock config is invalid', async () => {
      const validator = new TestExecutionValidator()
      const stateMachine = StateFactory.createStateMachine({
        StartAt: 'Pass',
        States: { Pass: { Type: 'Pass', End: true } },
      })
      const testSuite: TestSuite = {
        version: '1.0',
        name: 'Test',
        stateMachine: 'test.asl.json',
        testCases: [{ name: 'test', input: {} }],
      }
      const invalidMockConfig = {} as any

      await expect(
        validator.validateAndImprove(stateMachine, testSuite, invalidMockConfig),
      ).rejects.toThrow(InvalidInputError)
    })
  })

  describe('Base path configuration', () => {
    it('should pass basePath option to MockEngine for file resolution', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'State machine using external file',
        StartAt: 'LoadData',
        States: {
          LoadData: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'dataLoader',
            },
            ResultPath: '$.data',
            End: true,
          },
        },
      })

      const testSuite: TestSuite = {
        version: '1.0',
        name: 'File path test',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'Load test data',
            input: {},
            stateExpectations: [
              {
                state: 'LoadData',
                output: { data: { items: [] } }, // Expected output
              },
            ],
          },
        ],
      }

      const mockConfig = {
        version: '1.0',
        mocks: [
          {
            state: 'LoadData',
            type: 'fixed' as const,
            response: {
              Payload: { items: [{ id: 1 }] },
            },
          },
        ],
      }

      const validator = new TestExecutionValidator()
      const customBasePath = '/custom/test/path'

      // This test ensures basePath is properly passed to MockEngine
      // The actual file loading behavior is tested in MockEngine tests
      const result = await validator.validateAndImprove(stateMachine, testSuite, mockConfig, {
        basePath: customBasePath,
      })

      expect(result.testCases).toHaveLength(1)
      expect(result.testCases[0].name).toBe('Load test data')
    })

    it('should work without basePath option (defaults to process.cwd)', async () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Simple test without basePath',
        StartAt: 'Pass',
        States: {
          Pass: {
            Type: 'Pass',
            Result: 'Success',
            End: true,
          },
        },
      })

      const testSuite: TestSuite = {
        version: '1.0',
        name: 'Default path test',
        stateMachine: 'test.asl.json',
        testCases: [
          {
            name: 'Simple test',
            input: {},
            stateExpectations: [
              {
                state: 'Pass',
                output: 'Success',
              },
            ],
          },
        ],
      }

      const mockConfig = { version: '1.0', mocks: [] }
      const validator = new TestExecutionValidator()

      // Should work without basePath option
      const result = await validator.validateAndImprove(stateMachine, testSuite, mockConfig)

      expect(result.testCases).toHaveLength(1)
      expect(result.corrections).toBeUndefined() // No corrections needed
    })
  })
})
