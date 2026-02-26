import {
  isChoice,
  isDistributedMap,
  isJSONataState,
  isMap,
  isTask,
  type JsonObject,
  type JsonValue,
  type MapState,
  type State,
  type StateMachine,
} from '../../../types/asl'
import { StateFilters, traverseStates } from '../../utils/state-traversal'
import type { InputRequirement, ItemProcessorAnalysis } from '../data-flow-analyzer'
import { DataFlowHelpers } from './data-flow-helpers'

export class ItemProcessorAnalyzer {
  private stateMachine: StateMachine

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine
  }

  /**
   * Analyze all DistributedMap states in a state machine
   */
  analyzeAllItemProcessors(): ItemProcessorAnalysis[] {
    const analyses: ItemProcessorAnalysis[] = []

    traverseStates(this.stateMachine, (stateName, state, _context) => {
      if (StateFilters.isDistributedMap(stateName, state, _context)) {
        // isDistributedMap ensures this is a Map state
        if (!isMap(state)) return undefined
        const analysis = this.analyzeItemProcessorInput(state)
        if (analysis) {
          analysis.stateName = stateName
          analyses.push(analysis)
        }
      }
      return undefined
    })

    return analyses
  }

  /**
   * Analyze ItemProcessor to determine expected input structure based on AWS Step Functions specification
   *
   * Data flow:
   * - InlineMap (with ItemSelector): Context object → ItemSelector → ItemProcessor ($states.input)
   * - InlineMap (without ItemSelector): Array element directly → ItemProcessor ($states.input)
   * - DistributedMap (with ItemSelector): ItemReader → ItemSelector → Child workflow ($states.input)
   * - DistributedMap (without ItemSelector): ItemReader → Child workflow ($states.input directly)
   */
  analyzeItemProcessorInput(mapState: MapState): ItemProcessorAnalysis | null {
    if (!(isMap(mapState) && mapState.ItemProcessor)) {
      return null
    }
    const processor = mapState.ItemProcessor

    const requirements: InputRequirement[] = []
    const sampleInput: JsonObject = {}

    const isDistributedMapState = isDistributedMap(mapState)
    const mapIsJSONata = isJSONataState(mapState)

    if ('ItemSelector' in mapState && mapState.ItemSelector) {
      // ItemSelector transforms data before passing to ItemProcessor
      // Both InlineMap and DistributedMap ItemSelector use Context object references ($$.Map.Item.Value.*)
      this.analyzeInlineMapItemSelector(
        mapState.ItemSelector,
        requirements,
        sampleInput,
        mapIsJSONata,
      )

      // Also analyze ItemProcessor to see what fields it accesses from ItemSelector output
      // This helps detect cases where ItemSelector references entire objects and ItemProcessor accesses nested fields
      this.analyzeItemProcessorForItemSelectorOutput(
        processor.States,
        requirements,
        sampleInput,
        mapIsJSONata,
      )
    } else {
      // No ItemSelector: ItemProcessor receives data directly
      if (isDistributedMapState) {
        // DistributedMap: ItemReader data passed directly to child workflow
        this.analyzeItemProcessorForItemReaderData(
          processor.States,
          requirements,
          sampleInput,
          mapIsJSONata,
        )
      } else {
        // InlineMap: Array element passed directly to ItemProcessor
        this.analyzeItemProcessorForArrayElement(
          processor.States,
          requirements,
          sampleInput,
          mapIsJSONata,
        )
      }
    }

    const uniqueRequirements = DataFlowHelpers.deduplicateRequirements(requirements)

    return {
      stateName: mapState.Comment || 'ItemProcessor',
      inputRequirements: uniqueRequirements,
      sampleInput,
    }
  }

  /**
   * Analyze InlineMap ItemSelector - transforms Context object data ($$.Map.Item.Value)
   */
  private analyzeInlineMapItemSelector(
    selector: JsonValue | Record<string, JsonValue>,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    if (typeof selector === 'string') {
      // JSONata expression directly
      this.extractInlineMapContextReferences(selector, requirements, sampleInput, isJSONata)
    } else if (typeof selector === 'object' && selector !== null && !Array.isArray(selector)) {
      // Object with field mappings (exclude arrays) - TypeScript knows this is an object
      this.analyzeInlineMapItemSelectorObject(selector, requirements, sampleInput, isJSONata)
    }
  }

  /**
   * Analyze InlineMap ItemSelector object - looks for Context object references ($$.Map.Item.Value.field)
   */
  private analyzeInlineMapItemSelectorObject(
    selector: Record<string, JsonValue>,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    for (const [_key, value] of Object.entries(selector)) {
      if (typeof value === 'string') {
        // Determine which pattern to use based on content
        if (this.hasContextObjectPattern(value, isJSONata)) {
          // Context object patterns ($$.Map.Item.Value.field or $states.context.Map.Item.Value.field)
          this.extractInlineMapContextReferences(value, requirements, sampleInput, isJSONata)
        } else {
          // Direct field patterns ($.field) - for cases where ItemSelector uses direct references
          this.extractItemReaderDataReferences(value, requirements, sampleInput, isJSONata)
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // valueは非null、非配列のオブジェクト
        this.analyzeInlineMapItemSelectorObject(value, requirements, sampleInput, isJSONata)
      }
    }
  }

  /**
   * Check if expression contains Context object pattern
   */
  private hasContextObjectPattern(expression: string, isJSONata: boolean): boolean {
    if (isJSONata) {
      return expression.includes('$states.context.Map.Item')
    } else {
      return expression.includes('$$.Map.Item')
    }
  }

  /**
   * Extract InlineMap Context object references ($$.Map.Item.Value.field)
   */
  private extractInlineMapContextReferences(
    expression: string,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
    description?: string,
  ): void {
    const defaultDescription = description || 'ItemSelector'
    if (isJSONata) {
      // JSONata mode: $states.context.Map.Item.Value.field
      const contextPattern =
        /\$states\.context\.Map\.Item\.Value\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g
      DataFlowHelpers.extractFieldsFromPattern(
        contextPattern,
        expression,
        requirements,
        sampleInput,
        `${defaultDescription} (JSONata)`,
      )
    } else {
      // JSONPath mode: $$.Map.Item.Value.field
      const contextValuePattern =
        /\$\$\.Map\.Item\.Value\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g
      DataFlowHelpers.extractFieldsFromPattern(
        contextValuePattern,
        expression,
        requirements,
        sampleInput,
        `${defaultDescription} (JSONPath)`,
      )

      // Also handle other Map context patterns like $$.Map.Item.Index (but don't extract fields for these)
      // These are provided by the Step Functions runtime, not from ItemReader data
    }
  }

  /**
   * Extract ItemReader data references for DistributedMap
   */
  private extractItemReaderDataReferences(
    expression: string,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    if (isJSONata) {
      // JSONata: Direct field references or $states.input.field (from ItemReader)
      const fieldMatches = expression.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g)
      if (fieldMatches) {
        for (const match of fieldMatches) {
          const field = match.substring(1)
          if (field && !['states', 'context', 'task', 'map', 'now', 'uuid'].includes(field)) {
            requirements.push({
              field,
              type: 'any',
              required: true,
              description: `Referenced in DistributedMap ItemSelector (JSONata)`,
            })
            if (!sampleInput[field]) {
              sampleInput[field] = DataFlowHelpers.generateSampleValue(field)
            }
          }
        }
      }
    } else {
      // JSONPath: Direct field references like $.field (from ItemReader)
      const fieldPattern = /\$\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g
      DataFlowHelpers.extractFieldsFromPattern(
        fieldPattern,
        expression,
        requirements,
        sampleInput,
        'DistributedMap ItemSelector (JSONPath)',
      )
    }
  }

  /**
   * Analyze ItemProcessor when ItemSelector exists - looks for references to ItemSelector output
   * and traces them back to original ItemReader fields
   */
  private analyzeItemProcessorForItemSelectorOutput(
    states: Record<string, State>,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    for (const [_stateName, state] of Object.entries(states)) {
      this.analyzeStateForItemSelectorReferences(state, requirements, sampleInput, isJSONata)
    }
  }

  /**
   * Analyze ItemProcessor when no ItemSelector and it's DistributedMap (ItemReader data direct access)
   */
  private analyzeItemProcessorForItemReaderData(
    states: Record<string, State>,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    for (const [_stateName, state] of Object.entries(states)) {
      this.analyzeStateForItemReaderDataReferences(state, requirements, sampleInput, isJSONata)
    }
  }

  /**
   * Analyze ItemProcessor when no ItemSelector and it's InlineMap (array element direct access)
   */
  private analyzeItemProcessorForArrayElement(
    states: Record<string, State>,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    for (const [_stateName, state] of Object.entries(states)) {
      this.analyzeStateForArrayElementReferences(state, requirements, sampleInput, isJSONata)
    }
  }

  /**
   * Analyze state for ItemReader data references (DistributedMap child workflow)
   */
  private analyzeStateForItemReaderDataReferences(
    state: State,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    this.analyzeStateForDirectInputReferences(state, requirements, sampleInput, isJSONata)
  }

  /**
   * Analyze state for array element references (InlineMap)
   */
  private analyzeStateForArrayElementReferences(
    state: State,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    this.analyzeStateForDirectInputReferences(state, requirements, sampleInput, isJSONata)
  }

  /**
   * Analyze state for references to ItemSelector output (e.g., $states.input.value.customerId)
   * This traces nested field access back to original ItemReader requirements
   */
  private analyzeStateForItemSelectorReferences(
    state: State,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    this.analyzeStateWithExtractor(
      state,
      requirements,
      sampleInput,
      isJSONata,
      this.extractItemSelectorFieldReferences.bind(this),
    )
  }

  /**
   * Common method to analyze state fields with different extraction strategies
   */
  private analyzeStateWithExtractor(
    state: State,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
    extractor: (
      expression: string | JsonObject,
      requirements: InputRequirement[],
      sampleInput: JsonObject,
      isJSONata: boolean,
    ) => void,
  ): void {
    // Analyze Task state
    if (isTask(state)) {
      if (isJSONata && 'Arguments' in state && state.Arguments) {
        // JSONata mode uses Arguments
        extractor(state.Arguments, requirements, sampleInput, true)
      } else if ('Parameters' in state && state.Parameters) {
        // JSONPath mode uses Parameters
        if (extractor === this.extractDirectInputReferences) {
          // Special handling for direct input analysis
          this.analyzeParametersForDirectInput(state.Parameters, requirements, sampleInput)
        } else {
          // General extraction
          extractor(state.Parameters, requirements, sampleInput, false)
        }
      }
    }

    // Analyze Choice state (JSONata mode only for string expressions)
    if (isChoice(state) && isJSONata) {
      for (const choice of state.Choices) {
        if ('Condition' in choice && choice.Condition && typeof choice.Condition === 'string') {
          extractor(choice.Condition, requirements, sampleInput, true)
        }
      }
    }

    // Analyze other fields like Assign, Output, etc.
    if (state.Assign) {
      for (const [_varName, varValue] of Object.entries(state.Assign)) {
        if (typeof varValue === 'string') {
          extractor(varValue, requirements, sampleInput, isJSONata)
        }
      }
    }

    if ('Output' in state && state.Output && typeof state.Output === 'string' && isJSONata) {
      extractor(state.Output, requirements, sampleInput, true)
    }
  }

  /**
   * Extract field references that go through ItemSelector (e.g., $states.input.value.customerId -> customerId)
   */
  private extractItemSelectorFieldReferences(
    expression: string | JsonObject,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    if (typeof expression === 'string') {
      if (isJSONata) {
        // JSONata mode: Look for $states.input.{key}.{field} patterns
        const itemSelectorPattern =
          /\$states\.input\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g
        let match: RegExpExecArray | null
        // biome-ignore lint/suspicious/noAssignInExpressions: RegEx exec() requires assignment in loop condition
        while ((match = itemSelectorPattern.exec(expression)) !== null) {
          const selectorKey = match[1] // e.g., "value"
          const fieldPath = match[2] // e.g., "customerId" or "order.total"

          if (selectorKey && fieldPath) {
            const topLevelField = fieldPath.split('.')[0]
            if (topLevelField) {
              requirements.push({
                field: topLevelField,
                type: 'any',
                required: true,
                description: `Referenced via ItemSelector.${selectorKey}.${fieldPath} (JSONata)`,
              })

              if (!sampleInput[topLevelField]) {
                if (fieldPath.includes('.')) {
                  sampleInput[topLevelField] = DataFlowHelpers.createNestedSampleObject(fieldPath)
                } else {
                  sampleInput[topLevelField] = DataFlowHelpers.generateSampleValue(topLevelField)
                }
              }
            }
          }
        }
      } else {
        // JSONPath mode: Look for $.{key}.{field} patterns where key comes from ItemSelector
        const itemSelectorPattern =
          /\$\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g
        let match: RegExpExecArray | null
        // biome-ignore lint/suspicious/noAssignInExpressions: RegEx exec() requires assignment in loop condition
        while ((match = itemSelectorPattern.exec(expression)) !== null) {
          const selectorKey = match[1] // e.g., "value"
          const fieldPath = match[2] // e.g., "customerId" or "order.total"

          if (selectorKey && fieldPath) {
            const topLevelField = fieldPath.split('.')[0]
            if (topLevelField) {
              requirements.push({
                field: topLevelField,
                type: 'any',
                required: true,
                description: `Referenced via ItemSelector.${selectorKey}.${fieldPath} (JSONPath)`,
              })

              if (!sampleInput[topLevelField]) {
                if (fieldPath.includes('.')) {
                  sampleInput[topLevelField] = DataFlowHelpers.createNestedSampleObject(fieldPath)
                } else {
                  sampleInput[topLevelField] = DataFlowHelpers.generateSampleValue(topLevelField)
                }
              }
            }
          }
        }
      }
    } else if (typeof expression === 'object' && expression !== null) {
      // Recursively analyze object properties
      for (const [_key, value] of Object.entries(expression)) {
        if (typeof value === 'string') {
          this.extractItemSelectorFieldReferences(value, requirements, sampleInput, isJSONata)
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          this.extractItemSelectorFieldReferences(value, requirements, sampleInput, isJSONata)
        }
      }
    }
  }

  /**
   * Analyze a state for direct input references ($.field or $states.input.field)
   * When no ItemSelector exists, these reference the ItemReader data directly
   */
  private analyzeStateForDirectInputReferences(
    state: State,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    // Use proper type guards for type-safe access
    if (isChoice(state)) {
      if (isJSONata) {
        // JSONata mode: Choice uses Condition field
        for (const choice of state.Choices) {
          if ('Condition' in choice && choice.Condition && typeof choice.Condition === 'string') {
            this.extractDirectInputReferences(choice.Condition, requirements, sampleInput, true)
          }
        }
      } else {
        // JSONPath mode: Choice uses Variable field
        for (const choice of state.Choices) {
          if ('Variable' in choice && choice.Variable) {
            const field = DataFlowHelpers.extractFieldFromPath(choice.Variable)
            if (field) {
              // Determine type from condition
              let type: InputRequirement['type'] = 'any'
              let example: string | number | boolean | undefined

              if ('StringEquals' in choice || 'StringMatches' in choice) {
                type = 'string'
                example = choice.StringEquals || 'example'
              } else if (
                'NumericEquals' in choice ||
                'NumericLessThan' in choice ||
                'NumericGreaterThan' in choice
              ) {
                type = 'number'
                example =
                  choice.NumericEquals ?? choice.NumericLessThan ?? choice.NumericGreaterThan ?? 100
              } else if ('BooleanEquals' in choice) {
                type = 'boolean'
                example = choice.BooleanEquals
              }

              requirements.push({
                field,
                type,
                required: true,
                example,
                description: `Used in Choice condition (direct ItemReader input)`,
              })

              if (example !== undefined) {
                sampleInput[field] = example
              }
            }
          }
        }
      }
    }

    // Analyze Task state
    if (isTask(state)) {
      if (isJSONata && 'Arguments' in state && state.Arguments) {
        // JSONata mode uses Arguments
        this.extractDirectInputReferences(state.Arguments, requirements, sampleInput, true)
      } else if ('Parameters' in state && state.Parameters) {
        // JSONPath mode uses Parameters
        this.analyzeParametersForDirectInput(state.Parameters, requirements, sampleInput)
      }
    }

    // Analyze other fields like Assign, Output, etc.
    if (state.Assign) {
      for (const [_varName, varValue] of Object.entries(state.Assign)) {
        if (typeof varValue === 'string') {
          this.extractDirectInputReferences(varValue, requirements, sampleInput, isJSONata)
        }
      }
    }

    if ('Output' in state && state.Output && typeof state.Output === 'string' && isJSONata) {
      this.extractDirectInputReferences(state.Output, requirements, sampleInput, true)
    }
  }

  /**
   * Extract direct input references from expressions
   */
  private extractDirectInputReferences(
    expression: string | JsonObject,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    if (typeof expression === 'string') {
      if (isJSONata) {
        // JSONata mode: $states.input.field or $field
        const statesInputPattern =
          /\$states\.input\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g
        let match: RegExpExecArray | null
        // biome-ignore lint/suspicious/noAssignInExpressions: RegEx exec() requires assignment in loop condition
        while ((match = statesInputPattern.exec(expression)) !== null) {
          const fieldPath = match[1]
          if (!fieldPath) continue

          // Special handling for $states.input.value.* pattern (DistributedMap ItemReader data)
          if (fieldPath.startsWith('value.')) {
            const actualField = fieldPath.substring(6)
            if (actualField) {
              requirements.push({
                field: actualField,
                type: 'any',
                required: true,
                description: `Referenced in ItemProcessor Arguments (JSONata)`,
              })

              if (!sampleInput[actualField]) {
                sampleInput[actualField] = DataFlowHelpers.generateSampleValue(actualField)
              }
            }
          } else {
            // Regular $states.input.field pattern
            const topLevelField = fieldPath.split('.')[0]

            if (topLevelField) {
              requirements.push({
                field: topLevelField,
                type: 'any',
                required: true,
                description: `Referenced in ItemProcessor Arguments (direct from ItemReader)`,
              })

              if (!sampleInput[topLevelField]) {
                if (fieldPath.includes('.')) {
                  sampleInput[topLevelField] = DataFlowHelpers.createNestedSampleObject(fieldPath)
                } else {
                  sampleInput[topLevelField] = DataFlowHelpers.generateSampleValue(topLevelField)
                }
              }
            }
          }
        }

        // Direct field references ($field) in JSONata
        const fieldMatches = expression.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g)
        if (fieldMatches) {
          for (const match of fieldMatches) {
            const field = match.substring(1)
            // Exclude special JSONata variables
            if (field && !['states', 'context', 'task', 'map', 'now', 'uuid'].includes(field)) {
              requirements.push({
                field,
                type: 'any',
                required: true,
                description: `Referenced in JSONata expression (direct from ItemReader)`,
              })

              if (!sampleInput[field]) {
                sampleInput[field] = DataFlowHelpers.generateSampleValue(field)
              }
            }
          }
        }
      } else {
        // JSONPath mode: $.field
        const fieldMatches = expression.match(
          /\$\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
        )
        if (fieldMatches) {
          for (const match of fieldMatches) {
            const field = DataFlowHelpers.extractFieldFromPath(match)
            if (field) {
              requirements.push({
                field,
                type: 'any',
                required: true,
                description: `Referenced in JSONPath expression (direct from ItemReader)`,
              })

              if (!sampleInput[field]) {
                sampleInput[field] = DataFlowHelpers.generateSampleValue(field)
              }
            }
          }
        }
      }
    } else if (typeof expression === 'object' && expression !== null) {
      // Recursively analyze objects
      this.analyzeObjectForDirectInputReferences(expression, requirements, sampleInput, isJSONata)
    }
  }

  /**
   * Recursively analyze an object for direct input references
   */
  private analyzeObjectForDirectInputReferences(
    obj: JsonValue,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
    isJSONata: boolean,
  ): void {
    if (typeof obj !== 'object' || obj === null) return

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.analyzeObjectForDirectInputReferences(item, requirements, sampleInput, isJSONata)
      }
      return
    }

    for (const [_key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        this.extractDirectInputReferences(value, requirements, sampleInput, isJSONata)
      } else if (typeof value === 'object' && value !== null) {
        this.analyzeObjectForDirectInputReferences(value, requirements, sampleInput, isJSONata)
      }
    }
  }

  /**
   * Analyze Parameters object for direct input field references
   */
  private analyzeParametersForDirectInput(
    params: JsonObject,
    requirements: InputRequirement[],
    sampleInput: JsonObject,
  ): void {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // First try to extract regular JSONPath patterns ($.field)
        const field = DataFlowHelpers.extractFieldFromPath(value)
        if (field) {
          requirements.push({
            field,
            type: 'any',
            required: true,
            description: `Referenced in Parameters.${key} (direct from ItemReader)`,
          })

          if (!sampleInput[field]) {
            sampleInput[field] = DataFlowHelpers.generateSampleValue(field)
          }
        } else {
          // Also handle Context object patterns ($$.Map.Item.Value.field)
          this.extractInlineMapContextReferences(
            value,
            requirements,
            sampleInput,
            false,
            'Context object',
          )
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively analyze nested objects
        this.analyzeParametersForDirectInput(value, requirements, sampleInput)
      }
    }
  }
}
