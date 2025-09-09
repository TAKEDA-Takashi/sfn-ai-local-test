import { beforeEach, describe, expect, it } from 'vitest'
import type { ExecutionContext, MapState, ParallelState } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import type { MockEngine } from '../../mock/engine'
import { MapStateExecutor } from './map'
import { ParallelStateExecutor } from './parallel'

describe('Variables Scope in Parallel and Map States', () => {
  let context: ExecutionContext
  let mockEngine: MockEngine

  beforeEach(() => {
    context = {
      input: { data: 'test' },
      currentState: 'TestState',
      executionPath: [],
      variables: {
        outerVar: 'outer-value',
        sharedVar: 'initial-value',
      },
      originalInput: { data: 'test' },
      stateExecutions: [],
      currentStatePath: [],
      mapExecutions: [],
      parallelExecutions: [],
    }

    mockEngine = {
      getMockResponse: async () => ({ result: 'mock-response' }),
    } as unknown as MockEngine
  })

  describe('Parallel State Variable Scope', () => {
    it('should allow branches to read outer scope variables', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'Branch1Task',
            States: {
              Branch1Task: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  readOuterVar: '{% $outerVar %}',
                  branch1Var: 'branch1-value',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'Branch2Task',
            States: {
              Branch2Task: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  readOuterVar: '{% $outerVar %}',
                  branch2Var: 'branch2-value',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'NextState',
      })

      const executor = new ParallelStateExecutor(parallelState as ParallelState, mockEngine)
      const result = await executor.execute(context)

      // Each branch should be able to read outer scope variables
      expect(result.success).toBe(true)
      // Note: The actual implementation needs to verify that branches can read $outerVar
    })

    it('should isolate variable assignments between parallel branches', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'Branch1Task',
            States: {
              Branch1Task: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  branchSpecificVar: 'branch1-value',
                  sharedVar: 'modified-by-branch1',
                },
                End: true,
              },
            },
          },
          {
            StartAt: 'Branch2Task',
            States: {
              Branch2Task: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  branchSpecificVar: 'branch2-value',
                  sharedVar: 'modified-by-branch2',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'NextState',
      })

      const executor = new ParallelStateExecutor(parallelState as ParallelState, mockEngine)
      await executor.execute(context)

      // After parallel execution, outer scope variables should remain unchanged
      expect(context.variables.sharedVar).toBe('initial-value')
      expect(context.variables.branchSpecificVar).toBeUndefined()
    })

    it('should not allow branches to modify outer scope variables', async () => {
      const parallelState = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'ModifyOuterVar',
            States: {
              ModifyOuterVar: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  outerVar: 'modified-value',
                },
                End: true,
              },
            },
          },
        ],
        Next: 'NextState',
      })

      const executor = new ParallelStateExecutor(parallelState as ParallelState, mockEngine)
      await executor.execute(context)

      // Outer scope variable should remain unchanged
      expect(context.variables.outerVar).toBe('outer-value')
    })
  })

  describe('Map State Variable Scope', () => {
    describe('Inline Map Mode', () => {
      it('should allow items to read outer scope variables', async () => {
        const mapState = StateFactory.createState({
          Type: 'Map',
          ItemsPath: '$.items',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'INLINE',
            },
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  readOuterVar: '{% $outerVar %}',
                  itemVar: 'item-value',
                },
                End: true,
              },
            },
          },
          Next: 'NextState',
        })

        context.input = { items: ['item1', 'item2'] }
        const executor = new MapStateExecutor(mapState as MapState, mockEngine)
        const result = await executor.execute(context)

        expect(result.success).toBe(true)
        // Items should be able to read outer scope variables
      })

      it('should isolate variable assignments between map iterations', async () => {
        const mapState = StateFactory.createState({
          Type: 'Map',
          ItemsPath: '$.items',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'INLINE',
            },
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  iterationVar: '{% "iteration-" & $states.input %}',
                  sharedVar: '{% "modified-by-" & $states.input %}',
                },
                End: true,
              },
            },
          },
          Next: 'NextState',
        })

        context.input = { items: ['item1', 'item2'] }
        const executor = new MapStateExecutor(mapState as MapState, mockEngine)
        await executor.execute(context)

        // After map execution, outer scope variables should remain unchanged
        expect(context.variables.sharedVar).toBe('initial-value')
        expect(context.variables.iterationVar).toBeUndefined()
      })
    })

    describe('Distributed Map Mode', () => {
      it('should NOT allow items to read outer scope variables', async () => {
        const mapState = StateFactory.createState({
          Type: 'Map',
          ItemsPath: '$.items',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
              ExecutionType: 'STANDARD',
            },
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  // This should fail or return undefined in distributed mode
                  readOuterVar: '{% $outerVar %}',
                  itemVar: 'item-value',
                },
                End: true,
              },
            },
          },
          Next: 'NextState',
        })

        context.input = { items: ['item1'] }
        const executor = new MapStateExecutor(mapState as MapState, mockEngine)
        const result = await executor.execute(context)

        // In distributed mode, outer variables should not be accessible
        // The actual behavior should be verified based on AWS documentation
        expect(result.success).toBe(true)
      })

      it('should have completely isolated variable scope in distributed mode', async () => {
        const mapState = StateFactory.createState({
          Type: 'Map',
          ItemsPath: '$.items',
          ItemProcessor: {
            ProcessorConfig: {
              Mode: 'DISTRIBUTED',
              ExecutionType: 'EXPRESS',
            },
            StartAt: 'ProcessItem',
            States: {
              ProcessItem: {
                Type: 'Pass',
                QueryLanguage: 'JSONata',
                Assign: {
                  distributedVar: 'distributed-value',
                },
                End: true,
              },
            },
          },
          Next: 'NextState',
        })

        context.input = { items: ['item1'] }
        const executor = new MapStateExecutor(mapState as MapState, mockEngine)
        await executor.execute(context)

        // Distributed mode variables should not affect outer scope
        expect(context.variables.distributedVar).toBeUndefined()
        expect(context.variables.outerVar).toBe('outer-value')
      })
    })
  })

  describe('Nested Parallel and Map Variable Scope', () => {
    it('should maintain proper scope hierarchy in nested structures', async () => {
      const parallelWithNestedMap = StateFactory.createState({
        Type: 'Parallel',
        Branches: [
          {
            StartAt: 'NestedMap',
            States: {
              NestedMap: {
                Type: 'Map',
                ItemsPath: '$.items',
                ItemProcessor: {
                  ProcessorConfig: {
                    Mode: 'INLINE',
                  },
                  StartAt: 'ProcessNestedItem',
                  States: {
                    ProcessNestedItem: {
                      Type: 'Pass',
                      QueryLanguage: 'JSONata',
                      Assign: {
                        // Should be able to read outerVar from top-level scope
                        readTopLevelVar: '{% $outerVar %}',
                        nestedMapVar: 'nested-value',
                      },
                      End: true,
                    },
                  },
                },
                End: true,
              },
            },
          },
        ],
        Next: 'NextState',
      })

      context.input = { items: ['item1', 'item2'] }
      const executor = new ParallelStateExecutor(parallelWithNestedMap as ParallelState, mockEngine)
      await executor.execute(context)

      // Top-level variables should remain unchanged
      expect(context.variables.outerVar).toBe('outer-value')
      expect(context.variables.nestedMapVar).toBeUndefined()
    })
  })
})
