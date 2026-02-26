import { describe, expect, it } from 'vitest'
import { transformMapExecutions, transformParallelExecutions } from './execution-transformer'

describe('transformMapExecutions', () => {
  it('正常なMapExecution配列を変換できること', () => {
    const executions = [
      {
        state: 'MapState1',
        iterationPaths: [
          ['Step1', 'Step2'],
          ['Step1', 'Step3'],
        ],
      },
    ]

    const result = transformMapExecutions(executions)

    expect(result).toEqual([
      {
        state: 'MapState1',
        iterationPaths: [
          ['Step1', 'Step2'],
          ['Step1', 'Step3'],
        ],
      },
    ])
  })

  it('state が文字列でない場合は空文字にフォールバックすること', () => {
    const executions = [{ state: 123, iterationPaths: [['Step1']] }]

    const result = transformMapExecutions(executions as unknown[])

    expect(result[0].state).toBe('')
  })

  it('iterationPaths が正しい型でない場合は undefined になること', () => {
    const executions = [{ state: 'MapState1', iterationPaths: 'not-an-array' }]

    const result = transformMapExecutions(executions as unknown[])

    expect(result[0].iterationPaths).toBeUndefined()
  })

  it('iterationPaths 内に文字列でない要素がある場合は undefined になること', () => {
    const executions = [
      {
        state: 'MapState1',
        iterationPaths: [[1, 2, 3]],
      },
    ]

    const result = transformMapExecutions(executions as unknown[])

    expect(result[0].iterationPaths).toBeUndefined()
  })

  it('undefined 入力の場合は空配列を返すこと', () => {
    const result = transformMapExecutions(undefined)

    expect(result).toEqual([])
  })

  it('非オブジェクト要素はフィルタリングされること', () => {
    const executions = ['not-an-object', null, { state: 'MapState1' }]

    const result = transformMapExecutions(executions as unknown[])

    // 非オブジェクト要素は除外される
    expect(result).toHaveLength(1)
    expect(result[0].state).toBe('MapState1')
  })
})

describe('transformParallelExecutions', () => {
  it('正常なParallelExecution配列を変換できること', () => {
    const executions = [
      {
        type: 'parallel',
        state: 'ParallelState1',
        branchCount: 2,
        branchPaths: [['Branch1Step1', 'Branch1Step2'], ['Branch2Step1']],
      },
    ]

    const result = transformParallelExecutions(executions)

    expect(result).toEqual([
      {
        type: 'parallel',
        state: 'ParallelState1',
        branchCount: 2,
        branchPaths: [['Branch1Step1', 'Branch1Step2'], ['Branch2Step1']],
      },
    ])
  })

  it('type が文字列でない場合は "parallel" にフォールバックすること', () => {
    const executions = [{ type: 123, state: 'State1', branchCount: 1, branchPaths: [['S1']] }]

    const result = transformParallelExecutions(executions as unknown[])

    expect(result[0].type).toBe('parallel')
  })

  it('branchCount が数値でない場合は 0 にフォールバックすること', () => {
    const executions = [
      { type: 'parallel', state: 'State1', branchCount: 'not-a-number', branchPaths: [['S1']] },
    ]

    const result = transformParallelExecutions(executions as unknown[])

    expect(result[0].branchCount).toBe(0)
  })

  it('branchPaths が正しい型でない場合は空配列にフォールバックすること', () => {
    const executions = [
      { type: 'parallel', state: 'State1', branchCount: 1, branchPaths: 'invalid' },
    ]

    const result = transformParallelExecutions(executions as unknown[])

    expect(result[0].branchPaths).toEqual([])
  })

  it('undefined 入力の場合は空配列を返すこと', () => {
    const result = transformParallelExecutions(undefined)

    expect(result).toEqual([])
  })

  it('非オブジェクト要素はフィルタリングされること', () => {
    const executions = [
      42,
      null,
      { type: 'parallel', state: 'State1', branchCount: 1, branchPaths: [['S1']] },
    ]

    const result = transformParallelExecutions(executions as unknown[])

    expect(result).toHaveLength(1)
    expect(result[0].state).toBe('State1')
  })
})
