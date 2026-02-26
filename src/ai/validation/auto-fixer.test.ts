import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { autoFixMock, autoFixTest } from './auto-fixer'

const createStateMachine = (json: any) => StateFactory.createStateMachine(json as JsonObject)

describe('autoFixTest', () => {
  it('should replace outputMatching "exact" with "partial"', () => {
    const content = 'outputMatching: "exact"'
    expect(autoFixTest(content)).toBe('outputMatching: "partial"')
  })

  it('should handle single-quoted exact', () => {
    const content = "outputMatching: 'exact'"
    expect(autoFixTest(content)).toBe('outputMatching: "partial"')
  })

  it('should not modify "partial"', () => {
    const content = 'outputMatching: "partial"'
    expect(autoFixTest(content)).toBe('outputMatching: "partial"')
  })
})

describe('autoFixMock', () => {
  it('should wrap Lambda fixed response with Payload', () => {
    const stateMachine = createStateMachine({
      StartAt: 'LambdaTask',
      States: {
        LambdaTask: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          End: true,
        },
      },
    })

    const content = `version: "1.0"
mocks:
  - state: "LambdaTask"
    type: "fixed"
    response:
      result: "test"
`
    const fixed = autoFixMock(content, stateMachine)
    expect(fixed).toContain('Payload')
    expect(fixed).toContain('StatusCode')
  })

  it('should wrap Lambda conditional input with Payload', () => {
    const stateMachine = createStateMachine({
      StartAt: 'LambdaTask',
      States: {
        LambdaTask: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          End: true,
        },
      },
    })

    const content = `version: "1.0"
mocks:
  - state: "LambdaTask"
    type: "conditional"
    conditions:
      - when:
          input:
            userId: "123"
        response:
          name: "John"
`
    const fixed = autoFixMock(content, stateMachine)
    expect(fixed).toContain('Payload')
  })

  it('should not modify non-Lambda mocks', () => {
    const stateMachine = createStateMachine({
      StartAt: 'PassState',
      States: {
        PassState: { Type: 'Pass', End: true },
      },
    })

    const content = `version: "1.0"
mocks:
  - state: "PassState"
    type: "fixed"
    response:
      result: "test"
`
    const fixed = autoFixMock(content, stateMachine)
    expect(fixed).toBe(content)
  })

  it('should return original content for invalid YAML', () => {
    const stateMachine = createStateMachine({
      StartAt: 'Pass',
      States: { Pass: { Type: 'Pass', End: true } },
    })
    const content = 'invalid: yaml: content: ['
    expect(autoFixMock(content, stateMachine)).toBe(content)
  })
})
