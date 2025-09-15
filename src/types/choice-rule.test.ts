import { describe, expect, it } from 'vitest'
import type { JsonObject } from './asl'
import { JSONataChoiceRule, JSONPathChoiceRule } from './asl'

describe('JSONPathChoiceRule', () => {
  describe('constructor', () => {
    it('基本的なプロパティを初期化できる', () => {
      const data = {
        Variable: '$.status',
        StringEquals: 'SUCCESS',
        Next: 'SuccessState',
      }

      const rule = JSONPathChoiceRule.fromJsonValue(data)

      expect(rule.Variable).toBe('$.status')
      expect(rule.StringEquals).toBe('SUCCESS')
      expect(rule.Next).toBe('SuccessState')
    })

    it('And条件を再帰的にインスタンス化する', () => {
      const data = {
        And: [
          { Variable: '$.status', StringEquals: 'ACTIVE' },
          { Variable: '$.count', NumericGreaterThan: 0 },
        ],
        Next: 'ProcessState',
      } as JsonObject

      const rule = JSONPathChoiceRule.fromJsonValue(data)

      expect(rule.And).toHaveLength(2)
      expect(rule.And?.[0]).toBeInstanceOf(JSONPathChoiceRule)
      expect(rule.And?.[0].Variable).toBe('$.status')
      expect(rule.And?.[1]).toBeInstanceOf(JSONPathChoiceRule)
      expect(rule.And?.[1].Variable).toBe('$.count')
    })

    it('Or条件を再帰的にインスタンス化する', () => {
      const data = {
        Or: [
          { Variable: '$.status', StringEquals: 'SUCCESS' },
          { Variable: '$.status', StringEquals: 'COMPLETE' },
        ],
      }

      const rule = JSONPathChoiceRule.fromJsonValue(data)

      expect(rule.Or).toHaveLength(2)
      expect(rule.Or?.[0]).toBeInstanceOf(JSONPathChoiceRule)
      expect(rule.Or?.[1]).toBeInstanceOf(JSONPathChoiceRule)
    })

    it('Not条件を再帰的にインスタンス化する', () => {
      const data = {
        Not: { Variable: '$.error', IsPresent: true },
      }

      const rule = JSONPathChoiceRule.fromJsonValue(data)

      expect(rule.Not).toBeInstanceOf(JSONPathChoiceRule)
      expect(rule.Not?.Variable).toBe('$.error')
      expect(rule.Not?.IsPresent).toBe(true)
    })
  })

  describe('型判定メソッド', () => {
    it('isJSONPath()はtrueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({ Variable: '$.test' })
      expect(rule.isJSONPath()).toBe(true)
    })

    it('isJSONata()はfalseを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({ Variable: '$.test' })
      expect(rule.isJSONata()).toBe(false)
    })
  })

  describe('evaluate', () => {
    it('StringEqualsで一致する場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.status',
        StringEquals: 'SUCCESS',
      })

      const input = { status: 'SUCCESS' }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('StringEqualsで一致しない場合falseを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.status',
        StringEquals: 'SUCCESS',
      })

      const input = { status: 'FAILED' }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(false)
    })

    it('NumericGreaterThanで条件を満たす場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.count',
        NumericGreaterThan: 5,
      })

      const input = { count: 10 }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('And条件がすべて満たされる場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        And: [
          { Variable: '$.status', StringEquals: 'ACTIVE' },
          { Variable: '$.count', NumericGreaterThan: 0 },
        ],
      })

      const input = { status: 'ACTIVE', count: 5 }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('And条件の一つでも満たされない場合falseを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        And: [
          { Variable: '$.status', StringEquals: 'ACTIVE' },
          { Variable: '$.count', NumericGreaterThan: 0 },
        ],
      })

      const input = { status: 'INACTIVE', count: 5 }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(false)
    })

    it('Or条件の一つでも満たされる場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Or: [
          { Variable: '$.status', StringEquals: 'SUCCESS' },
          { Variable: '$.status', StringEquals: 'COMPLETE' },
        ],
      })

      const input = { status: 'COMPLETE' }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('Not条件が満たされない場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Not: { Variable: '$.error', IsPresent: true },
      })

      const input = { result: 'success' } // errorフィールドなし
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('IsPresentがtrueで値が存在する場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.data',
        IsPresent: true,
      })

      const input = { data: 'exists' }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('IsPresentがfalseで値が存在しない場合trueを返す', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.missing',
        IsPresent: false,
      })

      const input = { data: 'exists' }
      const context = {} as any

      expect(rule.evaluate(input, context)).toBe(true)
    })

    it('存在しないパスを参照した場合エラーをスロー（IsPresent以外）', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.missing',
        StringEquals: 'value',
      })

      const input = { data: 'exists' }
      const context = {} as any

      expect(() => rule.evaluate(input, context)).toThrow(
        "Invalid path '$.missing': The choice state's condition path references an invalid value.",
      )
    })

    it('StringMatchesでワイルドカードパターンマッチングが動作する', () => {
      const rule1 = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.email',
        StringMatches: '*@example.com',
      })

      const rule2 = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.filename',
        StringMatches: '*.pdf',
      })

      const context = {} as any

      expect(rule1.evaluate({ email: 'user@example.com' }, context)).toBe(true)
      expect(rule1.evaluate({ email: 'user@other.com' }, context)).toBe(false)
      expect(rule2.evaluate({ filename: 'document.pdf' }, context)).toBe(true)
      expect(rule2.evaluate({ filename: 'document.txt' }, context)).toBe(false)
    })

    it('Timestamp比較が動作する', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.timestamp',
        TimestampGreaterThan: '2024-01-01T00:00:00Z',
      })

      const context = {} as any

      expect(rule.evaluate({ timestamp: '2024-06-15T12:00:00Z' }, context)).toBe(true)
      expect(rule.evaluate({ timestamp: '2023-12-31T23:59:59Z' }, context)).toBe(false)
    })

    it('IsTimestamp型チェックが動作する', () => {
      const rule = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.value',
        IsTimestamp: true,
      })

      const context = {} as any

      expect(rule.evaluate({ value: '2024-01-01T00:00:00Z' }, context)).toBe(true)
      expect(rule.evaluate({ value: 'not-a-timestamp' }, context)).toBe(false)
      expect(rule.evaluate({ value: 123 }, context)).toBe(false)
    })

    it('Path比較演算子が動作する', () => {
      const rule1 = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.value1',
        StringEqualsPath: '$.value2',
      })

      const rule2 = JSONPathChoiceRule.fromJsonValue({
        Variable: '$.num1',
        NumericGreaterThanPath: '$.num2',
      })

      const context = {} as any

      expect(rule1.evaluate({ value1: 'same', value2: 'same' }, context)).toBe(true)
      expect(rule1.evaluate({ value1: 'different', value2: 'other' }, context)).toBe(false)
      expect(rule2.evaluate({ num1: 10, num2: 5 }, context)).toBe(true)
      expect(rule2.evaluate({ num1: 3, num2: 7 }, context)).toBe(false)
    })
  })
})

describe('JSONataChoiceRule', () => {
  describe('constructor', () => {
    it('プロパティを初期化できる', () => {
      const data = {
        Condition: '{% $states.input.status = "SUCCESS" %}',
        Next: 'SuccessState',
      }

      const rule = JSONataChoiceRule.fromJsonValue(data)

      expect(rule.Condition).toBe('{% $states.input.status = "SUCCESS" %}')
      expect(rule.Next).toBe('SuccessState')
    })
  })

  describe('型判定メソッド', () => {
    it('isJSONPath()はfalseを返す', () => {
      const rule = JSONataChoiceRule.fromJsonValue({ Condition: '{% true %}', Next: 'NextState' })
      expect(rule.isJSONPath()).toBe(false)
    })

    it('isJSONata()はtrueを返す', () => {
      const rule = JSONataChoiceRule.fromJsonValue({ Condition: '{% true %}', Next: 'NextState' })
      expect(rule.isJSONata()).toBe(true)
    })
  })

  describe('evaluate', () => {
    it('条件がtrueの場合trueを返す', async () => {
      const rule = JSONataChoiceRule.fromJsonValue({
        Condition: '{% $states.input.status = "SUCCESS" %}',
        Next: 'SuccessState',
      })

      const input = { status: 'SUCCESS' }
      const context = {} as any

      const result = await rule.evaluate(input, context)
      expect(result).toBe(true)
    })

    it('条件がfalseの場合falseを返す', async () => {
      const rule = JSONataChoiceRule.fromJsonValue({
        Condition: '{% $states.input.status = "SUCCESS" %}',
        Next: 'SuccessState',
      })

      const input = { status: 'FAILED' }
      const context = {} as any

      const result = await rule.evaluate(input, context)
      expect(result).toBe(false)
    })

    it('{% %}がない場合はバリデーションエラーになる', () => {
      expect(() => {
        JSONataChoiceRule.fromJsonValue({
          Condition: 'true', // {% %}なしはエラー
          Next: 'NextState',
        })
      }).toThrow('JSONata Condition must be wrapped with {% and %} brackets')
    })

    it('{% %}がない$states式もバリデーションエラーになる', () => {
      expect(() => {
        JSONataChoiceRule.fromJsonValue({
          Condition: '$states.input.status = "SUCCESS"', // {% %}なしはエラー
          Next: 'NextState',
        })
      }).toThrow('JSONata Condition must be wrapped with {% and %} brackets')
    })

    it('文字列リテラルはJavaScriptではtrueに変換される', async () => {
      const rule = JSONataChoiceRule.fromJsonValue({
        Condition: '{% "static string" %}', // 文字列リテラル
        Next: 'NextState',
      })

      const input = { any: 'data' }
      const context = {} as any

      // JavaScript の Boolean() で文字列は真になる
      // 注: AWS Step Functionsでは型エラーになるが、このツールではJavaScriptの挙動に従う
      const result = await rule.evaluate(input, context)
      expect(result).toBe(true)
    })

    it('{% %}で囲まれた式は正しく評価される', async () => {
      const rule = JSONataChoiceRule.fromJsonValue({
        Condition: '{% $states.input.value > 10 %}',
        Next: 'NextState',
      })

      const input = { value: 15 }
      const context = {} as any

      const result = await rule.evaluate(input, context)
      expect(result).toBe(true)
    })

    // Conditionは必須フィールドなので、このテストケースは削除
    // AWS仕様上、Conditionは必須
  })
})
