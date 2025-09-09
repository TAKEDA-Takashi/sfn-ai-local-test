import { describe, expect, it } from 'vitest'
import type { MapState } from '../../types/state-classes'
import { StateFactory } from '../../types/state-factory'
import { generateSampleData } from './item-reader-analyzer'

describe('ItemReader Analyzer - ItemSelector handling', () => {
  it('should NOT include ItemSelector fields in generated ItemReader data', () => {
    // Create a Map state with ItemSelector that uses entire object
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        value: '{% $states.context.Map.Item.Value %}',
        notify: '{% $notify %}',
        period: '{% $period %}',
      },
      ItemProcessor: {
        ProcessorConfig: {
          Mode: 'DISTRIBUTED',
        },
        StartAt: 'ProcessItem',
        States: {
          ProcessItem: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:states:::states:startExecution',
            Arguments: {
              Input: '{% { "id": $states.input.value.id, "name": $states.input.value.name } %}',
            },
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 3, mapState)
    const lines = sampleData.split('\n')

    expect(lines).toHaveLength(3)

    // Parse first line and check structure
    const firstItem = JSON.parse(lines[0] ?? '{}')

    // ItemReader data should NOT contain ItemSelector fields
    expect(firstItem).not.toHaveProperty('value')
    expect(firstItem).not.toHaveProperty('notify')
    expect(firstItem).not.toHaveProperty('period')

    // ItemReader data should only contain the actual data fields
    expect(firstItem).toHaveProperty('id')
    expect(firstItem).toHaveProperty('name')
  })

  it('should generate ItemReader data based on ItemProcessor field usage when ItemSelector wraps entire object', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      ItemSelector: {
        'value.$': '$$.Map.Item.Value',
        'processedAt.$': '$.timestamp',
      },
      ItemProcessor: {
        StartAt: 'ProcessTask',
        States: {
          ProcessTask: {
            Type: 'Pass',
            Parameters: {
              'id.$': '$.value.id',
              'name.$': '$.value.name',
            },
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 2, mapState)
    const lines = sampleData.split('\n')

    const firstItem = JSON.parse(lines[0] ?? '{}')

    // ItemReader data should not have 'value' or 'processedAt' fields
    expect(firstItem).not.toHaveProperty('value')
    expect(firstItem).not.toHaveProperty('processedAt')

    // ItemReader data should have the actual fields used in ItemProcessor
    expect(firstItem).toHaveProperty('id')
    expect(firstItem).toHaveProperty('name')
  })

  it('should generate default ItemReader data structure when ItemProcessor has no field references', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        value: '{% $states.context.Map.Item.Value %}',
        metadata: '{% "test" %}',
      },
      ItemProcessor: {
        StartAt: 'SimplePass',
        States: {
          SimplePass: {
            Type: 'Pass',
            Result: 'Fixed result',
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 1, mapState)
    const item = JSON.parse(sampleData)

    // ItemReader data should not have ItemSelector fields
    expect(item).not.toHaveProperty('value')
    expect(item).not.toHaveProperty('metadata')

    // Should generate default structure with common fields
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('groupName')
    expect(item).toHaveProperty('lang')
    expect(item).toHaveProperty('addresses')
  })

  it('should generate ItemReader data with nested structures when ItemProcessor references them', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        value: '{% $states.context.Map.Item.Value %}',
      },
      ItemProcessor: {
        StartAt: 'ProcessNested',
        States: {
          ProcessNested: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:lambda:invoke',
            Arguments: {
              FunctionName: 'MyFunction',
              Payload:
                '{% { "email": $states.input.value.addresses.PRIMARY_EMAIL, "cc": $states.input.value.addresses.CC_EMAIL } %}',
            },
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 1, mapState)
    const item = JSON.parse(sampleData)

    // ItemReader data should not have 'value' field
    expect(item).not.toHaveProperty('value')

    // Should detect addresses field and generate nested structure at root level
    expect(item).toHaveProperty('addresses')
    expect(item.addresses).toHaveProperty('PRIMARY_EMAIL')
    expect(item.addresses).toHaveProperty('CC_EMAIL')
    expect(item.addresses.PRIMARY_EMAIL).toContain('@')
    expect(item.addresses.CC_EMAIL).toContain('@')
  })

  it('should work with arbitrary ItemSelector field names (not just "value")', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        arbitraryName: '{% $states.context.Map.Item.Value %}',
        customData: '{% $customInput %}',
      },
      ItemProcessor: {
        StartAt: 'ProcessTask',
        States: {
          ProcessTask: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:lambda:invoke',
            Arguments: {
              Input:
                '{% { "userId": $states.input.arbitraryName.id, "userName": $states.input.arbitraryName.name } %}',
            },
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 1, mapState)
    const item = JSON.parse(sampleData)

    // ItemReader data should not have ItemSelector field names
    expect(item).not.toHaveProperty('arbitraryName')
    expect(item).not.toHaveProperty('customData')

    // Should generate the actual data fields referenced through ItemSelector
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('name')
  })

  it('should handle deep nested structures (user.profile.settings.theme)', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        data: '{% $states.context.Map.Item.Value %}',
      },
      ItemProcessor: {
        StartAt: 'ProcessDeepNested',
        States: {
          ProcessDeepNested: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:lambda:invoke',
            Arguments: {
              Payload:
                '{% { "theme": $states.input.data.user.profile.settings.theme, "lang": $states.input.data.user.profile.settings.language, "id": $states.input.data.user.id } %}',
            },
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 1, mapState)
    const item = JSON.parse(sampleData)

    // Should generate deeply nested structure
    expect(item).toHaveProperty('user')
    expect(item.user).toHaveProperty('id')
    expect(item.user).toHaveProperty('profile')
    expect(item.user.profile).toHaveProperty('settings')
    expect(item.user.profile.settings).toHaveProperty('theme')
    expect(item.user.profile.settings).toHaveProperty('language')
  })

  it('should handle mixed ItemSelector patterns (specific field + whole object)', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        // 特定フィールドの直接取得
        specificId: '{% $states.context.Map.Item.Value.nest1.id %}',
        // 全体オブジェクトの取得
        value: '{% $states.context.Map.Item.Value %}',
        // 別の特定フィールド
        timestamp: '{% $states.context.Map.Item.Value.metadata.createdAt %}',
      },
      ItemProcessor: {
        StartAt: 'ProcessMixed',
        States: {
          ProcessMixed: {
            Type: 'Task',
            QueryLanguage: 'JSONata',
            Resource: 'arn:aws:lambda:invoke',
            Arguments: {
              Payload:
                '{% { "id": $states.input.specificId, "name": $states.input.value.nest1.name, "email": $states.input.value.nest1.contact.email, "created": $states.input.timestamp } %}',
            },
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 1, mapState)
    const item = JSON.parse(sampleData)

    // ItemReader data should NOT contain ItemSelector field names
    expect(item).not.toHaveProperty('specificId')
    expect(item).not.toHaveProperty('value')
    expect(item).not.toHaveProperty('timestamp')

    // Should generate all the actual data fields referenced
    expect(item).toHaveProperty('nest1') // from specificId and value references
    expect(item.nest1).toHaveProperty('id') // from specificId reference
    expect(item.nest1).toHaveProperty('name') // from value.nest1.name reference
    expect(item.nest1).toHaveProperty('contact') // from value.nest1.contact.email reference
    expect(item.nest1.contact).toHaveProperty('email')
    expect(item).toHaveProperty('metadata') // from timestamp reference
    expect(item.metadata).toHaveProperty('createdAt')
  })

  it('should only generate fields that are actually referenced in ItemSelector', () => {
    const mapState = StateFactory.createState({
      Type: 'Map',
      QueryLanguage: 'JSONata',
      ItemSelector: {
        selectedField: '{% $states.context.Map.Item.Value.specificField %}',
        anotherSelected: '{% $states.context.Map.Item.Value.anotherField %}',
      },
      ItemProcessor: {
        StartAt: 'Process',
        States: {
          Process: {
            Type: 'Pass',
            End: true,
          },
        },
      },
      End: true,
    }) as MapState

    const sampleData = generateSampleData('jsonl', 1, mapState)
    const item = JSON.parse(sampleData)

    // ItemReader data should only have the referenced fields
    expect(item).toHaveProperty('specificField')
    expect(item).toHaveProperty('anotherField')

    // Should not have ItemSelector field names
    expect(item).not.toHaveProperty('selectedField')
    expect(item).not.toHaveProperty('anotherSelected')
  })
})
