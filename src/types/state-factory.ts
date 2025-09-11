/**
 * State Factory for converting ASL types to State classes
 *
 * This factory converts pure ASL type definitions (from asl.ts)
 * into runtime State class instances (from state-classes.ts).
 *
 * Usage:
 * - Input: ASL State interface from JSON/YAML
 * - Output: State class instance with runtime behavior
 */

// Type unions are imported from state-classes.js via re-export

import type {
  ItemProcessor,
  JSONataChoiceRule,
  JSONPathChoiceRule,
  JsonArray,
  JsonObject,
  JsonValue,
  StateMachine,
} from './asl.js'
import {
  JSONataChoiceState,
  JSONataDistributedMapState,
  JSONataFailState,
  JSONataInlineMapState,
  JSONataParallelState,
  JSONataPassState,
  JSONataSucceedState,
  JSONataTaskState,
  JSONataWaitState,
  JSONPathChoiceState,
  JSONPathDistributedMapState,
  JSONPathFailState,
  JSONPathInlineMapState,
  JSONPathParallelState,
  JSONPathPassState,
  JSONPathSucceedState,
  JSONPathTaskState,
  JSONPathWaitState,
  type State,
} from './state-classes.js'
import { isJsonObject } from './type-guards.js'

// Import type guards for Choice validation
function isJSONPathChoiceRule(rule: unknown): boolean {
  if (!rule || typeof rule !== 'object') return false
  return 'Variable' in rule || 'And' in rule || 'Or' in rule || 'Not' in rule
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isArray(value: unknown): value is JsonArray {
  return Array.isArray(value)
}

// Type guard for valid QueryLanguage value
export function isValidQueryLanguage(value: unknown): value is 'JSONPath' | 'JSONata' {
  return value === 'JSONPath' || value === 'JSONata'
}

// Type guard for ItemProcessor-like structure
export function hasItemProcessor(
  value: JsonObject,
): value is JsonObject & { ItemProcessor: JsonValue } {
  return 'ItemProcessor' in value
}

// Type guard to validate ItemProcessor interface
export function isItemProcessor(value: unknown): value is ItemProcessor {
  if (!isJsonObject(value)) return false
  if (!isString(value.StartAt)) return false
  if (!isJsonObject(value.States)) return false
  return true
}

// Type guard for States property
export function hasStates(value: JsonObject): value is JsonObject & { States: JsonObject } {
  return 'States' in value && isJsonObject(value.States)
}

// Type guard for Branch structure
export function isBranch(value: unknown): value is { States: JsonObject } & JsonObject {
  return isJsonObject(value) && hasStates(value)
}

export class StateFactory {
  /**
   * Create a complete StateMachine with all states converted to class instances
   *
   * @param stateMachineDefinition - Complete ASL StateMachine definition
   * @returns StateMachine with all states as class instances
   */
  static createStateMachine(stateMachineDefinition: JsonObject): StateMachine {
    // Ensure we have required fields
    if (!('States' in stateMachineDefinition && isJsonObject(stateMachineDefinition.States))) {
      throw new Error('StateMachine must have a States field')
    }

    if (
      !('StartAt' in stateMachineDefinition) ||
      typeof stateMachineDefinition.StartAt !== 'string'
    ) {
      throw new Error('StateMachine must have a StartAt field')
    }

    // Determine the StateMachine's QueryLanguage
    const queryLanguage =
      stateMachineDefinition.QueryLanguage === 'JSONata' ? 'JSONata' : 'JSONPath'

    // Convert all states recursively
    const states = StateFactory.createStates(stateMachineDefinition.States, queryLanguage)

    // Return complete StateMachine with converted states
    // Preserve QueryLanguage only if it was explicitly provided
    if ('QueryLanguage' in stateMachineDefinition) {
      return {
        ...stateMachineDefinition,
        StartAt: stateMachineDefinition.StartAt,
        States: states,
        QueryLanguage: stateMachineDefinition.QueryLanguage,
      } as StateMachine
    }

    // Don't add QueryLanguage if it wasn't in the original
    return {
      ...stateMachineDefinition,
      StartAt: stateMachineDefinition.StartAt,
      States: states,
    } as StateMachine
  }

  /**
   * Create a State class instance from ASL type definition
   *
   * @param aslState - ASL State interface from JSON/YAML or raw data
   * @param stateMachineQueryLanguage - QueryLanguage from the StateMachine level (for nested states)
   * @returns State class instance with runtime behavior
   */
  static createState(
    aslState: JsonObject,
    stateMachineQueryLanguage?: 'JSONPath' | 'JSONata',
  ): State {
    // Ensure we have the required Type field
    if (!isString(aslState.Type)) {
      throw new Error('State must have a Type field')
    }

    // Extract and validate QueryLanguage
    // Priority: State's own QueryLanguage > StateMachine's QueryLanguage > JSONPath default
    const queryLanguageValue = aslState.QueryLanguage
    const queryLanguage: 'JSONPath' | 'JSONata' = isValidQueryLanguage(queryLanguageValue)
      ? queryLanguageValue
      : stateMachineQueryLanguage || 'JSONPath'

    switch (aslState.Type) {
      case 'Task': {
        if (!isString(aslState.Resource)) {
          throw new Error('Task state requires Resource field')
        }
        // Include QueryLanguage in config for validation
        if (queryLanguage === 'JSONata') {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONata' as const,
            Resource: aslState.Resource,
          }
          return new JSONataTaskState(config)
        } else {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONPath' as const,
            Resource: aslState.Resource,
          }
          return new JSONPathTaskState(config)
        }
      }

      case 'Choice': {
        if (!isArray(aslState.Choices)) {
          throw new Error('Choice state requires Choices field')
        }

        // Validate Choice rules based on query language
        if (queryLanguage === 'JSONata') {
          for (const choice of aslState.Choices) {
            if (isJSONPathChoiceRule(choice)) {
              throw new Error(
                "Variable field is not supported in JSONata mode. Use 'Condition' field instead",
              )
            }
          }
        }

        // Remove QueryLanguage from config as it's handled internally
        const { QueryLanguage: _, ...stateWithoutQL } = aslState
        const config = {
          ...stateWithoutQL,
          Choices: aslState.Choices,
        }
        // Choices array needs type assertion as we can't validate the specific rule type at runtime
        return queryLanguage === 'JSONata'
          ? new JSONataChoiceState({
              ...config,
              Choices: config.Choices as JSONataChoiceRule[],
            })
          : new JSONPathChoiceState({
              ...config,
              Choices: config.Choices as JSONPathChoiceRule[],
            })
      }

      case 'Map': {
        // Determine if this is Distributed or Inline Map
        // According to AWS documentation, the Mode is specified in ItemProcessor.ProcessorConfig.Mode
        // Default to INLINE if not specified
        let processorMode: string = 'INLINE'

        // Check ItemProcessor.ProcessorConfig.Mode (AWS standard location)
        if (
          isJsonObject(aslState.ItemProcessor) &&
          isJsonObject(aslState.ItemProcessor.ProcessorConfig)
        ) {
          const mode = aslState.ItemProcessor.ProcessorConfig.Mode
          if (isString(mode)) {
            processorMode = mode
          }
        }

        // Remove QueryLanguage from config as it's handled internally
        const { QueryLanguage: _, ...stateWithoutQL } = aslState

        // Handle legacy Iterator field (for backward compatibility)
        // AWS Step Functions Local still uses Iterator instead of ItemProcessor
        const stateData = { ...stateWithoutQL }
        if (!stateData.ItemProcessor && 'Iterator' in stateData) {
          stateData.ItemProcessor = stateData.Iterator
        }

        if (!isJsonObject(stateData.ItemProcessor)) {
          throw new Error('Map state requires ItemProcessor field')
        }

        // Convert nested States in ItemProcessor to State class instances
        const itemProcessorData = stateData.ItemProcessor
        if (!isString(itemProcessorData.StartAt)) {
          throw new Error('ItemProcessor requires StartAt field')
        }

        // Map states pass their QueryLanguage to ItemProcessor.States
        // Priority: State's own QueryLanguage > Map's QueryLanguage > StateMachine's QueryLanguage
        const mapQueryLanguage = queryLanguage

        const itemProcessor: ItemProcessor = {
          ...itemProcessorData,
          StartAt: itemProcessorData.StartAt,
          States: hasStates(itemProcessorData)
            ? StateFactory.createStates(itemProcessorData.States, mapQueryLanguage)
            : {},
        }

        if (queryLanguage === 'JSONata') {
          const config = {
            ...stateData,
            QueryLanguage: 'JSONata' as const,
            ItemProcessor: itemProcessor,
            // If original stateData had Iterator, also convert its States to State instances
            ...('Iterator' in stateData &&
            isJsonObject(stateData.Iterator) &&
            hasStates(stateData.Iterator)
              ? {
                  Iterator: {
                    ...stateData.Iterator,
                    States: StateFactory.createStates(stateData.Iterator.States, mapQueryLanguage),
                  },
                }
              : {}),
          }
          return processorMode === 'DISTRIBUTED'
            ? new JSONataDistributedMapState(config)
            : new JSONataInlineMapState(config)
        } else {
          const config = {
            ...stateData,
            QueryLanguage: 'JSONPath' as const,
            ItemProcessor: itemProcessor,
            // If original stateData had Iterator, also convert its States to State instances
            ...('Iterator' in stateData &&
            isJsonObject(stateData.Iterator) &&
            hasStates(stateData.Iterator)
              ? {
                  Iterator: {
                    ...stateData.Iterator,
                    States: StateFactory.createStates(stateData.Iterator.States, mapQueryLanguage),
                  },
                }
              : {}),
          }
          return processorMode === 'DISTRIBUTED'
            ? new JSONPathDistributedMapState(config)
            : new JSONPathInlineMapState(config)
        }
      }

      case 'Parallel': {
        if (!isArray(aslState.Branches)) {
          throw new Error('Parallel state requires Branches field')
        }

        // Convert nested States in each branch to State class instances
        // Note: Branches inherit QueryLanguage from the state machine level, not from the Parallel state
        const branches = aslState.Branches.map((branch) => {
          // Validate that branch is an object
          if (!isJsonObject(branch)) {
            throw new Error('Each branch must be an object')
          }

          // Check if it has States to convert
          if (hasStates(branch)) {
            // Parallel branches inherit from StateMachine, not from Parallel state
            const states = StateFactory.createStates(branch.States, stateMachineQueryLanguage)
            // Ensure branch has StartAt field for StateMachine compliance
            const branchWithStates = {
              ...branch,
              States: states,
            }
            // Ensure StartAt is present
            if (!('StartAt' in branchWithStates) || typeof branchWithStates.StartAt !== 'string') {
              throw new Error('Branch must have a StartAt field')
            }
            return branchWithStates as StateMachine
          }

          // If no States to convert, ensure it's still a valid StateMachine
          if (!('StartAt' in branch) || typeof branch.StartAt !== 'string') {
            throw new Error('Branch must have a StartAt field')
          }
          if (!('States' in branch && isJsonObject(branch.States))) {
            throw new Error('Branch must have a States field')
          }
          // Branch has StartAt and States, so it's a valid StateMachine structure
          const validBranch = branch as JsonObject & { StartAt: string; States: JsonObject }
          return validBranch as unknown as StateMachine
        })

        // Include QueryLanguage in config for validation
        if (queryLanguage === 'JSONata') {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONata' as const,
            Branches: branches,
          }
          return new JSONataParallelState(config)
        } else {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONPath' as const,
            Branches: branches,
          }
          return new JSONPathParallelState(config)
        }
      }

      case 'Pass': {
        // Include QueryLanguage in config for validation
        if (queryLanguage === 'JSONata') {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONata' as const,
          }
          return new JSONataPassState(config)
        } else {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONPath' as const,
          }
          return new JSONPathPassState(config)
        }
      }

      case 'Wait': {
        // Include QueryLanguage in config for validation
        if (queryLanguage === 'JSONata') {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONata' as const,
          }
          return new JSONataWaitState(config)
        } else {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONPath' as const,
          }
          return new JSONPathWaitState(config)
        }
      }

      case 'Succeed': {
        // Include QueryLanguage in config for validation
        if (queryLanguage === 'JSONata') {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONata' as const,
          }
          return new JSONataSucceedState(config)
        } else {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONPath' as const,
          }
          return new JSONPathSucceedState(config)
        }
      }

      case 'Fail': {
        // Include QueryLanguage in config for validation
        if (queryLanguage === 'JSONata') {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONata' as const,
          }
          return new JSONataFailState(config)
        } else {
          const config = {
            ...aslState,
            QueryLanguage: 'JSONPath' as const,
          }
          return new JSONPathFailState(config)
        }
      }

      default:
        throw new Error(`Unknown state type: ${aslState.Type}`)
    }
  }

  /**
   * Create State instances for a StateMachine's States object
   */
  static createStates(
    statesData: JsonObject,
    defaultQueryLanguage?: 'JSONPath' | 'JSONata',
  ): Record<string, State> {
    const states: Record<string, State> = {}

    // Handle null or undefined input
    if (!statesData) {
      return states
    }

    for (const [stateName, stateValue] of Object.entries(statesData)) {
      if (!isJsonObject(stateValue)) {
        throw new Error(`State ${stateName} must be an object`)
      }

      const stateData = { ...stateValue }

      // Inherit QueryLanguage from StateMachine if not specified at state level
      if (!stateData.QueryLanguage && defaultQueryLanguage) {
        stateData.QueryLanguage = defaultQueryLanguage
      }

      states[stateName] = StateFactory.createState(stateData, defaultQueryLanguage)
    }

    return states
  }

  /**
   * Validate if an object is a valid State definition
   */
  static isValidStateDefinition(value: unknown): value is JsonObject {
    if (!isJsonObject(value)) {
      return false
    }

    // Must have a Type field
    if (!isString(value.Type)) {
      return false
    }

    // Type-specific validation
    switch (value.Type) {
      case 'Task':
        return isString(value.Resource)
      case 'Choice':
        return isArray(value.Choices)
      case 'Map':
        return hasItemProcessor(value) || 'Iterator' in value
      case 'Parallel':
        return isArray(value.Branches)
      case 'Pass':
      case 'Wait':
      case 'Succeed':
      case 'Fail':
        return true
      default:
        return false
    }
  }
}
