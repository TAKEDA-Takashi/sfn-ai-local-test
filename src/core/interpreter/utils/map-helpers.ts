/**
 * Map State Helper Functions
 * Pure functions and utilities for Map and DistributedMap state processing
 */

import type {
  ItemBatcher,
  JsonArray,
  JsonObject,
  JsonValue,
  ToleranceConfig,
} from '../../../types/asl'
import { JSONPathUtils } from './jsonpath-utils'

/**
 * Calculate if execution should fail based on tolerance settings
 */
export function shouldFailExecution(
  failedCount: number,
  totalCount: number,
  input: JsonValue,
  toleranceConfig: ToleranceConfig,
): boolean {
  if (
    'ToleratedFailureCount' in toleranceConfig &&
    toleranceConfig.ToleratedFailureCount !== undefined
  ) {
    return failedCount > (toleranceConfig.ToleratedFailureCount || 0)
  }

  if ('ToleratedFailureCountPath' in toleranceConfig) {
    const path = toleranceConfig.ToleratedFailureCountPath
    if (!path) return failedCount > 0
    const toleratedCount = JSONPathUtils.evaluateFirst(path, input, 0)
    const numericToleratedCount =
      typeof toleratedCount === 'number' ? toleratedCount : Number(toleratedCount) || 0
    return failedCount > numericToleratedCount
  }

  if (
    'ToleratedFailurePercentage' in toleranceConfig &&
    toleranceConfig.ToleratedFailurePercentage !== undefined
  ) {
    const percentage = toleranceConfig.ToleratedFailurePercentage
    const failedPercentage = (failedCount / totalCount) * 100
    // Fail only if the failure percentage exceeds (not equals) the tolerance
    return failedPercentage > percentage
  }

  if ('ToleratedFailurePercentagePath' in toleranceConfig) {
    const path = toleranceConfig.ToleratedFailurePercentagePath
    if (!path) return failedCount > 0
    const toleratedPercentage = JSONPathUtils.evaluateFirst(path, input, 0)
    const numericToleratedPercentage =
      typeof toleratedPercentage === 'number'
        ? toleratedPercentage
        : Number(toleratedPercentage) || 0
    const failedPercentage = (failedCount / totalCount) * 100
    return failedPercentage > numericToleratedPercentage
  }

  // Default: fail on any error
  return failedCount > 0
}

/**
 * Create batches from items array based on ItemBatcher configuration
 */
export function createItemBatches(items: JsonArray, batcherConfig?: ItemBatcher): JsonArray {
  if (!batcherConfig) {
    return items
  }

  const batches: JsonArray = []
  const maxItemsPerBatch = batcherConfig.MaxItemsPerBatch || 1
  const maxInputBytesPerBatch = batcherConfig.MaxInputBytesPerBatch
  const batchInput = batcherConfig.BatchInput || {}

  let currentBatch: JsonArray = []
  let currentBatchSize = 0

  for (const item of items) {
    const itemSize = maxInputBytesPerBatch ? JSON.stringify(item).length : 0

    const shouldStartNewBatch =
      currentBatch.length >= maxItemsPerBatch ||
      (maxInputBytesPerBatch && currentBatchSize + itemSize > maxInputBytesPerBatch)

    if (shouldStartNewBatch && currentBatch.length > 0) {
      const batchObject = {
        ...batchInput,
        Items: currentBatch,
      }
      batches.push(batchObject)
      currentBatch = []
      currentBatchSize = 0
    }

    currentBatch.push(item)
    currentBatchSize += itemSize
  }

  if (currentBatch.length > 0) {
    const batchObject = {
      ...batchInput,
      Items: currentBatch,
    }
    batches.push(batchObject)
  }

  return batches
}

/**
 * Process special Map context selectors ($$, $$.Map.Item.Value, etc.)
 */
export function processMapContextSelector(
  selector: string,
  item: JsonValue,
  context: JsonObject,
): JsonValue | null {
  if (selector === '$$') {
    return context
  }
  if (selector === '$$.Map.Item.Value') {
    return item
  }
  if (selector === '$$.Map.Item.Index') {
    const mapContext = context.Map as JsonObject
    const itemContext = mapContext.Item as JsonObject
    return itemContext.Index ?? null
  }
  if (selector.startsWith('$$.')) {
    return JSONPathUtils.evaluateWithContext(selector, item, context)
  }
  return null // Not a special Map context selector
}

/**
 * Get default mock data for different data source types
 */
export function getDefaultMockDataForResource(resource: string): JsonArray {
  if (resource.includes('s3:listObjectsV2')) {
    return [
      { Key: 'mock-object-1.json', Size: 1024, LastModified: new Date().toISOString() },
      { Key: 'mock-object-2.json', Size: 2048, LastModified: new Date().toISOString() },
    ]
  }

  if (resource.includes('dynamodb:scan') || resource.includes('dynamodb:query')) {
    return [
      { id: 'item-1', data: 'mock-data-1' },
      { id: 'item-2', data: 'mock-data-2' },
    ]
  }

  // Return empty array for unknown data sources
  return []
}
