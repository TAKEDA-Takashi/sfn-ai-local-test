import type { ItemReader, JsonObject, ReaderConfig } from '../../types/asl'

/**
 * Validates and transforms mock data according to ItemReader configuration
 */
export class ItemReaderValidator {
  /**
   * Validate and transform mock data based on ItemReader definition
   */
  static validateAndTransform(
    mockData: unknown,
    itemReader: ItemReader,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    const resource = itemReader.Resource
    const config = itemReader.ReaderConfig || {}
    const parameters =
      ('Parameters' in itemReader
        ? itemReader.Parameters
        : 'Arguments' in itemReader
          ? itemReader.Arguments
          : {}) || {}

    try {
      if (resource.includes('s3:listObjectsV2')) {
        const params = typeof parameters === 'string' ? {} : parameters || {}
        return ItemReaderValidator.validateS3ObjectList(mockData, config, params)
      } else if (resource.includes('s3:getObject')) {
        return ItemReaderValidator.validateS3GetObject(mockData, config)
      } else if (resource.includes('dynamodb:getItem') || resource.includes('dynamodb:scan')) {
        return ItemReaderValidator.validateDynamoDBData(mockData, config)
      } else {
        return {
          valid: false,
          errors: [`Unsupported ItemReader resource: ${resource}`],
        }
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error}`],
      }
    }
  }

  /**
   * Validate S3 ListObjectsV2 response format
   */
  private static validateS3ObjectList(
    mockData: unknown,
    config: ReaderConfig,
    parameters: JsonObject,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    const errors: string[] = []

    if (!Array.isArray(mockData)) {
      return {
        valid: false,
        errors: ['S3 ListObjectsV2 mock data must be an array'],
      }
    }

    const transformedData = mockData.map((item, index) => {
      const transformed: JsonObject = {}

      if (!(item.Key || item.key)) {
        errors.push(`Item ${index}: Missing required field 'Key'`)
      } else {
        transformed.Key = item.Key || item.key
      }

      transformed.Size = item.Size !== undefined ? item.Size : Math.floor(Math.random() * 10000)
      transformed.LastModified = item.LastModified || new Date().toISOString()
      transformed.ETag = item.ETag || `"${Math.random().toString(36).substring(7)}"`
      transformed.StorageClass = item.StorageClass || 'STANDARD'

      const prefix =
        typeof parameters === 'object' && 'Prefix' in parameters ? parameters.Prefix : undefined
      if (
        prefix &&
        typeof transformed.Key === 'string' &&
        !transformed.Key.startsWith(prefix as string)
      ) {
        errors.push(`Item ${index}: Key '${transformed.Key}' doesn't match prefix '${prefix}'`)
      }

      return transformed
    })

    const maxItems = config.MaxItems
    const limitedData =
      maxItems && typeof maxItems === 'number'
        ? transformedData.slice(0, maxItems)
        : transformedData

    return {
      valid: errors.length === 0,
      data: limitedData,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Validate S3 GetObject response based on InputType
   */
  private static validateS3GetObject(
    mockData: unknown,
    config: ReaderConfig,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    const inputType = config.InputType || 'JSON'

    switch (inputType) {
      case 'CSV':
        return ItemReaderValidator.validateCSVData(mockData, config)

      case 'JSON':
        return ItemReaderValidator.validateJSONData(mockData, config)

      case 'JSONL':
        return ItemReaderValidator.validateJSONLData(mockData, config)

      case 'MANIFEST':
        return ItemReaderValidator.validateManifestData(mockData, config)

      default:
        return {
          valid: false,
          errors: [`Unsupported InputType: ${inputType}`],
        }
    }
  }

  /**
   * Validate CSV data format
   */
  private static validateCSVData(
    mockData: unknown,
    config: ReaderConfig,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    const errors: string[] = []

    if (!Array.isArray(mockData)) {
      return {
        valid: false,
        errors: ['CSV mock data must be an array of objects'],
      }
    }

    if (config.CSVHeaders) {
      const requiredHeaders = config.CSVHeaders
      const transformedData = mockData.map((item, index) => {
        const transformed: JsonObject = {}

        for (const header of requiredHeaders) {
          if (!(header in item)) {
            errors.push(`Row ${index}: Missing required CSV column '${header}'`)
            transformed[header] = '' // Provide empty string for missing columns
          } else {
            transformed[header] = item[header]
          }
        }

        return transformed
      })

      return {
        valid: errors.length === 0,
        data: ItemReaderValidator.applyMaxItems(transformedData, config),
        errors: errors.length > 0 ? errors : undefined,
      }
    }

    if (config.CSVHeaderLocation === 'FIRST_ROW') {
      if (mockData.length > 0 && typeof mockData[0] === 'object') {
        return {
          valid: true,
          data: ItemReaderValidator.applyMaxItems(mockData, config),
        }
      }
    }

    return {
      valid: true,
      data: ItemReaderValidator.applyMaxItems(mockData, config),
    }
  }

  /**
   * Validate JSON data format
   */
  private static validateJSONData(
    mockData: unknown,
    config: ReaderConfig,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    if (!Array.isArray(mockData)) {
      return {
        valid: false,
        errors: ['JSON mock data for ItemReader must be an array'],
      }
    }

    return {
      valid: true,
      data: ItemReaderValidator.applyMaxItems(mockData, config),
    }
  }

  /**
   * Validate JSON Lines data format
   */
  private static validateJSONLData(
    mockData: unknown,
    config: ReaderConfig,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    if (!Array.isArray(mockData)) {
      return {
        valid: false,
        errors: ['JSONL mock data must be an array of objects'],
      }
    }

    const errors: string[] = []
    mockData.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(`Line ${index}: Must be a valid JSON object`)
      }
    })

    return {
      valid: errors.length === 0,
      data: ItemReaderValidator.applyMaxItems(mockData, config),
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Validate S3 Inventory Manifest data format
   */
  private static validateManifestData(
    mockData: unknown,
    config: ReaderConfig,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    const errors: string[] = []

    if (!Array.isArray(mockData)) {
      return {
        valid: false,
        errors: ['Manifest mock data must be an array'],
      }
    }

    const transformedData = mockData.map((item, index) => {
      const transformed: JsonObject = {}

      if (!(item.Bucket || item.bucket)) {
        errors.push(`Item ${index}: Missing required field 'Bucket'`)
      } else {
        transformed.Bucket = item.Bucket || item.bucket
      }

      if (!(item.Key || item.key)) {
        errors.push(`Item ${index}: Missing required field 'Key'`)
      } else {
        transformed.Key = item.Key || item.key
      }

      transformed.Size = item.Size || 0
      transformed.LastModifiedDate = item.LastModifiedDate || new Date().toISOString()
      transformed.ETag = item.ETag
      transformed.StorageClass = item.StorageClass
      transformed.IsMultipartUploaded = item.IsMultipartUploaded ?? false
      transformed.ReplicationStatus = item.ReplicationStatus

      return transformed
    })

    return {
      valid: errors.length === 0,
      data: ItemReaderValidator.applyMaxItems(transformedData, config),
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Validate DynamoDB data format
   */
  private static validateDynamoDBData(
    mockData: unknown,
    config: ReaderConfig,
  ): { valid: boolean; data?: unknown; errors?: string[] } {
    if (!Array.isArray(mockData)) {
      return {
        valid: false,
        errors: ['DynamoDB mock data must be an array of items'],
      }
    }

    const errors: string[] = []
    mockData.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(`Item ${index}: Must be a valid object`)
      }
    })

    return {
      valid: errors.length === 0,
      data: ItemReaderValidator.applyMaxItems(mockData, config),
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Apply MaxItems limit to data
   */
  private static applyMaxItems(data: unknown[], config: ReaderConfig): unknown[] {
    const maxItems = config.MaxItems
    if (typeof maxItems === 'number' && maxItems > 0) {
      return data.slice(0, maxItems)
    }
    return data
  }

  /**
   * Check if mock data matches expected ItemReader format
   */
  static isCompatibleFormat(mockData: unknown, itemReader: ItemReader): boolean {
    const result = ItemReaderValidator.validateAndTransform(mockData, itemReader)
    return result.valid
  }

  /**
   * Get expected data format description for an ItemReader
   */
  static getExpectedFormat(itemReader: ItemReader): string {
    const resource = itemReader.Resource
    const config = itemReader.ReaderConfig || {}

    switch (resource) {
      case 'arn:aws:states:::s3:listObjectsV2':
        return `Array of S3 objects with fields: Key (required), Size, LastModified, ETag, StorageClass`

      case 'arn:aws:states:::s3:getObject':
        switch (config.InputType) {
          case 'CSV': {
            const headers = config.CSVHeaders ? config.CSVHeaders.join(', ') : 'auto-detected'
            return `Array of objects with CSV columns: ${headers}`
          }
          case 'JSON':
            return `JSON array for iteration`
          case 'JSONL':
            return `Array of JSON objects (one per line)`
          case 'MANIFEST':
            return `Array of S3 inventory entries with fields: Bucket, Key (required), Size, LastModifiedDate`
          default:
            return `Array of items based on InputType: ${config.InputType || 'JSON'}`
        }

      case 'arn:aws:states:::dynamodb:getItem':
      case 'arn:aws:states:::dynamodb:scan':
      case 'arn:aws:states:::aws-sdk:dynamodb:scan':
        return `Array of DynamoDB items (objects)`

      default:
        return `Unknown format for resource: ${resource}`
    }
  }
}
