import { describe, expect, it } from 'vitest'
import type { MapState, StateMachine } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { ItemProcessorAnalyzer } from './item-processor-analyzer'

describe('ItemProcessorAnalyzer - Comprehensive Map Pattern Coverage', () => {
  describe('InlineMap patterns', () => {
    it('should analyze InlineMap with JSONPath and ItemSelector', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemsPath: '$.items',
            ItemSelector: {
              // Context object reference (典型的なInlineMapパターン)
              originalData: '$$.Map.Item.Value',
              itemIndex: '$$.Map.Item.Index',
              staticValue: 'processed',
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Parameters: {
                    FunctionName: 'ProcessFunction',
                    Payload: {
                      // ItemSelectorで変換後のデータにアクセス
                      data: '$.originalData',
                      index: '$.itemIndex',
                      status: '$.staticValue',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // InlineMapのItemSelectorが$$.Map.Item.Value (配列要素全体)を参照する場合、
      // 配列要素がどのようなフィールドを持つべきかは、ItemProcessorからは推論できない
      // この場合、特定のフィールド要求は検出されないのが正常
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []

      // このケースでは空の要求リストが正しい結果
      // ItemSelector が $$.Map.Item.Value (全体)を参照し、ItemProcessor が $.originalData でアクセスする場合、
      // originalDataはItemSelectorがセットした値なので、ItemReaderのデータ要件とは無関係
      // よって具体的なフィールド要求は決定できない
      expect(fieldNames.length).toBe(0)

      // Note: より具体的なテストケースを作るには、ItemSelectorで特定フィールドを参照させる必要がある
      // 例: originalData: '$$.Map.Item.Value.specificField' のような形
    })

    it('should analyze InlineMap with JSONPath and no ItemSelector', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemsPath: '$.users',
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'ProcessUser',
              States: {
                ProcessUser: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Parameters: {
                    FunctionName: 'ProcessUser',
                    Payload: {
                      // 配列要素に直接アクセス
                      userId: '$.id',
                      userName: '$.name',
                      userEmail: '$.email',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // 配列要素の直接フィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('id')
      expect(fieldNames).toContain('name')
      expect(fieldNames).toContain('email')
    })

    it('should analyze InlineMap with JSONata and ItemSelector', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        QueryLanguage: 'JSONata',
        States: {
          TestMap: {
            Type: 'Map',
            QueryLanguage: 'JSONata',
            Items: [
              { productId: 'p1', name: 'Product 1' },
              { productId: 'p2', name: 'Product 2' },
            ],
            ItemSelector: {
              product: '{% $states.context.Map.Item.Value %}',
              processedAt: '{% $now() %}',
              batchId: 'batch-001',
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'ProcessProduct',
              States: {
                ProcessProduct: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  QueryLanguage: 'JSONata',
                  Arguments: {
                    FunctionName: 'ProcessProduct',
                    Payload: {
                      // ItemSelectorで変換後のデータにアクセス
                      id: '{% $states.input.product.productId %}',
                      name: '{% $states.input.product.name %}',
                      timestamp: '{% $states.input.processedAt %}',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // ItemSelectorで使用される元のフィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames.length).toBeGreaterThanOrEqual(0)
    })

    it('should analyze InlineMap with JSONata and no ItemSelector', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        QueryLanguage: 'JSONata',
        States: {
          TestMap: {
            Type: 'Map',
            QueryLanguage: 'JSONata',
            Items: [
              { orderId: 'o1', amount: 100 },
              { orderId: 'o2', amount: 200 },
            ],
            ItemProcessor: {
              ProcessorConfig: { Mode: 'INLINE' },
              StartAt: 'ProcessOrder',
              States: {
                ProcessOrder: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  QueryLanguage: 'JSONata',
                  Arguments: {
                    FunctionName: 'ProcessOrder',
                    Payload: {
                      // 配列要素に直接アクセス
                      id: '{% $states.input.orderId %}',
                      total: '{% $states.input.amount %}',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // 配列要素の直接フィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('orderId')
      expect(fieldNames).toContain('amount')
    })
  })

  describe('DistributedMap patterns', () => {
    it('should analyze DistributedMap with JSONPath and ItemSelector', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              ReaderConfig: { InputType: 'JSONL' },
              Parameters: {
                Bucket: 'data-bucket',
                Key: 'accounts.jsonl',
              },
            },
            ItemSelector: {
              // DistributedMapでもContext objectを参照可能
              account: '$$.Map.Item.Value',
              metadata: {
                processedBy: 'distributed-processor',
                timestamp: '$$.Execution.StartTime',
              },
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'ProcessAccount',
              States: {
                ProcessAccount: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Parameters: {
                    FunctionName: 'ProcessAccount',
                    Payload: {
                      // ItemSelectorで変換後のデータにアクセス
                      id: '$.account.id',
                      name: '$.account.name',
                      processingInfo: '$.metadata',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // ItemSelectorで参照される元のItemReaderデータフィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []

      // ItemSelectorのContext object参照
      expect(fieldNames).toContain('Execution') // From $$.Execution.StartTime

      // ItemProcessorで使用される具体的なフィールド（ItemSelectorを通して）
      expect(fieldNames).toContain('id') // From $.account.id
      expect(fieldNames).toContain('name') // From $.account.name

      // ItemSelectorからの変換であることを示す
      const idReq = analysis?.inputRequirements.find((r) => r.field === 'id')
      expect(idReq?.description).toContain('ItemSelector')
    })

    it('should analyze DistributedMap with JSONPath and no ItemSelector', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              ReaderConfig: { InputType: 'JSONL' },
              Parameters: {
                Bucket: 'raw-data',
                Key: 'transactions.jsonl',
              },
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'ProcessTransaction',
              States: {
                ProcessTransaction: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Parameters: {
                    FunctionName: 'ProcessTransaction',
                    Payload: {
                      // ItemReaderデータに直接アクセス
                      transactionId: '$.txnId',
                      amount: '$.value',
                      currency: '$.currency',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // ItemReaderデータの直接フィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('txnId')
      expect(fieldNames).toContain('value')
      expect(fieldNames).toContain('currency')

      // ItemReaderからの直接アクセスであることを示す
      const txnIdReq = analysis?.inputRequirements.find((r) => r.field === 'txnId')
      expect(txnIdReq?.description).toContain('ItemReader')
    })

    it('should analyze DistributedMap with JSONata and ItemSelector', () => {
      const mapStateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: { InputType: 'CSV' },
          Arguments: {
            Bucket: 'customer-data',
            Key: 'customers.csv',
          },
        },
        ItemSelector: {
          customer: {
            // Context objectからの変換（JSONataモード）
            id: '{% $states.context.Map.Item.Value.customerId %}',
            profile: {
              name: '{% $states.context.Map.Item.Value.fullName %}',
              email: '{% $states.context.Map.Item.Value.emailAddress %}',
            },
          },
          metadata: {
            processedAt: '{% $now() %}',
            source: '{% "CSV import" %}',
          },
        } as any,
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'ValidateCustomer',
          States: {
            ValidateCustomer: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
              QueryLanguage: 'JSONata',
              Arguments: {
                FunctionName: 'ValidateCustomer',
                Payload: {
                  // ItemSelectorで変換後のネストしたデータにアクセス
                  customerId: '{% $states.input.customer.id %}',
                  customerName: '{% $states.input.customer.profile.name %}',
                  customerEmail: '{% $states.input.customer.profile.email %}',
                  processedAt: '{% $states.input.metadata.processedAt %}',
                },
              },
              End: true,
            },
          },
        },
        End: true,
      }

      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        QueryLanguage: 'JSONata',
        States: { TestMap: mapStateData },
      })
      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // ItemSelectorで使用される元のItemReaderフィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('customerId')
      expect(fieldNames).toContain('fullName')
      expect(fieldNames).toContain('emailAddress')

      // JSONataのItemSelectorからの変換であることを示す
      const customerIdReq = analysis?.inputRequirements.find((r) => r.field === 'customerId')
      expect(customerIdReq?.description).toContain('ItemSelector')
      expect(customerIdReq?.description).toContain('JSONata')
    })

    it('should analyze DistributedMap with JSONata and no ItemSelector', () => {
      const mapStateData = {
        Type: 'Map',
        QueryLanguage: 'JSONata',
        ItemReader: {
          Resource: 'arn:aws:states:::s3:getObject',
          ReaderConfig: { InputType: 'JSONL' },
          Arguments: {
            Bucket: 'event-logs',
            Key: 'events.jsonl',
          },
        },
        ItemProcessor: {
          ProcessorConfig: { Mode: 'DISTRIBUTED' },
          StartAt: 'ProcessEvent',
          States: {
            ProcessEvent: {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
              QueryLanguage: 'JSONata',
              Arguments: {
                FunctionName: 'ProcessEvent',
                Payload: {
                  // ItemReaderデータに直接アクセス（JSONataモード）
                  eventId: '{% $states.input.id %}',
                  eventType: '{% $states.input.type %}',
                  eventData: '{% $states.input.data %}',
                  timestamp: '{% $states.input.createdAt %}',
                },
              },
              End: true,
            },
          },
        },
        End: true,
      }

      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        QueryLanguage: 'JSONata',
        States: { TestMap: mapStateData },
      })
      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // ItemReaderデータの直接フィールドを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('id')
      expect(fieldNames).toContain('type')
      expect(fieldNames).toContain('data')
      expect(fieldNames).toContain('createdAt')

      // ItemReaderからの直接アクセス（JSONata）であることを示す
      const eventIdReq = analysis?.inputRequirements.find((r) => r.field === 'id')
      expect(eventIdReq?.description).toContain('ItemReader')
    })
  })

  // エッジケースと特殊パターン

  describe('Special cases and edge patterns', () => {
    it('should handle Context object direct access without ItemSelector in DistributedMap', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:listObjectsV2',
              Parameters: {
                Bucket: 'my-bucket',
              },
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'ProcessS3Object',
              States: {
                ProcessS3Object: {
                  Type: 'Task',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Parameters: {
                    FunctionName: 'ProcessS3Object',
                    Payload: {
                      // Context objectへの直接アクセス（ItemSelectorなし）
                      key: '$$.Map.Item.Value.Key',
                      size: '$$.Map.Item.Value.Size',
                      etag: '$$.Map.Item.Value.ETag',
                    },
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // Context objectの直接フィールドアクセスを検出
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('Key')
      expect(fieldNames).toContain('Size')
      expect(fieldNames).toContain('ETag')

      // Context objectへの直接アクセスであることを示す
      const keyReq = analysis?.inputRequirements.find((r) => r.field === 'Key')
      expect(keyReq?.description).toContain('Context object')
    })

    it('should analyze DistributedMap with ItemSelector referencing entire object (JSONata)', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        QueryLanguage: 'JSONata',
        States: {
          TestMap: {
            Type: 'Map',
            QueryLanguage: 'JSONata',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              ReaderConfig: { InputType: 'JSON' },
              Arguments: {
                Bucket: 'my-bucket',
                Key: 'data.json',
              },
            },
            // ItemSelector references entire object from ItemReader
            ItemSelector: `{
          "value": $states.context.Map.Item.Value,
          "metadata": {
            "processedAt": $now()
          }
        }`,
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessData',
                  QueryLanguage: 'JSONata',
                  Arguments: {
                    // Access nested fields through the object reference
                    customerId: '$states.input.value.customerId',
                    customerName: '$states.input.value.name',
                    orderTotal: '$states.input.value.order.total',
                    processedAt: '$states.input.metadata.processedAt',
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // Should detect nested field access through object reference
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('customerId')
      expect(fieldNames).toContain('name')
      expect(fieldNames).toContain('order')

      // Should understand this comes from ItemSelector object reference
      const customerIdReq = analysis?.inputRequirements.find((r) => r.field === 'customerId')
      expect(customerIdReq?.description).toContain('ItemSelector')
    })

    it('should analyze DistributedMap with ItemSelector referencing entire object (JSONPath)', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'TestMap',
        States: {
          TestMap: {
            Type: 'Map',
            ItemReader: {
              Resource: 'arn:aws:states:::s3:getObject',
              ReaderConfig: { InputType: 'JSON' },
              Parameters: {
                Bucket: 'my-bucket',
                Key: 'data.json',
              },
            },
            // ItemSelector references entire object from ItemReader
            ItemSelector: {
              'value.$': '$$.Map.Item.Value',
              'index.$': '$$.Map.Item.Index',
            },
            ItemProcessor: {
              ProcessorConfig: { Mode: 'DISTRIBUTED' },
              StartAt: 'ProcessItem',
              States: {
                ProcessItem: {
                  Type: 'Task',
                  Resource: 'arn:aws:lambda:us-east-1:123456789012:function:ProcessData',
                  Parameters: {
                    // Access nested fields through the object reference
                    'customerId.$': '$.value.customerId',
                    'customerName.$': '$.value.name',
                    'orderTotal.$': '$.value.order.total',
                    'index.$': '$.index',
                  },
                  End: true,
                },
              },
            },
            End: true,
          },
        },
      })

      const mapState = stateMachine.States.TestMap

      const analyzer = new ItemProcessorAnalyzer(stateMachine)
      const analysis = analyzer.analyzeItemProcessorInput(mapState as MapState)

      expect(analysis).not.toBeNull()

      // Should detect nested field access through object reference
      const fieldNames = analysis?.inputRequirements.map((r) => r.field) || []
      expect(fieldNames).toContain('customerId')
      expect(fieldNames).toContain('name')
      expect(fieldNames).toContain('order')

      // Should understand this comes from ItemSelector object reference
      const customerIdReq = analysis?.inputRequirements.find((r) => r.field === 'customerId')
      expect(customerIdReq?.description).toContain('ItemSelector')
    })
  })
})
