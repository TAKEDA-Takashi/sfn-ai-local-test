/**
 * Analyzes ItemReader configuration in DistributedMap states
 */

import type {
  ItemProcessor,
  JsonObject,
  JsonValue,
  MapState,
  State,
  StateMachine,
} from '../../types/asl'
// DataFlowAnalyzer is available for future use if needed
// import { DataFlowAnalyzer } from '../analysis/data-flow-analyzer'
import { findStates, StateFilters } from './state-traversal'

export interface ItemReaderInfo {
  stateName: string
  resource: string
  format: 'json' | 'csv' | 'jsonl' | 's3objects' | 'manifest'
  hasItemReader: boolean
  estimatedItemCount?: number
}

/**
 * Detects DistributedMap states with ItemReader and analyzes their data format
 */
export function analyzeItemReaders(stateMachine: StateMachine): ItemReaderInfo[] {
  return findStates(stateMachine, StateFilters.hasItemReader).map(({ name, state }) => {
    // StateFilters.hasItemReaderが通っているので、state.isMap()は必ずtrue
    const itemReader = state.isDistributedMap() ? state.ItemReader : undefined
    if (!itemReader) {
      // If no itemReader, return default info
      return {
        stateName: name,
        format: 'json' as ItemReaderInfo['format'],
        estimatedItemCount: 10,
        resource: '',
        hasItemReader: false,
      }
    }

    const resource = itemReader.Resource as string

    // Determine format based on resource type
    let format: ItemReaderInfo['format'] = 'json'
    let estimatedItemCount = 10 // Default estimate

    if (resource?.includes('s3:listObjectsV2')) {
      format = 's3objects'
      estimatedItemCount = 20 // S3 listings typically have more items
    } else if (resource?.includes('s3:getObject')) {
      const readerConfig = itemReader.ReaderConfig
      const inputType = readerConfig?.InputType as string

      if (inputType === 'CSV') {
        format = 'csv'
        estimatedItemCount = 50 // CSV files often have many rows
      } else if (inputType === 'JSONL') {
        format = 'jsonl'
        estimatedItemCount = 30
      } else if (inputType === 'MANIFEST') {
        format = 'manifest'
        estimatedItemCount = 100 // S3 inventory manifest can have many items
      } else {
        // Fallback: detect format from Arguments.Key extension (for JSONata mode)
        const hasArguments = 'Arguments' in itemReader && itemReader.Arguments
        const args = hasArguments ? (itemReader.Arguments as JsonObject) : undefined
        const key = args?.Key as string

        if (key) {
          if (key.includes('.jsonl') || key.endsWith('.jsonl')) {
            format = 'jsonl'
            estimatedItemCount = 30
          } else if (key.includes('.csv') || key.endsWith('.csv')) {
            format = 'csv'
            estimatedItemCount = 50
          } else if (key.includes('.json') || key.endsWith('.json')) {
            format = 'json'
            estimatedItemCount = 10
          } else {
            format = 'json'
          }
        } else {
          format = 'json'
        }
      }
    }

    return {
      stateName: name,
      resource,
      format,
      hasItemReader: true,
      estimatedItemCount,
    }
  })
}

/**
 * Generates sample data based on ItemReader format only (for testing/basic use)
 */
export function generateBasicSampleData(
  format: ItemReaderInfo['format'],
  itemCount: number = 10,
): string {
  // Generate generic sample data without ItemProcessor analysis
  return generateSampleDataInternal(format, itemCount, null)
}

/**
 * Generates sample data with ItemProcessor requirements analysis (production use)
 */
export function generateSampleData(
  format: ItemReaderInfo['format'],
  itemCount: number,
  mapState?: MapState,
): string {
  if (!mapState) {
    return generateBasicSampleData(format, itemCount)
  }

  // MapState単体でItemProcessor分析を実行
  const sampleInput = analyzeMapStateItemProcessor(mapState)

  return generateSampleDataInternal(format, itemCount, sampleInput)
}

/**
 * Analyze ItemProcessor to find what fields are used from a specific input field
 */
function analyzeItemProcessorFieldUsage(
  processor: ItemProcessor,
  fieldName: string,
): JsonObject | null {
  const requiredFields: JsonObject = {}

  // Convert processor to object for analysis
  const processorObj = processor as { States?: Record<string, State> }
  if (!processorObj.States) {
    return null
  }

  // Search for field references in both JSONata and JSONPath formats
  // JSONata: $states.input.fieldName.subField
  // JSONPath: $.fieldName.subField (when fieldName is "value")
  const jsonataPattern = new RegExp(`\\$states\\.input\\.${fieldName}\\.([\\w.]+)`, 'g')
  const jsonpathPattern = new RegExp(`\\$\\.${fieldName}\\.([\\w.]+)`, 'g')
  const jsonString = JSON.stringify(processorObj.States)

  // Debug logging
  // console.log('Processing field:', fieldName)
  // console.log('JSON string:', jsonString)

  let match: RegExpExecArray | null = null
  const foundFields = new Set<string>()

  // Track nested field paths (support deep nesting)
  const fieldPaths = new Set<string>()

  // Check for JSONata format references
  let jsonataMatch = jsonataPattern.exec(jsonString)
  while (jsonataMatch !== null) {
    match = jsonataMatch
    if (match[1]) {
      // Extract nested field paths like "id" or "addresses.PRIMARY_EMAIL"
      const fieldPath = match[1].split('.')
      const topLevelField = fieldPath[0]

      if (topLevelField) {
        if (fieldPath.length > 1) {
          // This is a nested field - store the full path
          fieldPaths.add(match[1])
        } else {
          // Simple field
          foundFields.add(topLevelField)
        }
      }
    }
    jsonataMatch = jsonataPattern.exec(jsonString)
  }

  // Also check for JSONPath format references
  let jsonpathMatch = jsonpathPattern.exec(jsonString)
  while (jsonpathMatch !== null) {
    match = jsonpathMatch
    if (match[1]) {
      const fieldPath = match[1].split('.')
      const topLevelField = fieldPath[0]

      if (topLevelField) {
        if (fieldPath.length > 1) {
          // This is a nested field - store the full path
          fieldPaths.add(match[1])
        } else {
          // Simple field
          foundFields.add(topLevelField)
        }
      }
    }
    jsonpathMatch = jsonpathPattern.exec(jsonString)
  }

  // Generate sample data for simple fields
  for (const field of foundFields) {
    requiredFields[field] = generateSampleValueForField(field)
  }

  // Build nested structure from field paths
  buildNestedStructure(requiredFields, fieldPaths, fieldName, jsonString)

  return Object.keys(requiredFields).length > 0 ? requiredFields : null
}

/**
 * Build nested object structure from dot-notation field paths
 */
function buildNestedStructure(
  target: JsonObject,
  fieldPaths: Set<string>,
  fieldName: string,
  jsonString: string,
): void {
  for (const fieldPath of fieldPaths) {
    const parts = fieldPath.split('.')
    let current = target

    // Build nested structure, creating objects as needed
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      if (i === parts.length - 1) {
        // Last part - generate value with context awareness
        const fullPath = `${fieldName}\\.${fieldPath.replace(/\./g, '\\.')}`
        current[part] = generateSampleValueForField(part, {
          fullPath,
          jsonString,
        })
      } else {
        // Intermediate part - ensure it's an object
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {}
        }
        current = current[part] as JsonObject
      }
    }
  }
}

/**
 * Build nested structure from a single field path (for ItemSelector direct references)
 */
function buildNestedStructureFromPath(target: JsonObject, fieldPath: string): void {
  const parts = fieldPath.split('.')
  let current = target

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    if (i === parts.length - 1) {
      // Last part - generate value
      current[part] = generateSampleValueForField(part)
    } else {
      // Intermediate part - ensure it's an object
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {}
      }
      current = current[part] as JsonObject
    }
  }
}

/**
 * Merge two nested structures, preserving existing values
 */
function mergeNestedStructures(target: JsonObject, source: JsonObject): void {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Nested object
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      mergeNestedStructures(target[key] as JsonObject, value)
    } else {
      // Primitive value - only set if not already exists
      if (!(key in target)) {
        target[key] = value
      }
    }
  }
}

/**
 * Check if a field path is used in a specific context (email, date, etc.)
 */
function checkUsageContext(
  fullPath?: string,
  jsonString?: string,
  contextKeywords: string[] = [],
): boolean {
  if (!(fullPath && jsonString) || contextKeywords.length === 0) {
    return false
  }

  const fieldUsagePattern = new RegExp(
    `\\\\"([^"]*)\\\\":\\s*[^,}]*\\$states\\.input\\.${fullPath.replace(/\\\\/g, '')}`,
    'g',
  )

  let fieldUsageMatch: RegExpExecArray | null = fieldUsagePattern.exec(jsonString)
  while (fieldUsageMatch !== null) {
    const match = fieldUsageMatch
    if (match[1]) {
      const targetField = match[1].toLowerCase()
      for (const keyword of contextKeywords) {
        if (targetField.includes(keyword) || targetField === keyword) {
          return true
        }
      }
    }
    fieldUsageMatch = fieldUsagePattern.exec(jsonString)
  }
  return false
}

/**
 * MapState単体でItemProcessor分析を行う
 */
function analyzeMapStateItemProcessor(mapState: MapState): JsonObject | null {
  if (!(mapState.isMap() && mapState.ItemProcessor)) {
    return null
  }

  const processor = mapState.ItemProcessor
  const sampleInput: JsonObject = {}

  const mapIsJSONata = mapState.isJSONataState()

  if ('ItemSelector' in mapState && mapState.ItemSelector) {
    // ItemSelectorがある場合、ItemReaderから必要なフィールドを抽出
    const itemSelector = mapState.ItemSelector

    if (mapIsJSONata) {
      // JSONataモード: ItemSelectorから参照されているフィールドを収集
      // まずすべてのItemSelectorフィールドを処理して、ItemReaderの基本構造を構築
      for (const [selectorKey, value] of Object.entries(itemSelector)) {
        if (typeof value === 'string' && value.includes('$states.context.Map.Item.Value')) {
          // Handle JSONata expression format: {% $states.context.Map.Item.Value.fieldName %}
          const cleanValue = value
            .replace(/^{%\s*/, '')
            .replace(/\s*%}$/, '')
            .trim()
          const match = cleanValue.match(/\$states\.context\.Map\.Item\.Value(?:\.(.+))?/)
          if (match) {
            const fieldPath = match[1] // undefined for entire object, field path for specific fields

            if (!fieldPath) {
              // Entire object reference: $states.context.Map.Item.Value
              // Analyze ItemProcessor to find what fields are actually used from this selector key
              const requiredFields = analyzeItemProcessorFieldUsage(processor, selectorKey)
              if (requiredFields && Object.keys(requiredFields).length > 0) {
                // Merge fields into sampleInput
                mergeNestedStructures(sampleInput, requiredFields)
              } else {
                // Default: generate sample fields commonly found in data processing
                const defaultFields = {
                  id: generateSampleValueForField('id'),
                  name: generateSampleValueForField('name'),
                  groupName: generateSampleValueForField('groupName'),
                  lang: generateSampleValueForField('lang'),
                  addresses: generateSampleValueForField('addresses'),
                }
                mergeNestedStructures(sampleInput, defaultFields)
              }
            } else {
              // Specific field reference: $states.context.Map.Item.Value.nest1.id
              buildNestedStructureFromPath(sampleInput, fieldPath)
            }
          }
        }
        // Note: We don't add fields that don't reference Map.Item.Value as they're not from ItemReader
      }
    } else {
      // JSONPathモード: ItemSelectorから参照されているフィールドを収集
      for (const [rawKey, value] of Object.entries(itemSelector)) {
        // Remove .$ suffix from key for JSONPath mode
        const key = rawKey.endsWith('.$') ? rawKey.slice(0, -2) : rawKey

        if (typeof value === 'string' && value.includes('$$.Map.Item.Value')) {
          // Special case: If the expression is exactly $$.Map.Item.Value (entire object)
          if (value === '$$.Map.Item.Value' || value === '$$.Map.Item.Value.$') {
            // Analyze ItemProcessor to find what fields are actually used
            const requiredFields = analyzeItemProcessorFieldUsage(processor, key)
            if (requiredFields && Object.keys(requiredFields).length > 0) {
              // Add required fields directly to sampleInput (not nested)
              Object.assign(sampleInput, requiredFields)
            } else {
              // Default: generate sample fields commonly found in data processing
              // The actual values will be determined by generateSampleValueForField
              Object.assign(sampleInput, {
                id: generateSampleValueForField('id'),
                name: generateSampleValueForField('name'),
                groupName: generateSampleValueForField('groupName'),
                lang: generateSampleValueForField('lang'),
                addresses: generateSampleValueForField('addresses'),
              })
            }
          } else {
            // $$.Map.Item.Value.fieldName -> add fieldName to ItemReader data
            const match = value.match(/\$\$\.Map\.Item\.Value\.(.+)/)
            if (match?.[1]) {
              const fieldPath = match[1]
              // Build nested structure in sampleInput
              buildNestedStructureFromPath(sampleInput, fieldPath)
            }
          }
        }
        // Note: We don't add fields that don't reference Map.Item.Value as they're not from ItemReader
      }
    }
  }

  // ItemProcessorの内部ステートを分析して必要なフィールドを追加
  extractFieldsFromItemProcessor(processor, sampleInput, mapIsJSONata)

  return Object.keys(sampleInput).length > 0 ? sampleInput : null
}

/**
 * ItemProcessor内のステートからフィールド要件を抽出
 */
function extractFieldsFromItemProcessor(
  processor: ItemProcessor,
  sampleInput: JsonObject,
  isJSONata: boolean,
): void {
  if (!processor.States) return

  for (const [, rawState] of Object.entries(processor.States)) {
    // StateFactoryで作成されたStateインスタンスを想定
    const state = rawState as State

    // ガード関数を使用してChoice状態を判定
    if (state.isChoice()) {
      const choiceState = state as State & {
        Choices: Array<{
          Variable?: string
          StringEquals?: JsonValue
          NumericGreaterThan?: number
          BooleanEquals?: boolean
        }>
      }
      // Choice条件から必要フィールドを抽出
      if ('Choices' in choiceState) {
        for (const choice of choiceState.Choices) {
          if (choice.Variable) {
            const fieldName = extractFieldFromPath(choice.Variable)
            if (fieldName && !sampleInput[fieldName]) {
              if (choice.StringEquals !== undefined) {
                sampleInput[fieldName] = choice.StringEquals
              } else if (choice.NumericGreaterThan !== undefined) {
                sampleInput[fieldName] = choice.NumericGreaterThan + 1
              } else if (choice.BooleanEquals !== undefined) {
                sampleInput[fieldName] = choice.BooleanEquals
              } else {
                sampleInput[fieldName] = generateSampleValueForField(fieldName)
              }
            }
          }
        }
      }
    } else if (state.isTask()) {
      const taskState = state as State & { Parameters?: JsonValue }
      // Task Parameters から必要フィールドを抽出
      if ('Parameters' in taskState && taskState.Parameters) {
        extractFieldsFromParameters(taskState.Parameters, sampleInput, isJSONata)
      }
    }
  }
}

/**
 * Parameters オブジェクトからフィールド参照を抽出
 */
function extractFieldsFromParameters(
  params: JsonValue,
  sampleInput: JsonObject,
  isJSONata: boolean,
): void {
  if (!params || typeof params !== 'object') return

  for (const [, value] of Object.entries(params as JsonObject)) {
    if (typeof value === 'string') {
      const fieldName = extractFieldFromPath(value)
      if (fieldName && !sampleInput[fieldName]) {
        sampleInput[fieldName] = generateSampleValueForField(fieldName)
      }
    } else if (typeof value === 'object') {
      extractFieldsFromParameters(value, sampleInput, isJSONata)
    }
  }
}

/**
 * JSONPath式からフィールド名を抽出
 */
function extractFieldFromPath(path: string): string | null {
  if (!path?.startsWith('$')) return null

  // Handle paths like $.field, $.field.subfield, $[0], etc.
  const match = path.match(/^\$\.?([a-zA-Z_][a-zA-Z0-9_]*)/)
  return match?.[1] ?? null
}

/**
 * フィールド名に基づいてサンプル値を生成
 * 汎用的なパターンマッチングで適切なデータ型を推論
 */
function generateSampleValueForField(
  fieldName: string,
  context?: {
    fullPath?: string
    jsonString?: string
  },
): JsonValue {
  const lowerField = fieldName.toLowerCase()

  // Email patterns - check both field name and usage context
  const isEmailField =
    lowerField.includes('email') ||
    (lowerField.includes('mail') && !lowerField.includes('mailing')) ||
    checkUsageContext(context?.fullPath, context?.jsonString, ['email', 'mail', 'to', 'cc', 'from'])

  if (isEmailField) {
    return `user${Math.floor(Math.random() * 1000) + 1}@example.com`
  }

  // Date/time patterns - only for clear date/time fields
  if (lowerField.endsWith('_at') || lowerField.endsWith('_date') || lowerField.endsWith('_time')) {
    const date = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
    return date.toISOString()
  }

  // Month patterns - only exact matches
  if (lowerField.endsWith('_month') || lowerField === 'month') {
    const year = 2024
    const month = Math.floor(Math.random() * 12) + 1
    return `${year}-${String(month).padStart(2, '0')}`
  }

  // Boolean patterns
  if (
    lowerField.startsWith('is_') ||
    lowerField.startsWith('has_') ||
    lowerField.startsWith('enable_') ||
    lowerField.startsWith('should_') ||
    lowerField.includes('_enabled') ||
    lowerField.includes('_active') ||
    lowerField.includes('flag') ||
    lowerField === 'processed'
  ) {
    return Math.random() > 0.5
  }

  // Count/number patterns
  if (
    lowerField.includes('_count') ||
    lowerField.includes('_number') ||
    lowerField.startsWith('num_') ||
    (lowerField.startsWith('total_') && !lowerField.includes('amount'))
  ) {
    return Math.floor(Math.random() * 100) + 1
  }

  // Amount/price patterns (likely monetary)
  if (
    lowerField.includes('amount') ||
    lowerField.includes('price') ||
    lowerField.includes('cost') ||
    lowerField.includes('fee') ||
    lowerField.includes('payment')
  ) {
    return Math.floor(Math.random() * 10000) + 100
  }

  // URL patterns
  if (
    lowerField.includes('_url') ||
    lowerField.includes('_link') ||
    lowerField.includes('website')
  ) {
    return `https://example.com/${fieldName.toLowerCase()}`
  }

  // Name patterns - simple string generation
  if (lowerField.includes('name')) {
    return `${fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()} ${Math.floor(Math.random() * 100) + 1}`
  }

  // Status/state patterns
  if (lowerField.includes('status') || lowerField.includes('state')) {
    const options = ['active', 'pending', 'inactive', 'processing', 'completed']
    return options[Math.floor(Math.random() * options.length)] ?? 'pending'
  }

  // Priority patterns
  if (lowerField.includes('priority')) {
    return Math.floor(Math.random() * 5) + 1 // 1-5 priority levels
  }

  // ID patterns (generic - could be any format)
  if (
    lowerField.endsWith('_id') ||
    lowerField === 'id' ||
    (lowerField.endsWith('id') && lowerField.length > 2)
  ) {
    // Generate a reasonable ID format (not assuming AWS)
    const idNum = Math.floor(Math.random() * 1000000) + 1
    if (lowerField === 'id') {
      return `id-${idNum}`
    }
    return `${fieldName.replace(/[_-]?id$/i, '')}-${idNum}`.toLowerCase()
  }

  // Remove over-specific patterns - let AI handle these
  // Language codes, locales, etc. should be determined by context

  // Username patterns
  if (lowerField.includes('username') || lowerField === 'user') {
    return `user${Math.floor(Math.random() * 10000) + 1}`
  }

  // Default case
  return `${fieldName}-${Math.floor(Math.random() * 1000) + 1}`
}

/**
 * Internal implementation for sample data generation
 */
function generateSampleDataInternal(
  format: ItemReaderInfo['format'],
  itemCount: number,
  sampleInput: JsonObject | null,
): string {
  // Add timestamp for uniqueness
  const timestamp = Date.now()
  const randomSeed = Math.floor(Math.random() * 10000)

  // Helper function to generate variations from analyzed sample
  function generateVariationFromSample(sample: JsonObject, index: number, _ts: number): JsonObject {
    const variation: JsonObject = {}

    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'string') {
        // Handle JSONata expressions first
        if (value.startsWith('{%') && value.endsWith('%}')) {
          // JSONata expressions - replace with mock test values
          const expr = value.slice(2, -2).trim()

          // Generate appropriate test values based on common patterns
          if (expr.includes('$states.context.Execution.Name')) {
            variation[key] = `test-execution-${index + 1}`
          } else if (expr.includes('$states.context.Execution.StartTime')) {
            variation[key] = new Date(Date.now() - 3600000 + index * 60000).toISOString()
          } else if (expr.includes('processing') || expr.includes('period')) {
            variation[key] = `2024-${String((index % 12) + 1).padStart(2, '0')}`
          } else if (expr.includes('notify') || expr.includes('email')) {
            variation[key] = index % 2 === 0 ? 'true' : 'false'
          } else if (expr.includes('id') || expr.includes('Id')) {
            variation[key] = `id-${Date.now()}-${index + 1}`
          } else if (expr.includes('name') || expr.includes('Name')) {
            variation[key] = `test-name-${index + 1}`
          } else if (expr.includes('value')) {
            variation[key] = `value-${Math.floor(Math.random() * 1000) + index}`
          } else {
            // Default: generate a test value based on the field name
            variation[key] = `test-${key}-${index + 1}`
          }
        } else if (value.includes('-001')) {
          // Preserve template pattern like "userId-001" → "userId-002"
          variation[key] = value.replace('-001', `-${String(index + 1).padStart(3, '0')}`)
        } else if (key.toLowerCase().includes('id')) {
          // For ID fields, add incremental number: "user123" → "user124"
          variation[key] = `${value.replace(/\d+$/, '')}${index + 1}`
        } else {
          // For other strings, keep them realistic by preserving the base value
          // Instead of "active_1234_0", use variants like "active", "pending", "inactive"
          const lowerKey = key.toLowerCase()
          if (lowerKey.includes('status') || lowerKey.includes('state')) {
            const statusOptions = ['active', 'pending', 'inactive', 'processing', 'completed']
            variation[key] = statusOptions[index % statusOptions.length] || value
          } else if (lowerKey.includes('type') || lowerKey.includes('category')) {
            const typeOptions = ['typeA', 'typeB', 'typeC', 'standard', 'premium']
            variation[key] = typeOptions[index % typeOptions.length] || value
          } else if (lowerKey.includes('name')) {
            // Keep the base structure but make it unique
            variation[key] = `${value} ${index + 1}`
          } else {
            // For other fields, keep the original value to maintain realism
            variation[key] = value
          }
        }
      } else if (typeof value === 'number') {
        if (key.toLowerCase().includes('id')) {
          // ID numbers should be incremental
          variation[key] = index + 1
        } else {
          // Other numbers: add some realistic variation
          const baseValue = typeof value === 'number' ? value : 100
          variation[key] = baseValue + index * 50 + Math.floor(Math.random() * 100)
        }
      } else if (typeof value === 'boolean') {
        // Vary boolean values in a pattern
        variation[key] = index % 3 === 0 // Every 3rd item is true
      } else {
        // Keep complex types as-is
        variation[key] = value
      }
    }

    return variation
  }
  switch (format) {
    case 's3objects': {
      // S3 ListObjectsV2 format - incorporate analyzed requirements
      const s3Items = Array.from({ length: itemCount }, (_, i) => {
        const baseItem = {
          Key: `data/batch-${timestamp}/item-${String(i + 1).padStart(4, '0')}.json`,
          Size: Math.floor((randomSeed + i * 317) % 50000) + 1024,
          LastModified: new Date(timestamp + i * 60000).toISOString(),
          ETag: `"${(randomSeed + i * 11).toString(16).padStart(8, '0')}"`,
          StorageClass: i % 10 === 0 ? 'STANDARD_IA' : 'STANDARD',
        }

        // Add fields from ItemProcessor analysis
        if (sampleInput) {
          return { ...baseItem, ...generateVariationFromSample(sampleInput, i, timestamp) }
        }
        return baseItem
      })
      return JSON.stringify(s3Items, null, 2)
    }

    case 'csv': {
      // CSV format - incorporate analyzed requirements
      if (sampleInput && Object.keys(sampleInput).length > 0) {
        // Generate CSV based on analyzed fields
        const headers = Object.keys(sampleInput).join(',')
        const rows = Array.from({ length: itemCount }, (_, i) => {
          const variation = generateVariationFromSample(sampleInput, i, timestamp)
          return Object.values(variation)
            .map((v) => JSON.stringify(v).replace(/^"|"$/g, ''))
            .join(',')
        })
        return [headers, ...rows].join('\n')
      } else {
        // Fallback to generic CSV
        const headers = 'id,name,value,status,created_at'
        const rows = Array.from(
          { length: itemCount },
          (_, i) =>
            `${i + 1},Item-${timestamp}-${i + 1},${(randomSeed + i * 37) % 1000},${i % 3 === 0 ? 'pending' : 'active'},${new Date(timestamp + i * 30000).toISOString()}`,
        )
        return [headers, ...rows].join('\n')
      }
    }

    case 'jsonl': {
      // JSON Lines format - incorporate analyzed requirements
      const jsonlItems = Array.from({ length: itemCount }, (_, i) => {
        if (sampleInput && Object.keys(sampleInput).length > 0) {
          // Generate data based on ItemProcessor analysis
          const itemData = generateVariationFromSample(sampleInput, i, timestamp)
          return JSON.stringify(itemData)
        } else {
          // Fallback to generic JSONL
          const itemData = {
            id: `item-${timestamp}-${i + 1}`,
            name: `Item ${i + 1}`,
            value: (randomSeed + i * 43) % 1000,
            processed: i % 4 === 0,
            metadata: {
              createdAt: new Date(timestamp + i * 45000).toISOString(),
              version: 1,
              batch: timestamp,
            },
          }
          return JSON.stringify(itemData)
        }
      })
      return jsonlItems.join('\n')
    }

    case 'manifest': {
      // S3 Inventory Manifest format
      const manifestData = {
        sourceBucket: 'example-source-bucket',
        destinationBucket: 'arn:aws:s3:::example-inventory-bucket',
        version: '2016-11-30',
        fileFormat: 'CSV',
        fileSchema: 'Bucket, Key, Size, LastModifiedDate, ETag, StorageClass',
        files: Array.from({ length: itemCount }, (_, i) => ({
          key: `data/inventory-${i + 1}.csv.gz`,
          size: Math.floor(Math.random() * 100000) + 10000,
          MD5checksum: Math.random().toString(36).substring(2, 15),
        })),
      }
      return JSON.stringify(manifestData, null, 2)
    }
    default: {
      // Standard JSON array - incorporate analyzed requirements
      const jsonItems = Array.from({ length: itemCount }, (_, i) => {
        if (sampleInput && Object.keys(sampleInput).length > 0) {
          return generateVariationFromSample(sampleInput, i, timestamp)
        }

        // Fallback to default structure if no requirements found
        return {
          id: `item-${timestamp}-${i + 1}`,
          name: `Item ${i + 1}`,
          value: (randomSeed + i * 51) % 1000,
          type: i % 2 === 0 ? 'typeA' : 'typeB',
          priority: i < 3 ? 'high' : 'normal',
          metadata: {
            source: 'test-data',
            timestamp: new Date(timestamp + i * 10000).toISOString(),
            batch: timestamp,
          },
        }
      })
      return JSON.stringify(jsonItems, null, 2)
    }
  }
}

/**
 * Determines the file extension based on format
 */
export function getFileExtension(format: ItemReaderInfo['format']): string {
  switch (format) {
    case 'csv':
      return 'csv'
    case 'jsonl':
      return 'jsonl'
    default:
      return 'json'
  }
}
