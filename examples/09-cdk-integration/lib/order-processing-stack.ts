import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import type { Construct } from 'constructs'

export class OrderProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Lambda関数の参照（実際のプロジェクトでは別途実装）
    const validateOrderFn = lambda.Function.fromFunctionArn(
      this,
      'ValidateOrderFn',
      'arn:aws:lambda:us-east-1:123456789012:function:ValidateOrder',
    )

    const calculateDiscountFn = lambda.Function.fromFunctionArn(
      this,
      'CalculateDiscountFn',
      'arn:aws:lambda:us-east-1:123456789012:function:CalculateDiscount',
    )

    const processOrderFn = lambda.Function.fromFunctionArn(
      this,
      'ProcessOrderFn',
      'arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder',
    )

    const sendEmailFn = lambda.Function.fromFunctionArn(
      this,
      'SendEmailFn',
      'arn:aws:lambda:us-east-1:123456789012:function:SendEmail',
    )

    // Pass state: 初期設定
    const prepareOrder = new sfn.Pass(this, 'PrepareOrder', {
      parameters: {
        'orderId.$': '$.orderId',
        'customerId.$': '$.customerId',
        'items.$': '$.items',
        'totalAmount.$': '$.totalAmount',
        'timestamp.$': '$$.State.EnteredTime',
      },
    })

    // Task state: 注文検証
    const validateOrder = new tasks.LambdaInvoke(this, 'ValidateOrder', {
      lambdaFunction: validateOrderFn,
      outputPath: '$.Payload',
    })

    // Choice state: 金額による分岐
    const checkOrderAmount = new sfn.Choice(this, 'CheckOrderAmount').when(
      sfn.Condition.numberGreaterThan('$.totalAmount', 5000),
      new tasks.LambdaInvoke(this, 'CalculateDiscount', {
        lambdaFunction: calculateDiscountFn,
        resultPath: '$.discount',
        outputPath: '$',
      }),
    )

    // Parallel state: 並列処理
    const parallelProcessing = new sfn.Parallel(this, 'ParallelProcessing')
      .branch(
        new tasks.LambdaInvoke(this, 'ProcessOrder', {
          lambdaFunction: processOrderFn,
          outputPath: '$.Payload',
        }),
      )
      .branch(
        new tasks.LambdaInvoke(this, 'SendOrderEmail', {
          lambdaFunction: sendEmailFn,
          payload: sfn.TaskInput.fromObject({
            'customerId.$': '$.customerId',
            'orderId.$': '$.orderId',
            emailType: 'ORDER_CONFIRMATION',
          }),
          outputPath: '$.Payload',
        }),
      )

    // Map state: アイテムごとの処理 (using modern ItemProcessor and ItemSelector)
    const processItems = new sfn.Map(this, 'ProcessItems', {
      itemsPath: '$.items',
      maxConcurrency: 5,
      resultPath: '$.processedItems',
      // Use itemSelector for data transformation per item (modern ASL syntax)
      itemSelector: {
        'itemId.$': '$.itemId',
        'quantity.$': '$.quantity',
        'price.$': '$.price',
        status: 'processed',
      },
    }).itemProcessor(
      // Simple Pass state since itemSelector handles the transformation
      new sfn.Pass(this, 'ProcessItem'),
    )

    // Wait state: 処理待機
    const waitForProcessing = new sfn.Wait(this, 'WaitForProcessing', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(3)),
    })

    // Success and Fail states
    const orderComplete = new sfn.Succeed(this, 'OrderComplete')
    const orderFailed = new sfn.Fail(this, 'OrderFailed', {
      error: 'OrderProcessingError',
      cause: 'Failed to process the order',
    })

    // Error handling: Catch設定
    validateOrder.addCatch(orderFailed, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    })

    // Retry設定
    validateOrder.addRetry({
      errors: ['Lambda.ServiceException'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    })

    // ワークフロー定義
    const definition = prepareOrder
      .next(validateOrder)
      .next(checkOrderAmount.afterwards())
      .next(processItems)
      .next(waitForProcessing)
      .next(parallelProcessing)
      .next(orderComplete)

    // Choice stateのデフォルトパス
    checkOrderAmount.otherwise(processItems)

    // ステートマシン作成
    new sfn.StateMachine(this, 'OrderProcessingStateMachine', {
      definition,
      timeout: cdk.Duration.minutes(10),
      tracingEnabled: true,
      stateMachineName: 'OrderProcessingWorkflow',
    })
  }
}
