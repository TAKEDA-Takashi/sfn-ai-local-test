import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { NestedCoverageTracker } from '../../coverage/nested-coverage-tracker'
import { MockEngine } from '../../mock/engine'
import { StateMachineExecutor } from '../executor'

describe('Parallel State Coverage Bug', () => {
  it('should track all branch executions in coverage', async () => {
    // Create a simple parallel state with 2 branches
    const stateMachine = {
      StartAt: 'ParallelState',
      States: {
        ParallelState: StateFactory.createState({
          Type: 'Parallel',
          QueryLanguage: 'JSONata',
          Branches: [
            {
              StartAt: 'Branch1Task',
              States: {
                Branch1Task: StateFactory.createState({
                  Type: 'Pass',
                  QueryLanguage: 'JSONata',
                  Output: '{% {"branch": 1} %}',
                  End: true,
                }) as any,
              },
            },
            {
              StartAt: 'Branch2Task',
              States: {
                Branch2Task: StateFactory.createState({
                  Type: 'Pass',
                  QueryLanguage: 'JSONata',
                  Output: '{% {"branch": 2} %}',
                  End: true,
                }) as any,
              },
            },
          ],
          End: true,
        }),
      },
    }

    const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
    const executor = new StateMachineExecutor(stateMachine, mockEngine)

    const result = await executor.execute({ test: 'data' })

    // Check execution was successful
    expect(result.success).toBe(true)
    expect(result.executionPath).toContain('ParallelState')

    // Check parallel executions were tracked
    expect(result.parallelExecutions).toBeDefined()
    expect(result.parallelExecutions).toHaveLength(1)

    const parallelExec = result.parallelExecutions?.[0]
    expect(parallelExec?.state).toBe('ParallelState')
    expect(parallelExec?.branchCount).toBe(2)
    expect(parallelExec?.branchPaths).toHaveLength(2)
    expect((parallelExec?.branchPaths as any)?.[0]).toEqual(['Branch1Task'])
    expect((parallelExec?.branchPaths as any)?.[1]).toEqual(['Branch2Task'])

    // Test coverage tracking
    const coverageTracker = new NestedCoverageTracker(stateMachine)
    coverageTracker.trackExecution(result.executionPath)

    if (result.parallelExecutions) {
      coverageTracker.trackParallelExecutions(
        result.parallelExecutions.map((exec) => ({
          type: exec.type as string,
          state: exec.state as string,
          branchCount: exec.branchCount as number,
          branchPaths: exec.branchPaths as string[][],
        })),
      )
    }

    const coverage = coverageTracker.getCoverage()

    // Top level: 1 state (ParallelState only)
    expect(coverage.topLevel.total).toBe(1)
    expect(coverage.topLevel.covered).toBe(1)
    expect(coverage.topLevel.percentage).toBe(100)

    // Check nested coverage for parallel branches
    expect(coverage.nested).toBeDefined()
    expect(coverage.nested['ParallelState[0]']).toBeDefined()
    expect(coverage.nested['ParallelState[0]'].covered).toBe(1)
    expect(coverage.nested['ParallelState[1]']).toBeDefined()
    expect(coverage.nested['ParallelState[1]'].covered).toBe(1)
  })

  it('should debug actual branch execution', async () => {
    const stateMachine = {
      StartAt: 'TestParallel',
      States: {
        TestParallel: StateFactory.createState({
          Type: 'Parallel',
          QueryLanguage: 'JSONata',
          Branches: [
            {
              StartAt: 'TaskA',
              States: {
                TaskA: StateFactory.createState({
                  Type: 'Pass',
                  QueryLanguage: 'JSONata',
                  Output: '{% {"result": "A"} %}',
                  Next: 'TaskB',
                }) as any,
                TaskB: StateFactory.createState({
                  Type: 'Pass',
                  QueryLanguage: 'JSONata',
                  Output: '{% {"result": "B"} %}',
                  End: true,
                }) as any,
              },
            },
            {
              StartAt: 'TaskC',
              States: {
                TaskC: StateFactory.createState({
                  Type: 'Pass',
                  QueryLanguage: 'JSONata',
                  Output: '{% {"result": "C"} %}',
                  End: true,
                }) as any,
              },
            },
          ],
          End: true,
        }),
      },
    }

    const mockEngine = new MockEngine({ version: '1.0', mocks: [] })
    const executor = new StateMachineExecutor(stateMachine, mockEngine)

    // Enable detailed tracking
    const context: ExecutionContext = {
      input: { test: 'data' },
      currentState: '',
      executionPath: [],
      variables: {},
      stateExecutions: [],
      parallelExecutions: [],
    }

    const result = await executor.execute(context)

    console.log('Execution result:', {
      success: result.success,
      executionPath: result.executionPath,
      stateExecutions: result.stateExecutions?.map((se) => ({
        state: se.state,
        parentState: se.parentState,
        iterationIndex: se.iterationIndex,
      })),
      parallelExecutions: result.parallelExecutions,
    })

    // Verify state executions include branch states
    const branchStates = result.stateExecutions?.filter((se) => se.parentState === 'TestParallel')
    console.log('Branch states found:', branchStates?.length)

    expect(branchStates).toBeDefined()
    expect(branchStates?.length).toBeGreaterThan(0)

    // Check that branch states were actually executed
    const branch0States = branchStates?.filter((se) => se.iterationIndex === 0)
    const branch1States = branchStates?.filter((se) => se.iterationIndex === 1)

    console.log(
      'Branch 0 states:',
      branch0States?.map((s) => s.state),
    )
    console.log(
      'Branch 1 states:',
      branch1States?.map((s) => s.state),
    )

    expect(branch0States).toHaveLength(2) // TaskA and TaskB
    expect(branch1States).toHaveLength(1) // TaskC
  })
})
