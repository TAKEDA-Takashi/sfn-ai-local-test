/**
 * Type guard functions for ASL types
 */

import type { JsonArray, JsonObject, JsonValue } from './asl'

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
