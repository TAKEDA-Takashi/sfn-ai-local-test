import { describe, expect, it } from 'vitest'
import type { JsonObject, StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { DataFlowAnalyzer } from './data-flow-analyzer'

// Helper function to create a StateMachine with proper State instances
function createStateMachine(config: Record<string, unknown>): StateMachine {
  const result = { ...config }

  // Add QueryLanguage if not specified
  if (!result.QueryLanguage) {
    result.QueryLanguage = 'JSONPath'
  }

  if (result.States && typeof result.States === 'object') {
    const states: Record<string, unknown> = {}
    for (const [name, stateConfig] of Object.entries(result.States as Record<string, unknown>)) {
      if (typeof stateConfig === 'object' && stateConfig !== null) {
        states[name] = StateFactory.createState(
          stateConfig as JsonObject,
          result.QueryLanguage as 'JSONPath' | 'JSONata',
        )
      }
    }
    result.States = states

    // Add StartAt if not specified
    if (!result.StartAt && Object.keys(states).length > 0) {
      result.StartAt = Object.keys(states)[0]
    }
  }
  return result as unknown as StateMachine
}

describe('DataFlowAnalyzer', () => {
  it('should analyze 08-jsonata workflow and recommend fixed mock', () => {
    // Actual 08-jsonata workflow (simplified)
    const workflow: StateMachine = createStateMachine({
      Comment: 'Comprehensive JSONata demonstration workflow',
      StartAt: 'CalculateOrderTotal',
      QueryLanguage: 'JSONata',
      States: {
        CalculateOrderTotal: {
          Type: 'Pass',
          Assign: {
            orderTotal: '{% $sum($states.input.items.(price * quantity)) %}',
            itemCount: '{% $count($states.input.items) %}',
            customerFullName:
              "{% $states.input.customer.firstName & ' ' & $states.input.customer.lastName %}",
          },
          Output:
            "{% $merge([$states.input, {'calculatedTotal': $orderTotal, 'totalItems': $itemCount}]) %}" as any,
          Next: 'ProcessOrder',
        },
        ProcessOrder: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Arguments: {
            FunctionName: 'ProcessOrderFunction',
            Payload: {
              orderId: '{% $uuid() %}',
              customerId: '{% $states.input.customer.id %}',
              customerName: '{% $customerFullName %}',
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
              Next: 'ProcessHighValueOrder',
            } as any,
            {
              Condition: '{% $orderTotal > 100 %}',
              Next: 'ProcessStandardOrder',
            } as any,
          ],
          Default: 'ProcessLowValueOrder',
        },
        ProcessHighValueOrder: {
          Type: 'Pass',
          Output: "{% { 'status': 'high-value', 'discount': 0.15 } %}" as any,
          Next: 'FormatFinalOutput',
        },
        ProcessStandardOrder: {
          Type: 'Pass',
          Output: "{% { 'status': 'standard', 'discount': 0.05 } %}" as any,
          Next: 'FormatFinalOutput',
        },
        ProcessLowValueOrder: {
          Type: 'Pass',
          Output: "{% { 'status': 'low-value', 'discount': 0 } %}" as any,
          Next: 'FormatFinalOutput',
        },
        FormatFinalOutput: {
          Type: 'Pass',
          Output:
            "{% { 'summary': { 'customerName': $customerFullName, 'orderTotal': $orderTotal } } %}" as any,
          End: true,
        },
      },
    })

    const analyzer = new DataFlowAnalyzer(workflow)

    // データフロー分析
    const dataFlow = analyzer.analyzeDataFlow()
    const processOrderNode = dataFlow.find((node) => node.stateName === 'ProcessOrder')
    expect(processOrderNode).toBeDefined()
    if (!processOrderNode) throw new Error('ProcessOrder node not found')

    expect(processOrderNode.produces).toEqual([]) // Taskステートは変数を生成しない（Assignがない）
    expect(processOrderNode.consumes).toEqual(
      expect.arrayContaining(['$orderTotal', '$customerFullName']),
    )
    expect(processOrderNode.outputExtraction).toContain('$states.result.Payload')

    // Choice条件の分析
    const choiceNode = dataFlow.find((node) => node.stateName === 'CheckOrderValue')
    expect(choiceNode).toBeDefined()
    if (!choiceNode) throw new Error('CheckOrderValue node not found')

    expect(choiceNode.consumes).toEqual(['$orderTotal', '$orderTotal']) // 2つの条件で使用
    expect(choiceNode.consumes).not.toContain('$states.result.Payload.orderTotal') // Lambda出力は使わない

    // モック要件分析
    const mockRequirements = analyzer.analyzeMockRequirements()
    const processOrderReq = mockRequirements.find((req) => req.stateName === 'ProcessOrder')
    expect(processOrderReq).toBeDefined()
    if (!processOrderReq) throw new Error('ProcessOrder requirement not found')

    // Debug output
    console.log('ProcessOrder requirement:', processOrderReq)

    expect(processOrderReq.required).toBe(true)
    expect(processOrderReq.minimalFields).toContain('Payload')
    expect(processOrderReq.complexity).toBe('fixed') // 固定モックで十分
    // expect(processOrderReq.reason).toContain('original variables used, not task output')
  })

  it('should detect when conditional mock IS needed', () => {
    // Workflow where Lambda output is actually used in conditions
    const workflowUsingLambdaOutput: StateMachine = createStateMachine({
      QueryLanguage: 'JSONata',
      StartAt: 'ProcessPayment',
      States: {
        ProcessPayment: {
          Type: 'Task',
          Resource: 'arn:aws:states:::lambda:invoke',
          Arguments: { FunctionName: 'PaymentFunction' },
          Output: '{% $states.result.Payload %}',
          Next: 'CheckPaymentStatus',
        } as any,
        CheckPaymentStatus: {
          Type: 'Choice',
          Choices: [
            {
              // Uses Lambda output directly in condition
              Condition: '{% $states.result.Payload.status = "success" %}',
              Next: 'PaymentSuccess',
            } as any,
          ],
          Default: 'PaymentFailed',
        } as any,
        PaymentSuccess: {
          Type: 'Pass',
          End: true,
        },
        PaymentFailed: {
          Type: 'Pass',
          End: true,
        },
      },
    })

    const analyzer = new DataFlowAnalyzer(workflowUsingLambdaOutput)
    const mockRequirements = analyzer.analyzeMockRequirements()
    const paymentReq = mockRequirements[0]

    expect(paymentReq?.complexity).toBe('conditional') // 条件分岐が必要
    expect(paymentReq?.reason).toContain('output directly used in conditions')
  })
})
