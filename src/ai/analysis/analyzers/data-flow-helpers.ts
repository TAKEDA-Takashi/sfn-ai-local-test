import type { JsonArray, JsonObject, JsonValue } from '../../../types/asl'
import type { InputRequirement } from '../data-flow-analyzer'

export class DataFlowHelpers {
  /**
   * ASL内のJSONata式から変数参照を抽出
   */
  static extractVariableReferences(expression: string): string[] {
    const references: string[] = []

    // $states.result.Payload.field パターンを先に検出（より具体的）
    const statesPattern = /\$states\.(result|input)\.([a-zA-Z0-9_.]+)/g
    let match: RegExpExecArray | null

    match = statesPattern.exec(expression)
    while (match !== null) {
      references.push(`$states.${match[1]}.${match[2]}`)
      match = statesPattern.exec(expression)
    }

    // $variableName パターンを検出（$statesは除外）
    const variablePattern = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g
    match = variablePattern.exec(expression)
    while (match !== null) {
      const varName = `$${match[1]}`
      // $statesで始まるものは既に処理済みなのでスキップ
      if (!varName.startsWith('$states')) {
        references.push(varName)
      }
      match = variablePattern.exec(expression)
    }

    return references
  }

  /**
   * Extract field name from JSONPath expression
   */
  static extractFieldFromPath(path: string): string | null {
    if (!path?.startsWith('$')) return null

    // Handle paths like $.field, $.field.subfield, $[0], etc.
    const match = path.match(/^\$\.?([a-zA-Z_][a-zA-Z0-9_]*)/)
    return match?.[1] ?? null
  }

  /**
   * Generate sample value based on field name
   */
  static generateSampleValue(field: string): JsonValue {
    // Common field patterns
    const lowerField = field.toLowerCase()

    // Check more specific patterns first
    if (lowerField.includes('email')) {
      return 'user@example.com'
    }
    if (lowerField.includes('bucket')) {
      return 'my-bucket'
    }
    if (lowerField.includes('key') || lowerField.includes('path')) {
      return `data/${field}.json`
    }
    if (lowerField.includes('id')) {
      return `${field}-001`
    }
    if (lowerField.includes('name')) {
      return `Sample ${field}`
    }
    if (
      lowerField.includes('count') ||
      lowerField.includes('amount') ||
      lowerField.includes('size') ||
      lowerField.includes('total') ||
      lowerField.includes('price') ||
      lowerField.includes('cost') ||
      lowerField.includes('value') ||
      lowerField.includes('quantity') ||
      lowerField.includes('qty')
    ) {
      return 100
    }
    if (lowerField.includes('status') || lowerField.includes('state')) {
      return 'active'
    }
    if (
      lowerField.includes('flag') ||
      lowerField.includes('enabled') ||
      lowerField.includes('is') ||
      lowerField.includes('processed') ||
      lowerField.includes('active') ||
      lowerField.includes('valid') ||
      lowerField.endsWith('ed') // past tense often indicates boolean
    ) {
      return true
    }
    if (lowerField.includes('date') || lowerField.includes('time')) {
      return new Date().toISOString()
    }

    // Default
    return `${field}-value`
  }

  /**
   * Create nested sample object from dot-notation path
   */
  static createNestedSampleObject(fieldPath: string): JsonObject {
    const parts = fieldPath.split('.')
    const obj: JsonObject = {}
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part) {
        current[part] = {}
        current = current[part] as JsonObject
      }
    }

    // Set the final property
    const lastPart = parts[parts.length - 1]
    if (lastPart) {
      current[lastPart] = DataFlowHelpers.generateSampleValue(lastPart)
    }

    return obj
  }

  /**
   * Remove duplicate requirements
   */
  static deduplicateRequirements(requirements: InputRequirement[]): InputRequirement[] {
    const seen = new Map<string, InputRequirement>()

    for (const req of requirements) {
      const existing = seen.get(req.field)
      if (!existing || (req.type !== 'any' && existing.type === 'any')) {
        // Prefer more specific type over 'any'
        seen.set(req.field, req)
      } else if (existing && req.example && !existing.example) {
        // Prefer requirement with example
        seen.set(req.field, { ...existing, example: req.example })
      }
    }

    return Array.from(seen.values())
  }

  /**
   * Helper method to extract fields from regex pattern
   */
  static extractFieldsFromPattern(
    pattern: RegExp,
    expression: string,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    description: string,
  ): void {
    let match: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: RegEx exec() requires assignment in loop condition
    while ((match = pattern.exec(expression)) !== null) {
      const fieldPath = match[1]
      if (!fieldPath) continue

      const topLevelField = fieldPath.split('.')[0]

      if (topLevelField) {
        requirements.push({
          field: topLevelField,
          type: 'any',
          required: true,
          description: `Referenced in ${description}`,
        })

        if (!sampleInput[topLevelField]) {
          if (fieldPath.includes('.')) {
            sampleInput[topLevelField] = DataFlowHelpers.createNestedSampleObject(fieldPath)
          } else {
            sampleInput[topLevelField] = DataFlowHelpers.generateSampleValue(topLevelField)
          }
        }
      }
    }
  }

  /**
   * フィールド名が配列を示唆するかを判定
   */
  static isLikelyArrayField(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase()
    return (
      lowerField.includes('accounts') ||
      lowerField.includes('items') ||
      lowerField.includes('list') ||
      lowerField.includes('array') ||
      lowerField.endsWith('s') || // 複数形
      lowerField.includes('targets') ||
      lowerField.includes('entries')
    )
  }

  /**
   * フィールドタイプに応じたサンプル値を生成
   */
  static generateSampleValueForFieldType(fieldName: string, fieldType: string): JsonValue {
    switch (fieldType) {
      case 'string':
        return DataFlowHelpers.generateSampleStringValue(fieldName)
      case 'number':
        return DataFlowHelpers.generateSampleNumberValue(fieldName)
      case 'boolean':
        return DataFlowHelpers.generateSampleBooleanValue(fieldName)
      case 'array':
        return DataFlowHelpers.generateSampleArrayValue(fieldName)
      case 'object':
        return { [fieldName]: 'value' }
      default:
        return DataFlowHelpers.generateSampleValue(fieldName)
    }
  }

  /**
   * フィールド名に基づいた文字列サンプル値生成
   */
  static generateSampleStringValue(fieldName: string): string {
    const lowerField = fieldName.toLowerCase()

    if (lowerField.includes('month')) {
      return '2025-01'
    }
    if (lowerField.includes('account') && lowerField.includes('id')) {
      return '123456789012'
    }
    if (lowerField.includes('bucket')) {
      return 'sample-bucket'
    }
    if (lowerField.includes('email')) {
      return 'user@example.com'
    }

    return `sample-${fieldName}`
  }

  /**
   * フィールド名に基づいた数値サンプル値生成
   */
  static generateSampleNumberValue(fieldName: string): number {
    const lowerField = fieldName.toLowerCase()

    if (lowerField.includes('count') || lowerField.includes('size')) {
      return 1
    }
    if (lowerField.includes('year')) {
      return 2025
    }
    if (lowerField.includes('amount') || lowerField.includes('total')) {
      return 100
    }

    return 42
  }

  /**
   * フィールド名に基づいたブール値サンプル値生成
   */
  static generateSampleBooleanValue(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase()

    if (lowerField.includes('notify') || lowerField.includes('enabled')) {
      return true
    }
    if (lowerField.includes('skip') || lowerField.includes('disabled')) {
      return false
    }

    return true
  }

  /**
   * フィールド名に基づいた配列サンプル値生成
   */
  static generateSampleArrayValue(fieldName: string): JsonArray {
    const lowerField = fieldName.toLowerCase()

    if (lowerField.includes('accounts')) {
      return ['123456789012', '234567890123']
    }
    if (lowerField.includes('items') || lowerField.includes('list')) {
      return ['item1', 'item2', 'item3']
    }

    return [`${fieldName}-1`, `${fieldName}-2`]
  }
}
