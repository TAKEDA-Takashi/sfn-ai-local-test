import { describe, expect, it } from 'vitest'
import type { PassState } from '../../../types/asl'
import { StateFactory } from '../../../types/asl'
import { PassStateExecutor } from './pass'

describe('PassStateExecutor with JSONata', () => {
  it('should execute Pass state with JSONata Output field', async () => {
    const state: PassState = StateFactory.createState({
      Type: 'Pass',
      QueryLanguage: 'JSONata',
      Output: '{% { "result": $range(1, 3, 1) } %}' as any,
      End: true,
    }) as PassState

    const executor = new PassStateExecutor(state)
    const result = await executor.execute({
      input: {},
      Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      currentState: 'PassState',
      executionPath: [],
      variables: {},
      originalInput: {},
      stateExecutions: [],
    } as any)

    expect(result.output).toEqual({ result: [1, 2, 3] })
  })

  it('should handle JSONata $partition function', async () => {
    const state: PassState = StateFactory.createState({
      Type: 'Pass',
      QueryLanguage: 'JSONata',
      Output: '{% $partition(items, 2) %}' as any,
      End: true,
    }) as PassState

    const executor = new PassStateExecutor(state)
    const result = await executor.execute({
      input: { items: [1, 2, 3, 4, 5] },
      Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      currentState: 'PassState',
      executionPath: [],
      variables: {},
      originalInput: {},
      stateExecutions: [],
    } as any)

    expect(result.output).toEqual([[1, 2], [3, 4], [5]])
  })

  it('should handle JSONata $hash function', async () => {
    const state: PassState = StateFactory.createState({
      Type: 'Pass',
      QueryLanguage: 'JSONata',
      Output: '{% $hash(text, "SHA-256") %}' as any,
      End: true,
    }) as PassState

    const executor = new PassStateExecutor(state)
    const result = await executor.execute({
      input: { text: 'test' },
      Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      currentState: 'PassState',
      executionPath: [],
      variables: {},
      originalInput: {},
      stateExecutions: [],
    } as any)

    expect(result.output).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
  })

  it('should return undefined for empty array with $partition', async () => {
    const state: PassState = StateFactory.createState({
      Type: 'Pass',
      QueryLanguage: 'JSONata',
      Output: '{% $partition(items, 2) %}' as any,
      End: true,
    }) as PassState

    const executor = new PassStateExecutor(state)
    const result = await executor.execute({
      input: { items: [] },
      Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      currentState: 'PassState',
      executionPath: [],
      variables: {},
      originalInput: {},
      stateExecutions: [],
    } as any)

    expect(result.output).toBeUndefined()
  })

  it('should handle $range with single value result', async () => {
    const state: PassState = StateFactory.createState({
      Type: 'Pass',
      QueryLanguage: 'JSONata',
      Output: '{% $range(5, 5, 1) %}' as any,
      End: true,
    }) as PassState

    const executor = new PassStateExecutor(state)
    const result = await executor.execute({
      input: {},
      Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      currentState: 'PassState',
      executionPath: [],
      variables: {},
      originalInput: {},
      stateExecutions: [],
    } as any)

    expect(result.output).toBe(5) // Single value, not array
  })

  it('should work with Output field instead of Arguments for Pass state', async () => {
    const state: PassState = StateFactory.createState({
      Type: 'Pass',
      QueryLanguage: 'JSONata',
      Output: '{% { "fullName": $states.input.firstName & " " & $states.input.lastName } %}' as any,
      End: true,
    }) as PassState

    const executor = new PassStateExecutor(state)
    const result = await executor.execute({
      input: { firstName: 'John', lastName: 'Doe' },
      Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      currentState: 'PassState',
      executionPath: [],
      variables: {},
      originalInput: {},
      stateExecutions: [],
    } as any)

    expect(result.output).toEqual({ fullName: 'John Doe' })
  })
})
