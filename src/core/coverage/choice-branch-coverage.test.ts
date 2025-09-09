import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../types/asl.js'
import { StateFactory } from '../../types/asl.js'
import type { MockConfig } from '../../types/mock.js'
import { StateMachineExecutor } from '../interpreter/executor.js'
import { MockEngine } from '../mock/engine.js'
import { CoverageTracker } from './tracker.js'

describe('Choice Branch Coverage with Default Mock', () => {
  it('should achieve full branch coverage despite mock always returning default', async () => {
    // JSONata workflow with Choice state
    const workflow: StateMachine = StateFactory.createStateMachine({
      Comment: 'Test workflow',
      StartAt: 'CalculateTotal',
      QueryLanguage: 'JSONata',
      States: {
        CalculateTotal: {
          Type: 'Pass',
          Assign: {
            orderTotal: '{% $sum($states.input.items.(price * quantity)) %}',
          },
          Next: 'ProcessOrder',
        },
        ProcessOrder: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Arguments: {
            FunctionName: 'ProcessOrderFunction',
            Payload: {
              orderId: '{% $uuid() %}',
              orderTotal: '{% $orderTotal %}',
            },
          },
          Output: '{% $states.result.Payload %}' as any,
          Next: 'CheckOrderValue',
        },
        CheckOrderValue: {
          Type: 'Choice',
          Choices: [
            {
              Condition: '{% $orderTotal > 1000 %}',
              Next: 'HighValue',
            } as any,
            {
              Condition: '{% $orderTotal > 100 %}',
              Next: 'StandardValue',
            } as any,
          ],
          Default: 'LowValue',
        },
        HighValue: {
          Type: 'Pass',
          Output: '{% { "status": "high" } %}' as any,
          End: true,
        },
        StandardValue: {
          Type: 'Pass',
          Output: '{% { "status": "standard" } %}' as any,
          End: true,
        },
        LowValue: {
          Type: 'Pass',
          Output: '{% { "status": "low" } %}' as any,
          End: true,
        },
      },
    })

    // Mock that ALWAYS returns default (orderId: "default-id")
    const mockConfig: MockConfig = {
      version: '1.0',
      mocks: [
        {
          state: 'ProcessOrder',
          type: 'conditional',
          conditions: [
            {
              when: {
                // This will NEVER match Lambda Arguments
                input: { nonExistentField: 'value' },
              },
              response: {
                Payload: { orderId: 'should-never-return', orderTotal: 9999 },
              },
            },
            {
              default: {
                Payload: { orderId: 'default-id', orderTotal: 25 },
              },
            },
          ],
        },
      ],
    }

    const mockEngine = new MockEngine(mockConfig)
    const executionEngine = new StateMachineExecutor(workflow, mockEngine)
    const coverageTracker = new CoverageTracker(workflow)

    // Test high value path ($orderTotal = 1500 from input calculation)
    const highValueResult = await executionEngine.execute({
      items: [{ price: 1500, quantity: 1 }],
    })
    coverageTracker.trackExecution(highValueResult.executionPath)

    expect(highValueResult.output).toEqual({ status: 'high' })
    expect(highValueResult.executionPath).toContain('HighValue')

    // Test standard value path ($orderTotal = 500 from input calculation)
    const standardValueResult = await executionEngine.execute({
      items: [{ price: 500, quantity: 1 }],
    })
    coverageTracker.trackExecution(standardValueResult.executionPath)

    expect(standardValueResult.output).toEqual({ status: 'standard' })
    expect(standardValueResult.executionPath).toContain('StandardValue')

    // Test low value path ($orderTotal = 50 from input calculation)
    const lowValueResult = await executionEngine.execute({
      items: [{ price: 50, quantity: 1 }],
    })
    coverageTracker.trackExecution(lowValueResult.executionPath)

    expect(lowValueResult.output).toEqual({ status: 'low' })
    expect(lowValueResult.executionPath).toContain('LowValue')

    // Prove that all 3 branches were covered despite mock returning default
    const coverage = coverageTracker.getCoverage()
    expect(coverage.branches.percentage).toBe(100)
    expect(coverage.branches.total).toBe(3) // 2 Choices + 1 Default
  })
})
