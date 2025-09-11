/**
 * Type guard functions for ASL types
 */

import type { ItemProcessor, JsonArray, JsonObject, JsonValue } from './asl'
import type { MapState } from './state-classes'

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (typeof value === 'object' && value !== null) {
    // Plainオブジェクトかどうか確認（Dateやクラスインスタンスを除外）
    if (Object.prototype.toString.call(value) !== '[object Object]') {
      return false
    }
    return Object.values(value).every(isJsonValue)
  }
  return false
}

export function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (Array.isArray(value)) {
    return false
  }
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }
  return Object.values(value).every(isJsonValue)
}

export function isJsonArray(value: unknown): value is JsonArray {
  return Array.isArray(value) && value.every(isJsonValue)
}

// Type guard for legacy Iterator field in MapState
// Iterator should be compatible with ItemProcessor interface
export function hasIterator(
  state: MapState | unknown,
): state is MapState & { Iterator: ItemProcessor } {
  // First check if it's an object
  if (state === null || typeof state !== 'object') {
    return false
  }

  // Check if Iterator property exists
  if (!('Iterator' in state)) {
    return false
  }

  // Access Iterator - we know it exists from the check above
  const stateWithIterator = state as { Iterator?: unknown }
  const iterator = stateWithIterator.Iterator

  // Check if Iterator is a valid object
  if (iterator === undefined || iterator === null || typeof iterator !== 'object') {
    return false
  }

  // Check if iterator has required ItemProcessor properties
  if (!('StartAt' in iterator && 'States' in iterator)) {
    return false
  }

  // Final type check for StartAt and States
  const iteratorObj = iterator as { StartAt?: unknown; States?: unknown }

  return (
    typeof iteratorObj.StartAt === 'string' &&
    typeof iteratorObj.States === 'object' &&
    iteratorObj.States !== null
  )
}
