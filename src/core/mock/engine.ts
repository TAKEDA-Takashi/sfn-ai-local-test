import type { ItemReader, JsonArray, JsonValue } from '../../types/asl'
import type { MockConfig, MockDefinition, MockEngineOptions, MockState } from '../../types/mock'
import { isJsonObject, isJsonValue } from '../../types/type-guards'
import { MockFileLoader } from './file-loader'
import { ItemReaderValidator } from './item-reader-validator'

export class MockEngine {
  private config: MockConfig
  private state: MockState
  private overrides: Map<string, MockDefinition> = new Map()
  private fileLoader: MockFileLoader
  private responseCache: Map<string, JsonValue> = new Map()

  constructor(config: MockConfig, options: MockEngineOptions = {}) {
    this.config = config
    this.state = {
      callCount: new Map(),
      history: [],
    }
    this.fileLoader = new MockFileLoader(options.basePath)
  }

  setMockOverrides(overrides: MockDefinition[]): void {
    this.overrides.clear()
    for (const override of overrides) {
      this.overrides.set(override.state, override)
    }
  }

  clearMockOverrides(): void {
    this.overrides.clear()
  }

  getMockData(params: {
    state: string
    type: string
    resource: string
    config?: JsonValue
    parameters?: JsonValue
    itemReader?: ItemReader
  }): JsonValue {
    const mock = this.findMock(params.state)

    if (mock && mock.type === 'itemReader') {
      const itemReaderMock = mock
      let data: JsonValue | undefined = itemReaderMock.data

      if (!data && itemReaderMock.dataFile) {
        const format = itemReaderMock.dataFormat || this.getFormatFromItemReader(params.itemReader)
        const loadedData = this.loadResponseFromFile(itemReaderMock.dataFile, format)
        if (!Array.isArray(loadedData)) {
          throw new Error(
            `ItemReader mock data must be an array, got ${typeof loadedData} from file: ${itemReaderMock.dataFile}`,
          )
        }
        data = loadedData
      }

      if (params.itemReader && data) {
        const validation = ItemReaderValidator.validateAndTransform(data, params.itemReader)
        if (!validation.valid) {
          console.warn(`Mock data validation failed for ItemReader:`, validation.errors)
          const result = validation.data || data
          return isJsonValue(result) ? result : data
        }
        const validatedData = validation.data
        return isJsonValue(validatedData) ? validatedData : data
      }

      return data || []
    }

    if (mock && mock.type === 'fixed') {
      const fixedMock = mock
      let data: JsonValue | undefined = fixedMock.response

      if (!data && fixedMock.responseFile) {
        const format = this.getFormatFromItemReader(params.itemReader) || fixedMock.responseFormat
        data = this.loadResponseFromFile(fixedMock.responseFile, format)
      }

      if (params.itemReader && data) {
        const validation = ItemReaderValidator.validateAndTransform(data, params.itemReader)
        if (!validation.valid) {
          console.warn(`Mock data validation failed for ItemReader:`, validation.errors)
          const result = validation.data || data
          return isJsonValue(result) ? result : data
        }
        const validatedData = validation.data
        return isJsonValue(validatedData) ? validatedData : data
      }

      return data || {}
    }

    if (params.type === 'itemReader') {
      return []
    }

    return {}
  }

  private getFormatFromItemReader(
    itemReader?: ItemReader,
  ): 'json' | 'csv' | 'jsonl' | 'yaml' | undefined {
    if (!itemReader) {
      return undefined
    }

    const config = itemReader.ReaderConfig
    if (!config) {
      return undefined
    }

    if (itemReader.Resource === 'arn:aws:states:::s3:getObject') {
      switch (config.InputType) {
        case 'CSV':
          return 'csv'
        case 'JSON':
          return 'json'
        case 'JSONL':
          return 'jsonl'
        case 'MANIFEST':
          return 'json'
        default:
          if (config.CSVHeaderLocation) {
            return 'csv'
          }
          return 'json'
      }
    }

    return 'json'
  }

  writeResults(params: {
    state: string
    type: string
    resource: string
    config?: JsonValue
    results: JsonArray
  }): void {
    this.state.history.push({
      state: params.state,
      input: params.results,
      output: { written: true, count: params.results.length },
      timestamp: new Date(),
      error: undefined,
    })
  }

  async getMockResponse(stateName: string, input: JsonValue): Promise<JsonValue> {
    const mock = this.findMock(stateName)
    if (!mock) {
      if (process.env.DEBUG_OUTPUT_PATH) {
        console.log(`No mock found for state: ${stateName}`)
        console.log(
          'Available mocks:',
          this.config.mocks.map((m) => m.state),
        )
      }
      throw new Error(`No mock defined for state: ${stateName}`)
    }

    if (process.env.DEBUG_OUTPUT_PATH) {
      console.log(`Mock found for state: ${stateName}, type: ${mock.type}`)
      console.log('Input to mock:', JSON.stringify(input, null, 2))
    }

    const callCount = this.state.callCount.get(stateName) || 0
    this.state.callCount.set(stateName, callCount + 1)

    let response: JsonValue = {}
    let error: Error | undefined
    let delay: number | undefined = mock.delay

    switch (mock.type) {
      case 'fixed':
        response = this.handleFixedMock(mock)
        break
      case 'conditional': {
        const result = this.handleConditionalMock(mock, input)
        response = result.response
        delay = result.delay !== undefined ? result.delay : delay
        break
      }
      case 'stateful':
        response = this.handleStatefulMock(mock, callCount)
        break
      case 'error':
        try {
          response = this.handleErrorMock(mock)
        } catch (e) {
          error = e instanceof Error ? e : new Error(String(e))
        }
        break
      case 'itemReader':
        response = this.handleItemReaderMock(mock)
        break
      default:
        throw new Error(`Unknown mock type: ${(mock as MockDefinition).type}`)
    }

    this.state.history.push({
      state: stateName,
      input,
      output: error ? { error: error.message } : response,
      timestamp: new Date(),
      error: error
        ? {
            type: (error as Error & { type?: string }).type || 'Error',
            message: error.message,
            cause: (error as Error & { cause?: string }).cause,
          }
        : undefined,
    })

    if (delay && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    if (error) {
      throw error
    }

    return response
  }

  private findMock(stateName: string): MockDefinition | undefined {
    const override = this.overrides.get(stateName)
    if (override) {
      return override
    }

    return this.config.mocks.find((mock) => mock.state === stateName)
  }

  private handleFixedMock(mock: MockDefinition): JsonValue {
    if (mock.type !== 'fixed') {
      throw new Error(`Expected fixed mock but got ${mock.type}`)
    }
    let response = mock.response

    if (response === undefined && mock.responseFile) {
      response = this.loadResponseFromFile(mock.responseFile, mock.responseFormat)
    }

    return JSON.parse(JSON.stringify(response))
  }

  private handleConditionalMock(
    mock: MockDefinition,
    input: JsonValue,
  ): { response: JsonValue; delay?: number } {
    if (mock.type !== 'conditional') {
      throw new Error(`Expected conditional mock but got ${mock.type}`)
    }
    if (process.env.DEBUG_OUTPUT_PATH) {
      console.log(`Checking ${mock.conditions.length} conditions for state: ${mock.state}`)
    }
    for (const condition of mock.conditions) {
      if (condition.when) {
        const matches = this.matchesCondition(input, condition.when)
        if (process.env.DEBUG_OUTPUT_PATH) {
          console.log('Condition:', JSON.stringify(condition.when, null, 2))
          console.log('Matches:', matches)
        }
        if (matches) {
          if (condition.error) {
            const error = new Error(
              condition.error.message || condition.error.cause || 'Mock error',
            )
            Object.assign(error, { type: condition.error.type })
            Object.assign(error, { cause: condition.error.cause })
            throw error
          }

          let response = condition.response

          if (response === undefined && condition.responseFile) {
            response = this.loadResponseFromFile(condition.responseFile, condition.responseFormat)
          }

          return {
            response: JSON.parse(JSON.stringify(response)),
            delay: condition.delay,
          }
        }
      } else if (condition.default !== undefined) {
        return {
          response: JSON.parse(JSON.stringify(condition.default)),
          delay: condition.delay,
        }
      }
    }

    throw new Error(`No matching condition for state: ${mock.state}`)
  }

  private handleStatefulMock(mock: MockDefinition, callCount: number): JsonValue {
    if (mock.type !== 'stateful') {
      throw new Error(`Expected stateful mock but got ${mock.type}`)
    }
    let responses = mock.responses

    if (!responses && mock.responsesFile) {
      const data = this.loadResponseFromFile(mock.responsesFile, mock.responseFormat)
      responses = Array.isArray(data) ? data : [data]
    }

    if (!responses || responses.length === 0) {
      throw new Error(`No responses defined for stateful mock: ${mock.state}`)
    }

    const index = callCount % responses.length
    const response = responses[index]

    if (response && typeof response === 'object' && 'error' in response && response.error) {
      const errorObj = response.error as { message?: string; cause?: string; type?: string }
      const error = new Error(errorObj.message || errorObj.cause || 'Mock error')
      Object.assign(error, { type: errorObj.type })
      Object.assign(error, { cause: errorObj.cause })
      throw error
    }

    return JSON.parse(JSON.stringify(response))
  }

  private handleErrorMock(mock: MockDefinition): JsonValue {
    if (mock.type !== 'error') {
      throw new Error(`Expected error mock but got ${mock.type}`)
    }
    const shouldError = mock.probability ? Math.random() < mock.probability : true

    if (shouldError) {
      const error = new Error(mock.error.message || mock.error.cause || 'Mock error')
      Object.assign(error, { type: mock.error.type })
      Object.assign(error, { cause: mock.error.cause })
      throw error
    }

    return {}
  }

  private matchesCondition(input: JsonValue, condition: Record<string, JsonValue>): boolean {
    // 明示的にinputフィールドを要求（実パラメータにinputキーを含む場合の曖昧さ回避）
    if (!condition.input) {
      throw new Error(
        `Mock condition must use explicit 'input' field. ` +
          `Example: when: { input: { fieldName: "value" } }`,
      )
    }

    return this.partialDeepEqual(condition.input, input)
  }

  private partialDeepEqual(expected: JsonValue, actual: JsonValue): boolean {
    if (expected === actual) return true
    if (typeof expected !== typeof actual) return false
    if (typeof expected !== 'object' || expected === null || actual === null) return false

    // Handle arrays separately
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false
      if (expected.length !== actual.length) return false
      return expected.every((item, index) => this.partialDeepEqual(item, actual[index]))
    }

    // 部分一致：expectedの全キーがactualに存在し、値が一致すればOK
    if (!isJsonObject(expected) || !isJsonObject(actual)) return false

    const expectedObj = expected
    const actualObj = actual

    for (const key of Object.keys(expectedObj)) {
      if (!(key in actualObj)) return false
      const expectedValue = expectedObj[key]
      const actualValue = actualObj[key]
      if (expectedValue === undefined || actualValue === undefined) {
        if (expectedValue !== actualValue) return false
      } else if (!this.partialDeepEqual(expectedValue, actualValue)) {
        return false
      }
    }

    return true
  }

  getHistory(): MockState['history'] {
    return this.state.history
  }

  private loadResponseFromFile(
    filePath: string,
    format?: 'json' | 'csv' | 'jsonl' | 'yaml',
  ): JsonValue {
    const cacheKey = `${filePath}:${format || 'auto'}`
    if (this.responseCache.has(cacheKey)) {
      return this.responseCache.get(cacheKey) ?? ({} as JsonValue)
    }

    try {
      const data = this.fileLoader.loadFromFile(filePath, format)
      this.responseCache.set(cacheKey, data)
      return data
    } catch (error) {
      console.error(`Failed to load mock data from file: ${filePath}`, error)
      throw error
    }
  }

  clearCache(): void {
    this.responseCache.clear()
  }

  setBasePath(basePath: string): void {
    this.fileLoader.setBasePath(basePath)
  }

  private handleItemReaderMock(mock: MockDefinition): JsonValue {
    if (mock.type !== 'itemReader') {
      throw new Error(`Expected itemReader mock but got ${mock.type}`)
    }
    if (mock.data) {
      return JSON.parse(JSON.stringify(mock.data))
    }

    if (mock.dataFile) {
      const data = this.loadResponseFromFile(mock.dataFile, mock.dataFormat)
      return data
    }

    throw new Error(`ItemReader mock for state '${mock.state}' has neither data nor dataFile`)
  }

  reset(): void {
    this.state.callCount.clear()
    this.state.history = []
  }
}
