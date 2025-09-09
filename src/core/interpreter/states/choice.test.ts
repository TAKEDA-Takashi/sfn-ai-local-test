import { describe, expect, it } from 'vitest'
import type { ChoiceState } from '../../../types/state-classes'
import { StateFactory } from '../../../types/state-factory'
import { ChoiceStateExecutor } from './choice'

describe('ChoiceStateExecutor', () => {
  describe('JSONPath mode', () => {
    it('should evaluate boolean condition correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.isAdult',
            BooleanEquals: true,
            Next: 'ProcessAdult',
          },
        ],
        Default: 'ProcessMinor',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { isAdult: true, name: 'John' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      expect(result.nextState).toBe('ProcessAdult')
    })

    it('should use default when no choice matches', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.isAdult',
            BooleanEquals: true,
            Next: 'ProcessAdult',
          },
        ],
        Default: 'ProcessMinor',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { isAdult: false, name: 'Jane' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      expect(result.nextState).toBe('ProcessMinor')
    })
  })

  describe('JSONata mode', () => {
    it('should throw error when Variable field is used in JSONata mode', () => {
      // 構築時にエラーが投げられることを期待
      expect(() =>
        StateFactory.createState({
          Type: 'Choice',
          QueryLanguage: 'JSONata',
          Choices: [
            {
              Variable: '$.isAdult',
              BooleanEquals: true,
              Next: 'ProcessAdult',
            },
          ],
          Default: 'ProcessMinor',
        }),
      ).toThrow("Variable field is not supported in JSONata mode. Use 'Condition' field instead")
    })

    it('should evaluate Condition field with JSONata expression', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $states.input.isAdult = true %}',
            Next: 'ProcessAdult',
          },
        ],
        Default: 'ProcessMinor',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { isAdult: true, name: 'John' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      expect(result.nextState).toBe('ProcessAdult')
    })

    it('should evaluate complex JSONata Condition', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $states.input.age >= 18 and $states.input.value > 1000 %}',
            Next: 'PremiumAdult',
          },
          {
            Condition: '{% $states.input.age >= 18 %}',
            Next: 'StandardAdult',
          },
        ],
        Default: 'Minor',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Test premium adult
      let result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { age: 25, value: 1500 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('PremiumAdult')

      // Test standard adult
      result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { age: 20, value: 500 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('StandardAdult')

      // Test minor
      result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { age: 16, value: 2000 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('Minor')
    })

    it('should handle JSONata Condition that returns non-boolean', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        QueryLanguage: 'JSONata',
        Choices: [
          {
            Condition: '{% $states.input.name %}', // Returns string, not boolean
            Next: 'NextState',
          },
        ],
        Default: 'DefaultState',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { name: 'John' }, // Truthy string
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })

      // Non-empty string is truthy
      expect(result.nextState).toBe('NextState')
    })
  })

  describe('Complex comparison operators', () => {
    it('should evaluate And operator with all conditions true', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            And: [
              {
                Variable: '$.age',
                NumericGreaterThanEquals: 18,
              },
              {
                Variable: '$.hasLicense',
                BooleanEquals: true,
              },
              {
                Variable: '$.violations',
                NumericLessThan: 3,
              },
            ],
            Next: 'CanDrive',
          },
        ],
        Default: 'CannotDrive',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // All conditions true
      const result = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { age: 25, hasLicense: true, violations: 1 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result.nextState).toBe('CanDrive')

      // One condition false
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { age: 25, hasLicense: false, violations: 1 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('CannotDrive')
    })

    it('should evaluate Or operator with at least one condition true', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Or: [
              {
                Variable: '$.status',
                StringEquals: 'URGENT',
              },
              {
                Variable: '$.priority',
                NumericGreaterThan: 90,
              },
              {
                Variable: '$.vip',
                BooleanEquals: true,
              },
            ],
            Next: 'FastTrack',
          },
        ],
        Default: 'NormalProcess',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // First condition true
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { status: 'URGENT', priority: 50, vip: false },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('FastTrack')

      // All conditions false
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { status: 'NORMAL', priority: 50, vip: false },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('NormalProcess')
    })

    it('should evaluate Not operator correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Not: {
              Variable: '$.disabled',
              BooleanEquals: true,
            },
            Next: 'EnabledPath',
          },
        ],
        Default: 'DisabledPath',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Not true = false (disabled is true, so Not evaluates to false)
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { disabled: true },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('DisabledPath')

      // Not false = true
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { disabled: false },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('EnabledPath')
    })

    it('should evaluate nested And/Or/Not combinations', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            And: [
              {
                Or: [
                  {
                    Variable: '$.level',
                    StringEquals: 'GOLD',
                  },
                  {
                    Variable: '$.level',
                    StringEquals: 'PLATINUM',
                  },
                ],
              },
              {
                Not: {
                  Variable: '$.suspended',
                  BooleanEquals: true,
                },
              },
            ],
            Next: 'PremiumService',
          },
        ],
        Default: 'StandardService',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // GOLD and not suspended
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { level: 'GOLD', suspended: false },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('PremiumService')

      // GOLD but suspended
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { level: 'GOLD', suspended: true },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('StandardService')

      // SILVER and not suspended
      const result3 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { level: 'SILVER', suspended: false },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result3.nextState).toBe('StandardService')
    })
  })

  describe('Type checking operators', () => {
    it('should evaluate IsPresent correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.optionalField',
            IsPresent: true,
            Next: 'HasField',
          },
          {
            Variable: '$.optionalField',
            IsPresent: false,
            Next: 'NoField',
          },
        ],
        Default: 'DefaultPath',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Field exists with value
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { optionalField: 'exists', other: 'data' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('HasField')

      // Field exists with null
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { optionalField: null, other: 'data' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('HasField')

      // Field does not exist
      const result3 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { other: 'data' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result3.nextState).toBe('NoField')
    })

    it('should evaluate IsNull correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.field',
            IsNull: true,
            Next: 'NullPath',
          },
          {
            Variable: '$.field',
            IsNull: false,
            Next: 'NotNullPath',
          },
        ],
        Default: 'DefaultPath',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Field is null
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { field: null },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('NullPath')

      // Field has value
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { field: 'value' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('NotNullPath')

      // Field is undefined (missing) - should throw error
      await expect(
        executor.execute({
          executionPath: [],
          variables: {},
          originalInput: {},
          stateExecutions: [],
          currentState: 'ChoiceState',
          input: { other: 'data' },
          Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
        }),
      ).rejects.toThrow(
        "Invalid path '$.field': The choice state's condition path references an invalid value.",
      )
    })

    it('should evaluate type checking operators (IsBoolean, IsNumeric, IsString, IsTimestamp)', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.value',
            IsBoolean: true,
            Next: 'BooleanPath',
          },
          {
            Variable: '$.value',
            IsNumeric: true,
            Next: 'NumericPath',
          },
          {
            Variable: '$.value',
            IsTimestamp: true,
            Next: 'TimestampPath',
          },
          {
            Variable: '$.value',
            IsString: true,
            Next: 'StringPath',
          },
        ],
        Default: 'UnknownType',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Boolean value
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { value: true },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('BooleanPath')

      // Numeric value
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { value: 42.5 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('NumericPath')

      // String value
      const result3 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { value: 'hello' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result3.nextState).toBe('StringPath')

      // Timestamp value (IsTimestamp checks if it's a valid RFC3339 timestamp string)
      const result4 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { value: '2024-01-15T10:30:00Z' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result4.nextState).toBe('TimestampPath')

      // Object value (not matched by any primitive type check)
      const result5 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { value: { nested: 'object' } },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result5.nextState).toBe('UnknownType')
    })
  })

  describe('String pattern matching', () => {
    it('should evaluate StringMatches with wildcard patterns', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.email',
            StringMatches: '*@company.test',
            Next: 'InternalUser',
          },
          {
            Variable: '$.filename',
            StringMatches: '*.pdf',
            Next: 'PDFHandler',
          },
          {
            Variable: '$.code',
            StringMatches: 'ERR_*',
            Next: 'ErrorHandler',
          },
        ],
        Default: 'DefaultHandler',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Email matching
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { email: 'john.doe@company.test' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('InternalUser')

      // Filename matching - include all fields to avoid errors
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { email: 'user@example.com', filename: 'document.pdf', code: 'OK' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('PDFHandler')

      // Error code matching - include all fields to avoid errors
      const result3 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { email: 'user@example.com', filename: 'data.txt', code: 'ERR_NETWORK_TIMEOUT' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result3.nextState).toBe('ErrorHandler')

      // No match - include all fields to avoid errors
      const result4 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { email: 'user@example.com', filename: 'data.txt', code: 'SUCCESS' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result4.nextState).toBe('DefaultHandler')
    })
  })

  describe('Timestamp comparisons', () => {
    it('should evaluate timestamp comparisons correctly', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.timestamp',
            TimestampGreaterThan: '2024-01-01T00:00:00Z',
            Next: 'NewYear2024',
          },
          {
            Variable: '$.timestamp',
            TimestampLessThanEquals: '2023-12-31T23:59:59Z',
            Next: 'Before2024',
          },
        ],
        Default: 'UnknownTime',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // After 2024
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { timestamp: '2024-06-15T12:00:00Z' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('NewYear2024')

      // Before 2024
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { timestamp: '2023-10-15T12:00:00Z' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('Before2024')
    })
  })

  describe('Edge cases', () => {
    it('should throw error when accessing missing Variable path', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.deep.nested.path',
            StringEquals: 'value',
            Next: 'Found',
          },
        ],
        Default: 'NotFound',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Missing nested path should throw error
      await expect(
        executor.execute({
          executionPath: [],
          variables: {},
          originalInput: {},
          stateExecutions: [],
          currentState: 'ChoiceState',
          input: { other: 'data' },
          Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
        }),
      ).rejects.toThrow(
        "Invalid path '$.deep.nested.path': The choice state's condition path references an invalid value.",
      )
    })

    it('should throw error when accessing non-existent property without IsPresent check', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.nonExistentField',
            BooleanEquals: true,
            Next: 'TruePath',
          },
        ],
        Default: 'DefaultPath',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // 存在しないプロパティへのアクセスでエラーが発生することを確認
      await expect(
        executor.execute({
          executionPath: [],
          variables: {},
          originalInput: {},
          stateExecutions: [],
          currentState: 'ChoiceState',
          input: { existingField: 'value' },
          Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
        }),
      ).rejects.toThrow(
        "Invalid path '$.nonExistentField': The choice state's condition path references an invalid value.",
      )
    })

    it('should safely access non-existent property with IsPresent guard', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            And: [
              {
                Variable: '$.optionalField',
                IsPresent: true,
              },
              {
                Variable: '$.optionalField',
                BooleanEquals: true,
              },
            ],
            Next: 'OptionalFieldIsTrue',
          },
          {
            Variable: '$.optionalField',
            IsPresent: false,
            Next: 'OptionalFieldMissing',
          },
        ],
        Default: 'OptionalFieldIsFalse',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // フィールドが存在してtrueの場合
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { optionalField: true },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('OptionalFieldIsTrue')

      // フィールドが存在しない場合（エラーにならずに適切に処理される）
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { otherField: 'value' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('OptionalFieldMissing')

      // フィールドが存在してfalseの場合
      const result3 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { optionalField: false },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result3.nextState).toBe('OptionalFieldIsFalse')
    })

    it('should safely combine IsPresent with type checking operators', async () => {
      // isPresentと他の型チェックオペレータを組み合わせた安全なパターン
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            And: [
              {
                Variable: '$.data',
                IsPresent: true,
              },
              {
                Variable: '$.data',
                IsNumeric: true,
              },
              {
                Variable: '$.data',
                NumericGreaterThan: 100,
              },
            ],
            Next: 'LargeNumber',
          },
          {
            And: [
              {
                Variable: '$.data',
                IsPresent: true,
              },
              {
                Variable: '$.data',
                IsString: true,
              },
            ],
            Next: 'StringData',
          },
          {
            Variable: '$.data',
            IsPresent: false,
            Next: 'NoData',
          },
        ],
        Default: 'OtherData',
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // 大きな数値の場合
      const result1 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { data: 150 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result1.nextState).toBe('LargeNumber')

      // 文字列の場合
      const result2 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { data: 'test string' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result2.nextState).toBe('StringData')

      // フィールドが存在しない場合
      const result3 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { other: 'value' },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result3.nextState).toBe('NoData')

      // 小さな数値の場合
      const result4 = await executor.execute({
        executionPath: [],
        variables: {},
        originalInput: {},
        stateExecutions: [],
        currentState: 'ChoiceState',
        input: { data: 50 },
        Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
      })
      expect(result4.nextState).toBe('OtherData')
    })

    it('should throw error when Choice has no Default and no match', async () => {
      const state = StateFactory.createState({
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.value',
            NumericEquals: 100,
            Next: 'Match',
          },
        ],
      }) as ChoiceState

      const executor = new ChoiceStateExecutor(state)

      // Should throw error when no match and no default
      await expect(
        executor.execute({
          executionPath: [],
          variables: {},
          originalInput: {},
          stateExecutions: [],
          currentState: 'ChoiceState',
          input: { value: 50 },
          Execution: { Id: 'test', StartTime: new Date().toISOString() } as any,
        }),
      ).rejects.toThrow('No matching choice found and no default specified')
    })
  })
})
