import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import type { JsonArray, JsonValue } from '../../types/asl'

export class MockFileLoader {
  private basePath: string

  constructor(basePath?: string) {
    this.basePath = basePath || process.cwd()
  }

  /**
   * Load mock data from an external file
   */
  loadFromFile(filePath: string, format?: 'json' | 'csv' | 'jsonl' | 'yaml'): JsonValue {
    const resolvedPath = this.resolvePath(filePath)
    const fileContent = readFileSync(resolvedPath, 'utf-8')

    const fileFormat = format || this.detectFormat(resolvedPath)

    switch (fileFormat) {
      case 'json':
        return this.parseJson(fileContent)

      case 'csv':
        return this.parseCsv(fileContent)

      case 'jsonl':
        return this.parseJsonLines(fileContent)

      case 'yaml':
        return this.parseYaml(fileContent)

      default:
        throw new Error(`Unsupported file format: ${fileFormat}`)
    }
  }

  /**
   * Resolve file path relative to base path
   * - Simple filename or path without ./ or ../ -> looks in basePath (test-data directory)
   * - Explicit relative path (starts with ./ or ../) -> resolves from project root
   * - Absolute path (starts with /) -> uses as-is
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath
    }

    if (filePath.startsWith('./') || filePath.startsWith('../')) {
      return resolve(process.cwd(), filePath)
    }

    // All other paths (including those with slashes) resolve from basePath (test-data)
    // Examples: 'items.csv' -> test-data/items.csv
    //          'subdir/items.csv' -> test-data/subdir/items.csv
    return resolve(this.basePath, filePath)
  }

  /**
   * Detect file format from extension
   */
  private detectFormat(filePath: string): 'json' | 'csv' | 'jsonl' | 'yaml' {
    const ext = extname(filePath).toLowerCase()

    switch (ext) {
      case '.json':
        return 'json'
      case '.csv':
      case '.tsv':
        return 'csv'
      case '.jsonl':
      case '.ndjson':
        return 'jsonl'
      case '.yaml':
      case '.yml':
        return 'yaml'
      default:
        return 'json'
    }
  }

  /**
   * Parse JSON file
   */
  private parseJson(content: string): JsonValue {
    try {
      return JSON.parse(content) as JsonValue
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`)
    }
  }

  /**
   * Parse CSV file
   */
  private parseCsv(content: string): JsonArray {
    const lines = []
    let currentLine = ''
    let inQuotes = false

    for (let i = 0; i < content.length; i++) {
      const char = content[i]
      const nextChar = content[i + 1]

      if (char === '"' && !inQuotes) {
        inQuotes = true
        currentLine += char
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          currentLine += '""'
          i++
        } else {
          inQuotes = false
          currentLine += char
        }
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++
        }
        if (currentLine.trim()) {
          lines.push(currentLine)
        }
        currentLine = ''
      } else {
        currentLine += char
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine)
    }

    if (lines.length === 0) {
      return []
    }

    const headers = this.parseCsvLine(lines[0] || '')

    const data = []
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i] || '')
      if (values.length === 0) continue

      const row: Record<string, string | number> = {}
      headers.forEach((header, index) => {
        const value = values[index] || ''
        const numValue = Number(value)
        row[header] = Number.isNaN(numValue) ? value : numValue
      })
      data.push(row)
    }

    return data
  }

  /**
   * Parse a single CSV line (handles quoted values)
   */
  private parseCsvLine(line: string): string[] {
    const result = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"' && !inQuotes) {
        inQuotes = true
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }

    result.push(current)

    return result
  }

  /**
   * Parse JSON Lines file
   */
  private parseJsonLines(content: string): JsonArray {
    const lines = content.trim().split('\n')
    const data = []

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        data.push(JSON.parse(line))
      } catch (_error) {
        console.warn(`Failed to parse JSON line: ${line}`)
      }
    }

    return data
  }

  /**
   * Parse YAML file
   */
  private parseYaml(content: string): JsonValue {
    try {
      return parseYaml(content) as JsonValue
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error}`)
    }
  }

  /**
   * Update base path for relative file resolution
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath
  }
}
