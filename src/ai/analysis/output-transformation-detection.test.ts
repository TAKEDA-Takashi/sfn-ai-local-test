import { describe, expect, it } from 'vitest'
import { StateFactory } from '../../types/asl'
import {
  detectOutputTransformation,
  getOutputTransformationDetails,
} from './output-transformation-detection'

describe('Output Transformation Detection', () => {
  describe('JSONPath transformations', () => {
    it('should detect ResultSelector transformation', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test ResultSelector transformation',
        StartAt: 'Process',
        States: {
          Process: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            ResultSelector: {
              'user.$': '$.Payload.userData',
              'timestamp.$': '$.Payload.timestamp',
            },
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(true)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(1)
      expect(details[0]).toMatchObject({
        stateName: 'Process',
        transformationType: 'ResultSelector',
        taskResource: 'arn:aws:states:::lambda:invoke',
        transformsOutput: true,
        reason: 'ResultSelector extracts specific fields',
      })
    })

    it('should detect OutputPath filtering', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test OutputPath filtering',
        StartAt: 'Process',
        States: {
          Process: {
            Type: 'Task',
            Resource: 'arn:aws:states:::dynamodb:putItem',
            OutputPath: '$.result',
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(true)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(1)
      expect(details[0]).toMatchObject({
        stateName: 'Process',
        transformationType: 'OutputPath',
        taskResource: 'arn:aws:states:::dynamodb:putItem',
        transformsOutput: true,
        reason: 'OutputPath filters output',
      })
    })

    it('should detect ResultPath merging', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test ResultPath merging',
        StartAt: 'Process',
        States: {
          Process: {
            Type: 'Task',
            Resource: 'arn:aws:states:::sns:publish',
            ResultPath: '$.metadata',
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(true)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(1)
      expect(details[0]).toMatchObject({
        stateName: 'Process',
        transformationType: 'ResultPath',
        taskResource: 'arn:aws:states:::sns:publish',
        transformsOutput: true,
        reason: 'ResultPath merges result with input',
      })
    })
  })

  describe('JSONata transformations', () => {
    it('should detect JSONata Output transformation', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test JSONata Output transformation',
        StartAt: 'Transform',
        States: {
          Transform: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            QueryLanguage: 'JSONata',
            Arguments: {
              FunctionName: 'test-function',
              Payload: '{% $states.input %}',
            },
            Output: '{% { "result": $states.result.Payload.total * 2, "status": "processed" } %}',
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(true)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(1)
      expect(details[0]).toMatchObject({
        stateName: 'Transform',
        transformationType: 'JSONataOutput',
        taskResource: 'arn:aws:states:::lambda:invoke',
        transformsOutput: true,
        reason: 'JSONata Output transforms and computes values',
      })
    })

    it('should detect JSONata Assign transformation', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Test JSONata Assign transformation',
        StartAt: 'Assign',
        States: {
          Assign: {
            Type: 'Task',
            Resource: 'arn:aws:states:::dynamodb:query',
            QueryLanguage: 'JSONata',
            Arguments: {
              TableName: 'test-table',
              KeyConditionExpression: 'pk = :pk',
              ExpressionAttributeValues: {
                ':pk': '{% $states.input.id %}',
              },
            },
            Assign: {
              'processedItems.$': '$states.result.Count * 2',
              'summary.$': '"Processed " & $states.result.Count & " items"',
            },
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(true)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(1)
      expect(details[0]).toMatchObject({
        stateName: 'Assign',
        transformationType: 'JSONataAssign',
        taskResource: 'arn:aws:states:::dynamodb:query',
        transformsOutput: true,
        reason: 'JSONata Assign computes and assigns values',
      })
    })
  })

  describe('Non-transforming states', () => {
    it('should not detect transformation for simple Task state', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Simple Task without transformation',
        StartAt: 'SimpleTask',
        States: {
          SimpleTask: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(false)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(0)
    })

    it('should not detect transformation for non-Task states', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Non-Task states',
        StartAt: 'Pass',
        States: {
          Pass: {
            Type: 'Pass',
            Result: 'Success',
            Next: 'Succeed',
          },
          Succeed: {
            Type: 'Succeed',
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(false)
    })
  })

  describe('Mixed transformations', () => {
    it('should detect multiple types of transformations in one state machine', () => {
      const stateMachine = StateFactory.createStateMachine({
        Comment: 'Mixed transformations',
        StartAt: 'Step1',
        States: {
          Step1: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'test-function',
              Payload: { test: 'data' },
            },
            ResultSelector: {
              'data.$': '$.Payload',
            },
            Next: 'Step2',
          },
          Step2: {
            Type: 'Task',
            Resource: 'arn:aws:states:::dynamodb:putItem',
            QueryLanguage: 'JSONata',
            Arguments: {
              TableName: 'test-table',
              Item: {
                id: '{% $states.input.id %}',
                data: '{% $states.input.data %}',
              },
            },
            Output: '{% { "id": $states.result.Item.id, "processed": true } %}',
            Next: 'Step3',
          },
          Step3: {
            Type: 'Task',
            Resource: 'arn:aws:states:::sns:publish',
            Parameters: {
              TopicArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
              Message: 'Test message',
            },
            OutputPath: '$.MessageId',
            End: true,
          },
        },
      })

      const hasTransformation = detectOutputTransformation(stateMachine)
      expect(hasTransformation).toBe(true)

      const details = getOutputTransformationDetails(stateMachine)
      expect(details).toHaveLength(3)

      const transformationTypes = details.map((d) => d.transformationType)
      expect(transformationTypes).toContain('ResultSelector')
      expect(transformationTypes).toContain('JSONataOutput')
      expect(transformationTypes).toContain('OutputPath')
    })
  })
})
