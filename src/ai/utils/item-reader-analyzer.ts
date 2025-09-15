/**
 * Analyzes ItemReader configuration in DistributedMap states
 */

import type { ItemProcessor, JsonObject, JsonValue, MapState, StateMachine } from '../../types/asl'
import { isJsonObject } from '../../types/type-guards'
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
    const itemReader = state.isDistributedMap() ? state.ItemReader : undefined
    if (!itemReader) {
      return {
        stateName: name,
        format: 'json',
        estimatedItemCount: 10,
        resource: '',
        hasItemReader: false,
      }
    }

    const resource = typeof itemReader.Resource === 'string' ? itemReader.Resource : ''

    let format: ItemReaderInfo['format'] = 'json'
    let estimatedItemCount = 10 // Default for unknown formats

    if (resource.includes('s3:listObjectsV2')) {
      format = 's3objects'
      estimatedItemCount = 20 // S3 listings typically have more items
    } else if (resource.includes('s3:getObject')) {
      const readerConfig = itemReader.ReaderConfig
      const inputType =
        readerConfig &&
        typeof readerConfig === 'object' &&
        'InputType' in readerConfig &&
        typeof readerConfig.InputType === 'string'
          ? readerConfig.InputType
          : undefined

      if (inputType === 'CSV') {
        format = 'csv'
        estimatedItemCount = 50 // CSV files often have many rows
      } else if (inputType === 'JSONL') {
        format = 'jsonl'
        estimatedItemCount = 30
      } else if (inputType === 'MANIFEST') {
        format = 'manifest'
        estimatedItemCount = 100 // S3 inventory manifests can be large
      } else {
        const args =
          'Arguments' in itemReader && isJsonObject(itemReader.Arguments)
            ? itemReader.Arguments
            : undefined
        const key = args && 'Key' in args && typeof args.Key === 'string' ? args.Key : undefined

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

  if (!processor.States) {
    return null
  }

  const jsonataPattern = new RegExp(`\\$states\\.input\\.${fieldName}\\.([\\w.]+)`, 'g')
  const jsonpathPattern = new RegExp(`\\$\\.${fieldName}\\.([\\w.]+)`, 'g')
  const jsonString = JSON.stringify(processor.States)

  let match: RegExpExecArray | null = null
  const foundFields = new Set<string>()

  const fieldPaths = new Set<string>()

  let jsonataMatch = jsonataPattern.exec(jsonString)
  while (jsonataMatch !== null) {
    match = jsonataMatch
    if (match[1]) {
      const fieldPath = match[1].split('.')
      const topLevelField = fieldPath[0]

      if (topLevelField) {
        if (fieldPath.length > 1) {
          fieldPaths.add(match[1])
        } else {
          foundFields.add(topLevelField)
        }
      }
    }
    jsonataMatch = jsonataPattern.exec(jsonString)
  }

  let jsonpathMatch = jsonpathPattern.exec(jsonString)
  while (jsonpathMatch !== null) {
    match = jsonpathMatch
    if (match[1]) {
      const fieldPath = match[1].split('.')
      const topLevelField = fieldPath[0]

      if (topLevelField) {
        if (fieldPath.length > 1) {
          fieldPaths.add(match[1])
        } else {
          foundFields.add(topLevelField)
        }
      }
    }
    jsonpathMatch = jsonpathPattern.exec(jsonString)
  }

  for (const field of foundFields) {
    requiredFields[field] = generateSampleValueForField(field)
  }

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

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      if (i === parts.length - 1) {
        const fullPath = `${fieldName}\\.${fieldPath.replace(/\./g, '\\.')}`
        current[part] = generateSampleValueForField(part, {
          fullPath,
          jsonString,
        })
      } else {
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
      current[part] = generateSampleValueForField(part)
    } else {
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
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      mergeNestedStructures(target[key] as JsonObject, value)
    } else {
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
    const itemSelector = mapState.ItemSelector

    if (mapIsJSONata) {
      for (const [selectorKey, value] of Object.entries(itemSelector)) {
        if (typeof value === 'string' && value.includes('$states.context.Map.Item.Value')) {
          const cleanValue = value
            .replace(/^{%\s*/, '')
            .replace(/\s*%}$/, '')
            .trim()
          const match = cleanValue.match(/\$states\.context\.Map\.Item\.Value(?:\.(.+))?/)
          if (match) {
            const fieldPath = match[1]

            if (!fieldPath) {
              const requiredFields = analyzeItemProcessorFieldUsage(processor, selectorKey)
              if (requiredFields && Object.keys(requiredFields).length > 0) {
                mergeNestedStructures(sampleInput, requiredFields)
              } else {
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
              buildNestedStructureFromPath(sampleInput, fieldPath)
            }
          }
        }
      }
    } else {
      for (const [rawKey, value] of Object.entries(itemSelector)) {
        const key = rawKey.endsWith('.$') ? rawKey.slice(0, -2) : rawKey

        if (typeof value === 'string' && value.includes('$$.Map.Item.Value')) {
          if (value === '$$.Map.Item.Value' || value === '$$.Map.Item.Value.$') {
            const requiredFields = analyzeItemProcessorFieldUsage(processor, key)
            if (requiredFields && Object.keys(requiredFields).length > 0) {
              Object.assign(sampleInput, requiredFields)
            } else {
              Object.assign(sampleInput, {
                id: generateSampleValueForField('id'),
                name: generateSampleValueForField('name'),
                groupName: generateSampleValueForField('groupName'),
                lang: generateSampleValueForField('lang'),
                addresses: generateSampleValueForField('addresses'),
              })
            }
          } else {
            const match = value.match(/\$\$\.Map\.Item\.Value\.(.+)/)
            if (match?.[1]) {
              const fieldPath = match[1]
              buildNestedStructureFromPath(sampleInput, fieldPath)
            }
          }
        }
      }
    }
  }

  extractFieldsFromItemProcessor(processor, sampleInput, mapIsJSONata)

  return Object.keys(sampleInput).length > 0 ? sampleInput : null
}

function extractFieldsFromItemProcessor(
  processor: ItemProcessor,
  sampleInput: JsonObject,
  isJSONata: boolean,
): void {
  if (!processor.States) return

  for (const [, state] of Object.entries(processor.States)) {
    if (state.isChoice()) {
      if ('Choices' in state && state.Choices) {
        for (const choice of state.Choices) {
          if ('Variable' in choice && choice.Variable) {
            const fieldName = extractFieldFromPath(choice.Variable)
            if (fieldName && !sampleInput[fieldName]) {
              if ('StringEquals' in choice && choice.StringEquals !== undefined) {
                sampleInput[fieldName] = choice.StringEquals
              } else if (
                'NumericGreaterThan' in choice &&
                choice.NumericGreaterThan !== undefined
              ) {
                sampleInput[fieldName] = choice.NumericGreaterThan + 1
              } else if ('BooleanEquals' in choice && choice.BooleanEquals !== undefined) {
                sampleInput[fieldName] = choice.BooleanEquals
              } else {
                sampleInput[fieldName] = generateSampleValueForField(fieldName)
              }
            }
          }
        }
      }
    } else if (state.isTask()) {
      if ('Parameters' in state && state.Parameters) {
        extractFieldsFromParameters(state.Parameters, sampleInput, isJSONata)
      }
    }
  }
}

function extractFieldsFromParameters(
  params: JsonValue,
  sampleInput: JsonObject,
  isJSONata: boolean,
): void {
  if (!params || typeof params !== 'object') return

  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return
  }

  for (const [, value] of Object.entries(params)) {
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

function extractFieldFromPath(path: string): string | null {
  if (!path?.startsWith('$')) return null

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

  const isEmailField =
    lowerField.includes('email') ||
    (lowerField.includes('mail') && !lowerField.includes('mailing')) ||
    checkUsageContext(context?.fullPath, context?.jsonString, ['email', 'mail', 'to', 'cc', 'from'])

  if (isEmailField) {
    return `user${Math.floor(Math.random() * 1000) + 1}@example.com`
  }

  if (lowerField.endsWith('_at') || lowerField.endsWith('_date') || lowerField.endsWith('_time')) {
    const date = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
    return date.toISOString()
  }

  if (lowerField.endsWith('_month') || lowerField === 'month') {
    const year = 2024
    const month = Math.floor(Math.random() * 12) + 1
    return `${year}-${String(month).padStart(2, '0')}`
  }

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

  if (
    lowerField.includes('_count') ||
    lowerField.includes('_number') ||
    lowerField.startsWith('num_') ||
    (lowerField.startsWith('total_') && !lowerField.includes('amount'))
  ) {
    return Math.floor(Math.random() * 100) + 1
  }

  if (
    lowerField.includes('amount') ||
    lowerField.includes('price') ||
    lowerField.includes('cost') ||
    lowerField.includes('fee') ||
    lowerField.includes('payment')
  ) {
    return Math.floor(Math.random() * 10000) + 100
  }

  if (
    lowerField.includes('_url') ||
    lowerField.includes('_link') ||
    lowerField.includes('website')
  ) {
    return `https://example.com/${fieldName.toLowerCase()}`
  }

  if (lowerField.includes('name')) {
    return `${fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()} ${Math.floor(Math.random() * 100) + 1}`
  }

  if (lowerField.includes('status') || lowerField.includes('state')) {
    const options = ['active', 'pending', 'inactive', 'processing', 'completed']
    return options[Math.floor(Math.random() * options.length)] ?? 'pending' // Fallback to safe default
  }

  if (lowerField.includes('priority')) {
    return Math.floor(Math.random() * 5) + 1 // Priority levels typically 1-5
  }

  if (
    lowerField.endsWith('_id') ||
    lowerField === 'id' ||
    (lowerField.endsWith('id') && lowerField.length > 2)
  ) {
    const idNum = Math.floor(Math.random() * 1000000) + 1
    if (lowerField === 'id') {
      return `id-${idNum}`
    }
    return `${fieldName.replace(/[_-]?id$/i, '')}-${idNum}`.toLowerCase()
  }

  if (lowerField.includes('username') || lowerField === 'user') {
    return `user${Math.floor(Math.random() * 10000) + 1}`
  }

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
  const timestamp = Date.now()
  const randomSeed = Math.floor(Math.random() * 10000)

  function generateVariationFromSample(sample: JsonObject, index: number, _ts: number): JsonObject {
    const variation: JsonObject = {}

    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'string') {
        if (value.startsWith('{%') && value.endsWith('%}')) {
          const expr = value.slice(2, -2).trim()

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
            variation[key] = `test-${key}-${index + 1}`
          }
        } else if (value.includes('-001')) {
          variation[key] = value.replace('-001', `-${String(index + 1).padStart(3, '0')}`)
        } else if (key.toLowerCase().includes('id')) {
          variation[key] = `${value.replace(/\d+$/, '')}${index + 1}`
        } else {
          const lowerKey = key.toLowerCase()
          if (lowerKey.includes('status') || lowerKey.includes('state')) {
            const statusOptions = ['active', 'pending', 'inactive', 'processing', 'completed']
            variation[key] = statusOptions[index % statusOptions.length] || value
          } else if (lowerKey.includes('type') || lowerKey.includes('category')) {
            const typeOptions = ['typeA', 'typeB', 'typeC', 'standard', 'premium']
            variation[key] = typeOptions[index % typeOptions.length] || value
          } else if (lowerKey.includes('name')) {
            variation[key] = `${value} ${index + 1}`
          } else {
            variation[key] = value
          }
        }
      } else if (typeof value === 'number') {
        if (key.toLowerCase().includes('id')) {
          variation[key] = index + 1
        } else {
          const baseValue = typeof value === 'number' ? value : 100
          variation[key] = baseValue + index * 50 + Math.floor(Math.random() * 100)
        }
      } else if (typeof value === 'boolean') {
        variation[key] = index % 3 === 0
      } else {
        variation[key] = value
      }
    }

    return variation
  }
  switch (format) {
    case 's3objects': {
      const s3Items = Array.from({ length: itemCount }, (_, i) => {
        const baseItem = {
          Key: `data/batch-${timestamp}/item-${String(i + 1).padStart(4, '0')}.json`,
          Size: Math.floor((randomSeed + i * 317) % 50000) + 1024,
          LastModified: new Date(timestamp + i * 60000).toISOString(),
          ETag: `"${(randomSeed + i * 11).toString(16).padStart(8, '0')}"`,
          StorageClass: i % 10 === 0 ? 'STANDARD_IA' : 'STANDARD',
        }

        if (sampleInput) {
          return { ...baseItem, ...generateVariationFromSample(sampleInput, i, timestamp) }
        }
        return baseItem
      })
      return JSON.stringify(s3Items, null, 2)
    }

    case 'csv': {
      if (sampleInput && Object.keys(sampleInput).length > 0) {
        const headers = Object.keys(sampleInput).join(',')
        const rows = Array.from({ length: itemCount }, (_, i) => {
          const variation = generateVariationFromSample(sampleInput, i, timestamp)
          return Object.values(variation)
            .map((v) => JSON.stringify(v).replace(/^"|"$/g, ''))
            .join(',')
        })
        return [headers, ...rows].join('\n')
      } else {
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
      const jsonlItems = Array.from({ length: itemCount }, (_, i) => {
        if (sampleInput && Object.keys(sampleInput).length > 0) {
          const itemData = generateVariationFromSample(sampleInput, i, timestamp)
          return JSON.stringify(itemData)
        } else {
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
      const jsonItems = Array.from({ length: itemCount }, (_, i) => {
        if (sampleInput && Object.keys(sampleInput).length > 0) {
          return generateVariationFromSample(sampleInput, i, timestamp)
        }

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
