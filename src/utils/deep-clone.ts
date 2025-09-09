/**
 * Deep clone utility using JSON serialization
 * Creates a complete copy of the input value
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
