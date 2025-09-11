import type { JsonObject, JsonValue, MapState, StateMachine } from '../../../types/asl'
import type { DynamicField, MapOutputField, MapOutputSpec } from '../data-flow-analyzer'
import { DataFlowHelpers } from './data-flow-helpers'

export class MapOutputAnalyzer {
  private stateMachine: StateMachine

  constructor(stateMachine: StateMachine) {
    this.stateMachine = stateMachine
  }

  /**
   * Map状態のAWS仕様準拠出力を分析
   */
  analyzeMapOutputRequirements(): MapOutputSpec[] {
    const specs: MapOutputSpec[] = []
    const states = this.stateMachine.States || {}

    for (const [stateName, state] of Object.entries(states)) {
      if (!state.isMap()) continue

      // state.isMap() is a type predicate, so state is now MapState
      const spec = this.analyzeMapState(stateName, state)
      if (spec) {
        specs.push(spec)
      }
    }

    return specs
  }

  /**
   * 個別のMap状態を詳細分析
   */
  private analyzeMapState(stateName: string, mapState: MapState): MapOutputSpec | null {
    const requiredFields: MapOutputField[] = []
    const dynamicFields: DynamicField[] = []
    let conditionalLogic = ''

    const isDistributedMap = mapState.isDistributedMap()
    const isJSONata = mapState.isJSONataState()

    // AWS Step Functions Map状態の標準出力フィールド
    requiredFields.push({
      field: 'ProcessedItemCount',
      type: 'number',
      required: true,
      description: 'Number of items successfully processed',
    })

    if (isDistributedMap) {
      // DistributedMapの場合の追加フィールド
      requiredFields.push({
        field: 'FailedItemCount',
        type: 'number',
        required: false,
        description: 'Number of items that failed processing (DistributedMap)',
      })

      requiredFields.push({
        field: 'PendingItemCount',
        type: 'number',
        required: false,
        description: 'Number of items still pending (DistributedMap)',
      })

      requiredFields.push({
        field: 'TotalItemCount',
        type: 'number',
        required: false,
        description: 'Total number of items to process (DistributedMap)',
      })
    }

    // ResultWriterDetails（結果出力設定がある場合）
    if (this.hasResultWriter(mapState)) {
      requiredFields.push({
        field: 'ResultWriterDetails',
        type: 'object',
        required: true,
        description: 'Details about result writing location',
      })
    }

    // 動的フィールドを分析
    const inputAnalysis = this.analyzeMapInputSource(stateName, mapState, isJSONata)
    if (inputAnalysis) {
      dynamicFields.push({
        field: 'ProcessedItemCount',
        calculation: inputAnalysis.sizeCalculation,
        fallbackValue: inputAnalysis.fallbackSize,
      })

      if (isDistributedMap) {
        dynamicFields.push({
          field: 'TotalItemCount',
          calculation: inputAnalysis.sizeCalculation,
          fallbackValue: inputAnalysis.fallbackSize,
        })
      }

      conditionalLogic = inputAnalysis.conditionalLogic
    }

    return {
      stateName,
      requiredFields,
      dynamicFields,
      conditionalLogic,
    }
  }

  /**
   * Map状態の入力ソースを分析して動的値計算ロジックを決定
   */
  private analyzeMapInputSource(
    _stateName: string,
    mapState: MapState,
    isJSONata: boolean,
  ): {
    sizeCalculation: string
    fallbackSize: number
    conditionalLogic: string
  } | null {
    let sizeCalculation = ''
    let fallbackSize = 5
    let conditionalLogic = ''

    if (isJSONata) {
      // JSONataモード：Arguments から入力配列を特定
      if (
        'Arguments' in mapState &&
        mapState.Arguments &&
        typeof mapState.Arguments === 'object' &&
        !Array.isArray(mapState.Arguments)
      ) {
        const inputArrayFields = this.extractArrayFieldsFromJSONata(mapState.Arguments)
        if (inputArrayFields.length > 0) {
          const primaryField = inputArrayFields[0]
          sizeCalculation = `input.${primaryField}.length`
          conditionalLogic = `Use conditional mock based on input.${primaryField} array size`
        }
      }
    } else {
      // JSONPathモード：Parameters から入力配列を特定
      if ('Parameters' in mapState && mapState.Parameters) {
        const inputArrayFields = this.extractArrayFieldsFromJSONPath(mapState.Parameters)
        if (inputArrayFields.length > 0) {
          const primaryField = inputArrayFields[0]
          sizeCalculation = `input.${primaryField}.length`
          conditionalLogic = `Use conditional mock based on input.${primaryField} array size`
        }
      } else {
        // Parametersがない場合、入力全体が配列として扱われる想定
        sizeCalculation = 'input.length (if input is array) or 1 (if input is object)'
        conditionalLogic = 'Check if input is array, use length; otherwise assume single item'
      }
    }

    if (!sizeCalculation) {
      // 配列フィールドが特定できない場合
      sizeCalculation = 'input.items.length (assumed generic array field)'
      fallbackSize = 3
      conditionalLogic = 'Unable to determine input array field, use generic fallback'
    }

    return {
      sizeCalculation,
      fallbackSize,
      conditionalLogic,
    }
  }

  /**
   * JSONata式から配列フィールドを抽出
   */
  private extractArrayFieldsFromJSONata(args: JsonObject): string[] {
    const arrayFields: string[] = []

    if (typeof args === 'object' && args !== null) {
      this.findArrayReferencesInObject(args, arrayFields, true)
    }

    return arrayFields
  }

  /**
   * JSONPath Parametersから配列フィールドを抽出
   */
  private extractArrayFieldsFromJSONPath(params: JsonObject): string[] {
    const arrayFields: string[] = []

    this.findArrayReferencesInObject(params, arrayFields, false)

    return arrayFields
  }

  /**
   * オブジェクト内の配列参照を再帰的に検索
   */
  private findArrayReferencesInObject(
    obj: JsonValue,
    arrayFields: string[],
    isJSONata: boolean,
  ): void {
    if (typeof obj !== 'object' || obj === null) return

    for (const [_key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // 配列を示唆するフィールド名や値を検出
        const field = this.extractPotentialArrayField(value, isJSONata)
        if (field && DataFlowHelpers.isLikelyArrayField(field)) {
          arrayFields.push(field)
        }
      } else if (typeof value === 'object' && value !== null) {
        this.findArrayReferencesInObject(value, arrayFields, isJSONata)
      }
    }
  }

  /**
   * 文字列から配列フィールドの可能性があるものを抽出
   */
  private extractPotentialArrayField(value: string, isJSONata: boolean): string | null {
    if (isJSONata) {
      // JSONata: $states.input.field または $field
      const statesMatch = value.match(/\$states\.input\.([a-zA-Z_][a-zA-Z0-9_]*)/)
      if (statesMatch?.[1]) return statesMatch[1]

      const varMatch = value.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/)
      if (
        varMatch?.[1] &&
        !['states', 'context', 'task', 'map', 'now', 'uuid'].includes(varMatch[1])
      ) {
        return varMatch[1]
      }
    } else {
      // JSONPath: $.field
      const field = DataFlowHelpers.extractFieldFromPath(value)
      return field // extractFieldFromPath は既に string | null を返す
    }

    return null
  }

  /**
   * Map状態がResultWriterを持つかを判定
   */
  private hasResultWriter(mapState: MapState): boolean {
    return (
      mapState.isDistributedMap() &&
      'ResultWriter' in mapState &&
      mapState.ResultWriter !== undefined
    )
  }
}
