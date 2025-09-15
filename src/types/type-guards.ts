/**
 * Type guard functions for ASL types
 */

import type { JsonArray, JsonObject, JsonValue } from './asl'

/**
 * JSON値かどうかを判定する型ガード
 * @param value 判定対象の値
 * @returns JsonValue型の場合true
 */
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

/**
 * JSONオブジェクトかどうかを判定する型ガード
 * @param value 判定対象の値
 * @returns JsonObject型の場合true
 */
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

/**
 * JSON配列かどうかを判定する型ガード
 * @param value 判定対象の値
 * @returns JsonArray型の場合true
 */
export function isJsonArray(value: unknown): value is JsonArray {
  return Array.isArray(value) && value.every(isJsonValue)
}

// Basic type guards
/**
 * 文字列かどうかを判定する型ガード
 * @param value 判定対象の値
 * @returns 文字列の場合true
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Errorオブジェクトかどうかを判定する型ガード
 * @param result 判定対象の値
 * @returns Errorインスタンスの場合true
 */
export function isError(result: unknown): result is Error {
  return result instanceof Error
}
