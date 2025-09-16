import { buildExecutionId, EXECUTION_CONTEXT_DEFAULTS } from '../../constants/execution-context'
import type {
  MockConfig,
  MockDefinition,
  MockEngineOptions,
  MockState,
} from '../../schemas/mock-schema'
import { mockConfigSchema } from '../../schemas/mock-schema'
import type { ItemReader, JsonArray, JsonValue, State } from '../../types/asl'
import { isJsonObject, isJsonValue } from '../../types/type-guards'
import { MockFileLoader } from './file-loader'
import { ItemReaderValidator } from './item-reader-validator'

/**
 * モックエンジン - ステートマシンテスト用のモックデータ管理
 */
export class MockEngine {
  private config: MockConfig
  private state: MockState
  private overrides: Map<string, MockDefinition> = new Map()
  private fileLoader: MockFileLoader
  private responseCache: Map<string, JsonValue> = new Map()

  constructor(config: unknown, options: MockEngineOptions = {}) {
    const parseResult = mockConfigSchema.safeParse(config)
    if (!parseResult.success) {
      throw new Error(`Invalid mock config: ${parseResult.error.message}`)
    }
    this.config = parseResult.data
    this.state = {
      callCount: new Map(),
      history: [],
    }
    this.fileLoader = new MockFileLoader(options.basePath)
  }

  /**
   * モックオーバーライドを設定
   * @param overrides オーバーライドするモック定義
   */
  setMockOverrides(overrides: MockDefinition[]): void {
    this.overrides.clear()
    for (const override of overrides) {
      this.overrides.set(override.state, override)
    }
  }

  /**
   * モックオーバーライドをクリア
   */
  clearMockOverrides(): void {
    this.overrides.clear()
  }

  /**
   * Reset the call counts for all stateful mocks.
   * This should be called between test cases to ensure each test starts fresh.
   */
  resetCallCounts(): void {
    this.state.callCount.clear()
  }

  /**
   * モックデータを取得（ItemReaderや固定レスポンス用）
   * @param params モックパラメータ
   * @returns モックデータ
   */
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
      let data: JsonValue | undefined = mock.data

      if (!data && mock.dataFile) {
        const format = mock.dataFormat || this.getFormatFromItemReader(params.itemReader)
        const loadedData = this.loadResponseFromFile(mock.dataFile, format)
        if (!Array.isArray(loadedData)) {
          throw new Error(
            `ItemReader mock data must be an array, got ${typeof loadedData} from file: ${mock.dataFile}`,
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
      let data: JsonValue | undefined = mock.response

      if (!data && mock.responseFile) {
        const format = this.getFormatFromItemReader(params.itemReader) || mock.responseFormat
        data = this.loadResponseFromFile(mock.responseFile, format)
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

  /**
   * ItemReaderからフォーマットを推測
   */
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
      const formatMap = {
        CSV: 'csv',
        JSON: 'json',
        JSONL: 'jsonl',
        MANIFEST: 'json',
      } as const

      return config.InputType
        ? formatMap[config.InputType]
        : config.CSVHeaderLocation
          ? 'csv'
          : 'json'
    }

    return 'json'
  }

  /**
   * 結果を記録（ResultWriter用）
   * @param params 書き込みパラメータ
   */
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

  /**
   * ステートに対するモックレスポンスを取得
   * @param stateName ステート名
   * @param input 入力データ
   * @param state ステート定義（デフォルトモック生成用）
   * @returns モックレスポンス
   */
  async getMockResponse(stateName: string, input: JsonValue, state?: State): Promise<JsonValue> {
    const mock = this.findMock(stateName)
    if (!mock) {
      if (process.env.DEBUG_OUTPUT_PATH) {
        console.log(`No mock found for state: ${stateName}, using default mock`)
        console.log(
          'Available mocks:',
          this.config.mocks.map((m) => m.state),
        )
      }
      if (state) {
        return this.generateDefaultMock(state, input)
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
      default: {
        const _exhaustiveCheck: never = mock
        return _exhaustiveCheck
      }
    }

    this.state.history.push({
      state: stateName,
      input,
      output: error ? { error: error.message } : response,
      timestamp: new Date(),
      error: error
        ? {
            type: 'type' in error && typeof error.type === 'string' ? error.type : 'Error',
            message: error.message,
            cause: 'cause' in error && typeof error.cause === 'string' ? error.cause : undefined,
          }
        : undefined,
    })

    if (delay && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    if (error) {
      throw error
    }

    if (process.env.DEBUG_OUTPUT_PATH) {
      console.log(`Mock response for ${stateName}:`, JSON.stringify(response, null, 2))
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

    if (process.env.DEBUG_OUTPUT_PATH) {
      console.log(
        `Stateful mock for ${mock.state}: returning response #${index + 1} of ${responses.length}`,
      )
      console.log('Response:', JSON.stringify(response, null, 2))
    }

    if (isJsonObject(response) && 'error' in response && response.error) {
      const errorObj = response.error

      const message =
        isJsonObject(errorObj) && typeof errorObj.message === 'string'
          ? errorObj.message
          : undefined

      const cause =
        isJsonObject(errorObj) && typeof errorObj.cause === 'string' ? errorObj.cause : undefined

      const type =
        isJsonObject(errorObj) && typeof errorObj.type === 'string' ? errorObj.type : undefined

      const error = new Error(message || cause || 'Mock error')
      if (type) Object.assign(error, { type })
      if (cause) Object.assign(error, { cause })
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
    // Require explicit 'input' field to avoid ambiguity when actual parameters contain 'input' key
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

    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false
      if (expected.length !== actual.length) return false
      return expected.every((item, index) => this.partialDeepEqual(item, actual[index]))
    }

    // Partial deep equal: all keys in expected must exist in actual with matching values
    if (!(isJsonObject(expected) && isJsonObject(actual))) return false

    for (const key of Object.keys(expected)) {
      if (!(key in actual)) return false
      const expectedValue = expected[key]
      const actualValue = actual[key]
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
      return this.responseCache.get(cacheKey) ?? {}
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

  private generateDefaultMock(state: State, input: JsonValue): JsonValue {
    // Map and DistributedMap states return empty array
    if (state.isMap()) {
      const isDistributed = state.isDistributedMap()
      if (process.env.DEBUG_OUTPUT_PATH) {
        console.log(
          `Generating default mock for ${isDistributed ? 'DistributedMap' : 'Map'} state: []`,
        )
      }
      return []
    }

    // Parallel states return array with input for each branch
    if (state.isParallel()) {
      const result = state.Branches.map(() => input)
      if (process.env.DEBUG_OUTPUT_PATH) {
        console.log(
          `Generating default mock for Parallel state with ${state.Branches.length} branches`,
        )
      }
      return result
    }

    // Task state: Generate service-specific response format
    if (state.isTask() && state.Resource) {
      const resource = state.Resource

      // Lambda invoke integration wraps in Payload
      if (resource.includes('lambda:invoke')) {
        if (process.env.DEBUG_OUTPUT_PATH) {
          console.log('Generating default mock for Lambda invoke: wrapping in Payload')
        }
        return {
          Payload: input,
          StatusCode: 200,
          ExecutedVersion: '$LATEST',
        }
      }

      // Step Functions startExecution patterns
      if (resource.includes('states:startExecution')) {
        // Extract the Input field if it exists (this is what would be passed to child state machine)
        const childInput = isJsonObject(input) && 'Input' in input ? input.Input : input

        if (resource.includes('.sync:2')) {
          if (process.env.DEBUG_OUTPUT_PATH) {
            console.log('Generating default mock for Step Functions sync:2: Output as JSON')
          }
          return {
            Output: childInput,
            ExecutionArn: buildExecutionId(),
            StartDate: EXECUTION_CONTEXT_DEFAULTS.START_TIME,
            StopDate: EXECUTION_CONTEXT_DEFAULTS.STOP_TIME,
            Status: 'SUCCEEDED',
          }
        }
        if (resource.includes('.sync')) {
          if (process.env.DEBUG_OUTPUT_PATH) {
            console.log('Generating default mock for Step Functions sync: Output as string')
          }
          return {
            Output: JSON.stringify(childInput),
            ExecutionArn: buildExecutionId(),
            StartDate: EXECUTION_CONTEXT_DEFAULTS.START_TIME,
            StopDate: EXECUTION_CONTEXT_DEFAULTS.STOP_TIME,
            Status: 'SUCCEEDED',
          }
        }
        // Async startExecution
        if (process.env.DEBUG_OUTPUT_PATH) {
          console.log('Generating default mock for Step Functions async')
        }
        return {
          ExecutionArn: buildExecutionId(),
          StartDate: EXECUTION_CONTEXT_DEFAULTS.START_TIME,
        }
      }
    }

    // Default: return input as-is
    if (process.env.DEBUG_OUTPUT_PATH) {
      console.log('Generating default mock: returning input as-is')
    }
    return input
  }
}
