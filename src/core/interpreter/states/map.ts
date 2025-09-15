import type {
  DistributedMapState,
  ExecutionContext,
  ItemBatcher,
  ItemReader,
  JsonArray,
  JsonObject,
  JsonValue,
  StateMachine,
  ToleranceConfig,
} from '../../../types/asl'
import type { MapState } from '../../../types/state-classes'
import type { MockEngine } from '../../mock/engine'
import { ItemReaderValidator } from '../../mock/item-reader-validator'
import { JSONataEvaluator } from '../expressions/jsonata'
import type { ItemProcessorContext } from '../item-processor-runner'
import { ItemProcessorRunner } from '../item-processor-runner'
import { JSONPathProcessor } from '../utils/jsonpath-processor'
import { JSONPathUtils } from '../utils/jsonpath-utils'
// Removed import - functions moved to this file
import type { StateExecutionResult } from './base'
import { BaseStateExecutor } from './base'

/**
 * Mapステートエグゼキュータ
 *
 * 注意: Mapステートは複数のアイテムを並列/逐次処理する特殊なステートであるため、
 * BaseStateExecutorのTemplate Methodパターンを完全には適用せず、
 * 独自のexecuteメソッドを実装しています。
 * ただし、BaseStateExecutorのユーティリティメソッドは活用しています。
 */
export class MapStateExecutor extends BaseStateExecutor<MapState> {
  /**
   * MapはTemplate Methodパターンを使用しないため、executeStateは実装しません
   * 代わりに独自のexecuteメソッドを使用します
   */
  protected executeState(_input: JsonValue, _context: ExecutionContext): Promise<JsonValue> {
    throw new Error(
      'MapStateExecutor uses custom execute method instead of Template Method pattern',
    )
  }
  /**
   * Mapステートの実行: 配列の各要素に対してItemProcessorを実行
   * @override BaseStateExecutor.execute
   */
  async execute(context: ExecutionContext): Promise<StateExecutionResult> {
    // JSONata mode validationはStateFactoryで実施済み
    const contextInput = context.input

    // InputPath処理をstrategyに委譲
    const processedInput = await this.strategy.preprocess(contextInput, this.state, context)

    // Note: Parameters in Map state is applied per item, not to the whole input
    // It's handled in applyItemSelector

    try {
      const items = this.getItemsArray(processedInput, context)

      const maxConcurrency = this.state.MaxConcurrency || items.length
      const results: JsonArray = []

      const iterationPaths: string[][] = []
      const currentStateName = context.currentState

      // For Inline Map with variables, always process sequentially to maintain variable consistency
      // This is the AWS Step Functions behavior
      if (this.state.isInlineMap() && Object.keys(context.variables).length > 0) {
        // Sequential execution - variables are shared and modified in order
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const iterationIndex = i
          let itemInput: JsonValue
          if (this.state.isJSONataState()) {
            itemInput = await this.applyItemSelector(item, iterationIndex, contextInput)
          } else {
            // In JSONPath mode, use Parameters as the item selector
            itemInput = await this.applyParametersAsItemSelector(item, iterationIndex, contextInput)
          }

          const itemContext = {
            ...context,
            currentStatePath: [
              ...(context.currentStatePath || []),
              currentStateName,
              iterationIndex.toString(),
            ],
          }

          const result = await this.processItem(itemInput, itemContext, iterationIndex)

          if (result.executionPath && Array.isArray(result.executionPath)) {
            // Add iteration paths without Map state prefix
            iterationPaths.push(result.executionPath)
          }

          results.push(result.output)
        }
      } else {
        for (let i = 0; i < items.length; i += maxConcurrency) {
          const batch = items.slice(i, i + maxConcurrency)
          const batchPromises = batch.map(async (item, index) => {
            const iterationIndex = index + i
            let itemInput: JsonValue
            if (this.state.isJSONataState()) {
              itemInput = await this.applyItemSelector(item, iterationIndex, contextInput)
            } else {
              // In JSONPath mode, use Parameters as the item selector
              itemInput = await this.applyParametersAsItemSelector(
                item,
                iterationIndex,
                contextInput,
              )
            }

            const itemContext = {
              ...context,
              currentStatePath: [
                ...(context.currentStatePath || []),
                currentStateName,
                iterationIndex.toString(),
              ],
            }

            const result = await this.processItem(itemInput, itemContext, iterationIndex)

            if (result.executionPath && Array.isArray(result.executionPath)) {
              // Add iteration paths without Map state prefix
              iterationPaths.push(result.executionPath)
            }

            return result.output
          })

          const batchResults = await Promise.all(batchPromises)
          results.push(...batchResults)
        }
      }

      // ResultPath/OutputPath処理をstrategyに委譲
      const output = await this.strategy.postprocess(results, contextInput, this.state, context)

      if (context.stateExecutions) {
        // Add Map metadata to the context for TestSuiteRunner to use
        const mapMetadata = {
          type: 'Map',
          state: currentStateName,
          iterationCount: items.length,
          iterationPaths,
        }

        if (!context.mapExecutions) {
          context.mapExecutions = []
        }
        context.mapExecutions.push(mapMetadata)
      }

      return {
        output,
        nextState: this.state.Next,
        executionPath: [currentStateName],
        success: true,
        variables: context.variables,
      }
    } catch (error) {
      console.error(`Map state error in ${context.currentState}:`, error)
      // BaseStateExecutorのhandleErrorを使用
      const errorResult = this.handleError(error, context)
      // MapステートにNextがある場合、それを保持する
      if (!errorResult.nextState && this.state.Next) {
        errorResult.nextState = this.state.Next
      }
      return errorResult
    }
  }

  protected getItemsArray(input: JsonValue, context?: ExecutionContext): JsonArray {
    // JSONataモードでは Items フィールドを優先
    if (this.state.isJSONataState() && 'Items' in this.state && this.state.Items !== undefined) {
      if (Array.isArray(this.state.Items)) {
        return this.state.Items
      }
      return [this.state.Items]
    }

    // JSONPathモードでは ItemsPath を使用
    const itemsPath = 'ItemsPath' in this.state ? this.state.ItemsPath : undefined
    if (!itemsPath) {
      return Array.isArray(input) ? input : [input]
    }

    if (itemsPath === '$') {
      return Array.isArray(input) ? input : [input]
    }

    // itemsPath is guaranteed to be string at this point
    if (typeof itemsPath !== 'string') {
      return Array.isArray(input) ? input : [input]
    }

    try {
      return JSONPathUtils.extractItemsArray(itemsPath, input, context?.variables)
    } catch (_error) {
      // Fallback to single item array if extraction fails
      const result = JSONPathUtils.evaluateFirst(itemsPath, input, []) ?? []
      return Array.isArray(result) ? result : [result]
    }
  }

  private async applyParametersAsItemSelector(
    item: JsonValue,
    index: number,
    contextInput: JsonValue,
  ): Promise<JsonValue> {
    // Check both Parameters and ItemSelector fields (ItemSelector is also used in JSONPath mode)
    const parameters = 'Parameters' in this.state ? this.state.Parameters : undefined
    const itemSelector = 'ItemSelector' in this.state ? this.state.ItemSelector : undefined
    const parametersOrItemSelector = parameters || itemSelector
    if (!parametersOrItemSelector) {
      return item
    }

    const context = {
      Map: {
        Item: {
          Index: index,
          Value: item,
        },
      },
      Input: contextInput,
    }

    return await this.processItemSelector(parametersOrItemSelector, item, context)
  }

  private async applyItemSelector(
    item: JsonValue,
    index: number,
    contextInput: JsonValue,
  ): Promise<JsonValue> {
    const itemSelector = 'ItemSelector' in this.state ? this.state.ItemSelector : undefined
    if (!itemSelector) {
      return item
    }

    const context = {
      Map: {
        Item: {
          Index: index,
          Value: item,
        },
      },
      Input: contextInput,
    }

    return await this.processItemSelector(itemSelector, item, context)
  }

  protected async processItemSelector(
    selector: JsonValue,
    item: JsonValue,
    context: JsonObject,
  ): Promise<JsonValue> {
    if (selector === null) {
      return selector
    }

    if (typeof selector === 'string') {
      // Try to process as Map context selector first
      const contextSelectorResult = processMapContextSelector(selector, item, context)
      if (contextSelectorResult !== null) {
        return contextSelectorResult
      }

      if (selector.startsWith('{%') && selector.endsWith('%}')) {
        // JSONata式の評価
        const jsonataExpr = selector.slice(2, -2).trim()

        // Map.Item コンテキストでのJSONata評価
        const bindings = {
          states: {
            input: item,
            context: context,
          },
        }

        const result = await JSONataEvaluator.evaluate(jsonataExpr, item, bindings)
        // undefinedはnullとして扱う
        return result === undefined ? null : result
      }
      if (selector.endsWith('.$')) {
        return JSONPathProcessor.processEntry(selector, selector, item).value
      }
      return selector
    }

    if (Array.isArray(selector)) {
      return await Promise.all(selector.map((s) => this.processItemSelector(s, item, context)))
    }

    if (typeof selector === 'object') {
      const processedEntries: JsonObject = {}
      for (const [key, value] of Object.entries(selector)) {
        const processedValue = await this.processItemSelector(value, item, context)
        const processed = JSONPathProcessor.processEntry(key, processedValue, item)
        processedEntries[processed.key] = processed.value
      }
      return processedEntries
    }

    return selector
  }

  private async processItem(
    itemInput: JsonValue,
    context: ExecutionContext,
    iterationIndex?: number,
  ): Promise<StateExecutionResult> {
    // ItemProcessorはMap stateクラスで必ず正規化されている
    const processor = this.state.ItemProcessor

    if (!processor) {
      return { output: itemInput, executionPath: [], success: true }
    }

    // Use ItemProcessorRunner instead of StateMachineExecutor to avoid circular dependency
    // Pass QueryLanguage from Map state to ItemProcessor
    // ItemProcessor doesn't have QueryLanguage in the interface, but ItemProcessorRunner can handle it
    if (this.state.QueryLanguage && !('QueryLanguage' in processor)) {
      Object.assign(processor, { QueryLanguage: this.state.QueryLanguage })
    }
    const runner = new ItemProcessorRunner(processor, this.mockEngine)

    // For Inline Map (default), pass variables context to allow access to outer scope
    let processorContext: ItemProcessorContext
    if (this.state.isInlineMap()) {
      // Create a shallow copy of variables to maintain read access but prevent modification
      // Each iteration gets its own variable scope that inherits from parent
      processorContext = {
        input: itemInput,
        variables: { ...context.variables }, // Shallow copy for isolation
        originalInput: itemInput,
      }
    } else {
      processorContext = {
        input: itemInput,
        variables: {},
        originalInput: itemInput,
      }
    }

    const result = await runner.executeWithContext(processorContext)

    if (!result.success) {
      // For now, we'll just throw the error
      throw new Error(`Item processing failed: ${result.error}`)
    }

    // Variables in Map iterations should have their own scope
    // According to AWS documentation, Map iterations can read outer scope variables
    // but cannot modify them. Each iteration maintains its own variable scope.
    // We should NOT merge variables back to parent context.

    if (context.stateExecutions && result.executionPath) {
      for (const stateName of result.executionPath) {
        const stateExecution = {
          statePath: [
            ...(context.currentStatePath || []),
            context.currentState,
            iterationIndex?.toString() || '0',
            stateName,
          ],
          state: stateName,
          input: itemInput,
          output: result.output,
          variablesBefore: processorContext.variables,
          variablesAfter: result.variables || {},
        }
        context.stateExecutions.push(stateExecution)
      }
    }

    return { output: result.output, executionPath: result.executionPath || [], success: true }
  }
}

/**
 * Distributed Map State Executor
 * Handles large-scale parallel processing with external data sources
 *
 * 注意: DistributedMapもMap同様に特殊なステートであり、
 * 独自のexecuteメソッドを実装しています。
 */
export class DistributedMapStateExecutor extends MapStateExecutor {
  // DistributedMapState専用の型を明確化
  protected readonly state: DistributedMapState

  constructor(state: DistributedMapState, mockEngine?: MockEngine, stateMachine?: StateMachine) {
    super(state, mockEngine, stateMachine)
    this.state = state
  }

  /**
   * DistributedMapもTemplate Methodパターンを使用しません
   * MapStateExecutorのexecuteStateを継承
   */
  /**
   * DistributedMapステートの実行: 大規模データの並列処理
   * @override MapStateExecutor.execute
   */
  async execute(context: ExecutionContext): Promise<StateExecutionResult> {
    // Always use distributed execution for DistributedMapStateExecutor
    // The ProcessorMode check is already done when choosing the executor
    return await this.executeDistributed(context)
  }

  private async executeDistributed(context: ExecutionContext): Promise<StateExecutionResult> {
    // JSONataモードの制約はStateFactoryで検証済み

    // InputPath処理をstrategyに委譲
    const processedInput = await this.strategy.preprocess(context.input, this.state, context)

    // Note: Parameters in Map state is applied per item, not to the whole input
    // It's handled later in the item processing loop

    try {
      const items = this.getItems(processedInput, context)

      // When ItemBatcher is configured, createBatches returns objects like { Items: [...] }
      // When not configured, we wrap each item for consistent processing
      const batches =
        'ItemBatcher' in this.state && this.state.ItemBatcher
          ? createItemBatches(items, this.state.ItemBatcher)
          : items // Keep items as-is for individual processing

      const maxConcurrency = this.state.MaxConcurrency || 1000
      const results: JsonArray = []
      let failedCount = 0
      const totalCount = items.length
      const batchCount = batches.length

      const iterationPaths: string[][] = []
      const currentStateName = context.currentState

      for (let i = 0; i < batches.length; i += maxConcurrency) {
        const batchSlice = batches.slice(i, Math.min(i + maxConcurrency, batches.length))
        const batchPromises = batchSlice.map(async (batch, index) => {
          const iterationIndex = index + i

          let batchInput: JsonValue
          if ('ItemBatcher' in this.state && this.state.ItemBatcher) {
            // Batch is already an object like { Items: [...] } from createBatches
            batchInput = batch
          } else {
            if (this.state.isJSONataState()) {
              if ('ItemSelector' in this.state && this.state.ItemSelector) {
                batchInput = await this.applyItemSelectorInJSONata(
                  batch,
                  iterationIndex,
                  processedInput,
                )
              } else {
                batchInput = batch
              }
            } else {
              if ('Parameters' in this.state && this.state.Parameters) {
                // Apply Parameters for JSONPath mode (it's the item selector for JSONPath)
                batchInput = this.applyParametersToItem(batch, iterationIndex, processedInput)
              } else {
                batchInput = batch
              }
            }
          }

          const itemProcessor = this.state.ItemProcessor
          if (!itemProcessor) {
            throw new Error('ItemProcessor is required for Map state')
          }

          // Distributed Map: Each child execution has isolated scope (no access to outer variables)
          const itemProcessorContext: ItemProcessorContext = {
            input: batchInput,
            variables: {},
            originalInput: batchInput,
          }

          // Use ItemProcessorRunner to avoid circular dependency
          const runner = new ItemProcessorRunner(itemProcessor, this.mockEngine)
          const result = await runner.executeWithContext(itemProcessorContext)

          if (!result.success) {
            // Store error information for later processing
            return { error: result.error || 'Item processing failed', failed: true }
          }

          if (result.executionPath) {
            iterationPaths.push(result.executionPath)
          }

          // Track state executions for Distributed Map ItemProcessor
          if (context.stateExecutions && result.executionPath) {
            for (const stateName of result.executionPath) {
              const stateExecution = {
                statePath: [
                  ...(context.currentStatePath || []),
                  currentStateName,
                  iterationIndex.toString(),
                  stateName,
                ],
                state: stateName,
                input: batchInput,
                output: result.output,
                variablesBefore: {},
                variablesAfter: result.variables || {},
              }
              context.stateExecutions.push(stateExecution)
            }
          }

          // For Distributed Map, each batch may contain multiple items
          // The result should be flattened to individual item results
          if (Array.isArray(result.output)) {
            return result.output
          } else {
            // Single result - expand it to match the batch size
            const batchSize =
              batch && typeof batch === 'object' && 'Items' in batch && Array.isArray(batch.Items)
                ? batch.Items.length
                : Array.isArray(batch)
                  ? batch.length
                  : 1
            return Array(batchSize).fill(result.output)
          }
        })

        const batchResults = await Promise.all(batchPromises)
        for (const batchResult of batchResults) {
          if (batchResult !== null) {
            // Check if this is an error result
            if (typeof batchResult === 'object' && 'failed' in batchResult && batchResult.failed) {
              failedCount++
            } else if (Array.isArray(batchResult)) {
              results.push(...batchResult)
            } else {
              results.push(batchResult)
            }
          }
        }
      }

      // Check failure tolerance after all items are processed
      if (failedCount > 0 && this.shouldFailExecution(failedCount, totalCount, processedInput)) {
        throw new Error('ProcessingError: State failed')
      }

      let outputData: JsonValue
      if ('ResultWriter' in this.state && this.state.ResultWriter) {
        // When ResultWriter is configured, write results and return metadata
        this.writeResults(results)

        // Return metadata object instead of results array
        outputData = {
          ProcessedItemCount: results.length,
          ResultWriterDetails: {
            Bucket: this.state.ResultWriter.WriterConfig?.Bucket || 'mock-bucket',
            Prefix: this.state.ResultWriter.WriterConfig?.Prefix || 'mock-prefix',
          },
        }
      } else {
        // Without ResultWriter, return the results array directly
        outputData = results
      }

      // ResultPath/OutputPath処理をstrategyに委譲
      const output = await this.strategy.postprocess(outputData, context.input, this.state, context)

      if (context.mapExecutions) {
        const mapMetadata = {
          type: 'Map',
          state: currentStateName,
          processorMode: 'DISTRIBUTED',
          iterationCount: batchCount,
          itemCount: totalCount,
          resultCount: results.length,
          iterationPaths,
        }
        context.mapExecutions.push(mapMetadata)
      }

      // Flatten child execution paths for overall execution tracking
      const flattenedChildPaths = [...new Set(iterationPaths.flat())]

      return {
        output,
        executionPath: [currentStateName, ...flattenedChildPaths],
        success: true,
        nextState: this.state.Next,
      }
    } catch (error) {
      // TypeScript catch always produces unknown type, need to safely convert
      return super.handleError(error, context)
    }
  }

  private getItems(input: JsonValue, context: ExecutionContext): JsonArray {
    if ('ItemReader' in this.state && this.state.ItemReader) {
      return this.readItemsFromDataSource(this.state.ItemReader, context)
    }

    // Fall back to ItemsPath or direct array
    const items = this.getItemsArrayForDistributed(input)
    if (!Array.isArray(items)) {
      throw new Error('Expected array from getItemsArrayForDistributed')
    }
    return items
  }

  private readItemsFromDataSource(itemReader: ItemReader, context: ExecutionContext): JsonArray {
    const validationResult = ItemReaderValidator.validateAndTransform([], itemReader)
    if (validationResult.errors && validationResult.errors.length > 0) {
      throw new Error(`Invalid ItemReader configuration: ${validationResult.errors.join(', ')}`)
    }

    if (this.mockEngine) {
      const config = {
        ...(itemReader.ReaderConfig || {}),
        ...('Parameters' in itemReader ? itemReader.Parameters : {}),
      }
      const mockData = this.mockEngine.getMockData({
        state: context.currentState,
        type: 'itemReader',
        resource: itemReader.Resource,
        config: config,
      })
      if (mockData) {
        if (!Array.isArray(mockData)) {
          throw new Error('ItemReader mock must return an array')
        }
        return mockData
      }
    }

    const resource = itemReader.Resource
    return getDefaultMockDataForResource(resource)
  }

  private shouldFailExecution(failedCount: number, totalCount: number, input: JsonValue): boolean {
    // Pick tolerance properties from this.state
    const toleranceProps: Pick<DistributedMapState, keyof ToleranceConfig> = {
      ToleratedFailureCount: this.state.ToleratedFailureCount,
      ToleratedFailureCountPath: this.state.ToleratedFailureCountPath,
      ToleratedFailurePercentage: this.state.ToleratedFailurePercentage,
      ToleratedFailurePercentagePath: this.state.ToleratedFailurePercentagePath,
    }

    // Filter out undefined values
    const config = Object.fromEntries(
      Object.entries(toleranceProps).filter(([_, value]) => value !== undefined),
    )

    return shouldFailExecution(failedCount, totalCount, input, config)
  }

  private writeResults(results: JsonArray): void {
    const writer = this.state.ResultWriter

    if (!writer) {
      return
    }

    // If mock engine has a writeResults method, use it
    if (this.mockEngine && 'writeResults' in this.mockEngine) {
      this.mockEngine.writeResults({
        state: 'DistributedMap',
        type: 'resultWriter',
        resource: writer.Resource,
        config: writer.WriterConfig,
        results,
      })
      return
    }

    console.log(`Writing ${results.length} results to ${writer.Resource}`)
    if (writer.WriterConfig?.Bucket) {
      console.log(`Bucket: ${writer.WriterConfig.Bucket}`)
      console.log(`Prefix: ${writer.WriterConfig.Prefix || ''}`)
    }
  }

  private getItemsArrayForDistributed(input: JsonValue): JsonArray {
    // ItemsPath is only available in JSONPath mode
    if (this.state.isJSONataState()) {
      return Array.isArray(input) ? input : [input]
    }

    if (!('ItemsPath' in this.state && this.state.ItemsPath)) {
      return Array.isArray(input) ? input : [input]
    }

    if (this.state.ItemsPath === '$') {
      return Array.isArray(input) ? input : [input]
    }

    try {
      return JSONPathUtils.extractItemsArray(this.state.ItemsPath, input)
    } catch (_error) {
      // Fallback to single item array if extraction fails
      const result = JSONPathUtils.evaluateFirst(this.state.ItemsPath, input, []) ?? []
      return Array.isArray(result) ? result : [result]
    }
  }

  private async applyItemSelectorInJSONata(
    item: JsonValue,
    index: number,
    contextInput: JsonValue,
  ): Promise<JsonValue> {
    // ItemSelector is only available in JSONata mode
    if (!this.state.isJSONataState()) {
      return item
    }

    if (!('ItemSelector' in this.state && this.state.ItemSelector)) {
      return item
    }

    const context = {
      Map: {
        Item: {
          Index: index,
          Value: item,
        },
      },
      Input: contextInput,
    }

    return await this.processItemSelector(this.state.ItemSelector, item, context)
  }

  private applyParametersToItem(
    item: JsonValue,
    index: number,
    contextInput: JsonValue,
  ): JsonValue {
    // Parameters is only available in JSONPath mode
    if (this.state.isJSONataState()) {
      return item
    }

    if (!('Parameters' in this.state && this.state.Parameters)) {
      return item
    }

    const context = {
      Map: {
        Item: {
          Index: index,
          Value: item,
        },
      },
      Input: contextInput,
    }

    // Process Parameters field similar to Map state's ItemSelector
    return this.processParametersForItem(this.state.Parameters, item, context)
  }

  private processParametersForItem(
    parameters: JsonValue,
    item: JsonValue,
    context: JsonValue,
  ): JsonValue {
    if (parameters === null) {
      return parameters
    }

    if (typeof parameters === 'string') {
      if (parameters === '$$') {
        return context
      }
      if (parameters === '$$.Map.Item.Value') {
        return item
      }
      if (parameters === '$$.Map.Item.Index') {
        if (typeof context !== 'object' || context === null || Array.isArray(context)) {
          return null
        }
        const typedContext = context
        if (
          !typedContext.Map ||
          typeof typedContext.Map !== 'object' ||
          Array.isArray(typedContext.Map)
        ) {
          return null
        }
        const mapContext = typedContext.Map
        if (
          !mapContext.Item ||
          typeof mapContext.Item !== 'object' ||
          Array.isArray(mapContext.Item)
        ) {
          return null
        }
        const itemContext = mapContext.Item
        return itemContext.Index
      }
      if (parameters.startsWith('$$.')) {
        return JSONPathUtils.evaluateWithContext(parameters, item, context)
      }
      if (parameters.endsWith('.$')) {
        return JSONPathProcessor.processEntry(parameters, parameters, item).value
      }
      return parameters
    }

    if (Array.isArray(parameters)) {
      return parameters.map((p) => this.processParametersForItem(p, item, context))
    }

    if (typeof parameters === 'object') {
      const processedEntries: JsonObject = {}
      for (const [key, value] of Object.entries(parameters)) {
        const processedValue = this.processParametersForItem(value, item, context)
        const processed = JSONPathProcessor.processEntry(key, processedValue, item)
        processedEntries[processed.key] = processed.value
      }
      return processedEntries
    }

    return parameters
  }
}

// ========= Helper Functions (moved from map-helpers.ts) =========

/**
 * Calculate if execution should fail based on tolerance settings
 */
function shouldFailExecution(
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
function createItemBatches(items: JsonArray, batcherConfig?: ItemBatcher): JsonArray {
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
function processMapContextSelector(
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
    if (!context.Map || typeof context.Map !== 'object' || Array.isArray(context.Map)) {
      return null
    }
    const mapContext = context.Map
    if (!mapContext.Item || typeof mapContext.Item !== 'object' || Array.isArray(mapContext.Item)) {
      return null
    }
    const itemContext = mapContext.Item
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
function getDefaultMockDataForResource(resource: string): JsonArray {
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
