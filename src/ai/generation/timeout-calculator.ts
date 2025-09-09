/**
 * Dynamic timeout calculator based on state machine complexity
 */

import {
  DEFAULT_AI_BASE_TIMEOUT_MS,
  DEFAULT_AI_PER_STATE_TIMEOUT_MS,
  LARGE_STATE_COUNT_THRESHOLD,
  MAX_AI_TIMEOUT_MS,
  MILLISECONDS_PER_SECOND,
} from '../../constants/defaults'
import type { JsonObject, StateMachine } from '../../types/asl'
import type { ComplexityMetrics } from '../utils/state-traversal'
import { analyzeComplexity } from '../utils/state-traversal'

export class TimeoutCalculator {
  private readonly BASE_TIMEOUT = DEFAULT_AI_BASE_TIMEOUT_MS
  private readonly PER_STATE_TIMEOUT = DEFAULT_AI_PER_STATE_TIMEOUT_MS
  private readonly COMPLEXITY_MULTIPLIERS = {
    map: 1.5,
    distributedMap: 2.0,
    parallel: 1.3,
    choice: 1.2,
    lambda: 1.1,
    variables: 1.2,
    jsonata: 1.3,
    deepNesting: 1.5, // for depth > 3
  }

  /**
   * Calculate appropriate timeout based on state machine complexity
   */
  calculateTimeout(stateMachine: StateMachine | JsonObject, userTimeout?: number): number {
    // If user specified timeout, respect it
    if (userTimeout) {
      return userTimeout
    }

    const metrics = analyzeComplexity(stateMachine as StateMachine)
    return this.computeTimeout(metrics)
  }

  /**
   * Compute timeout based on metrics
   */
  private computeTimeout(metrics: ComplexityMetrics): number {
    // Start with base timeout
    let timeout = this.BASE_TIMEOUT

    // Add time per state
    timeout += metrics.totalStates * this.PER_STATE_TIMEOUT

    // Apply complexity multipliers
    if (metrics.mapStates > 0) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.map ** Math.min(metrics.mapStates, 3)
    }

    if (metrics.distributedMapStates > 0) {
      timeout *=
        this.COMPLEXITY_MULTIPLIERS.distributedMap ** Math.min(metrics.distributedMapStates, 2)
    }

    if (metrics.parallelStates > 0) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.parallel ** Math.min(metrics.parallelStates, 3)
    }

    if (metrics.choiceStates > 2) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.choice
    }

    if (metrics.lambdaTasks > 5) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.lambda
    }

    if (metrics.hasVariables) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.variables
    }

    if (metrics.hasJSONata) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.jsonata
    }

    if (metrics.maxDepth > 3) {
      timeout *= this.COMPLEXITY_MULTIPLIERS.deepNesting
    }

    // Cap at maximum AI timeout
    return Math.min(timeout, MAX_AI_TIMEOUT_MS)
  }

  /**
   * Get human-readable timeout suggestion
   */
  getTimeoutSuggestion(metrics: ComplexityMetrics): string {
    const timeout = this.computeTimeout(metrics)
    const seconds = Math.round(timeout / MILLISECONDS_PER_SECOND)

    const factors: string[] = []
    if (metrics.totalStates > LARGE_STATE_COUNT_THRESHOLD)
      factors.push(`${metrics.totalStates} states`)
    if (metrics.mapStates > 0) factors.push(`${metrics.mapStates} Map states`)
    if (metrics.distributedMapStates > 0)
      factors.push(`${metrics.distributedMapStates} DistributedMap states`)
    if (metrics.parallelStates > 0) factors.push(`${metrics.parallelStates} Parallel states`)
    if (metrics.maxDepth > 3) factors.push(`deep nesting (level ${metrics.maxDepth})`)
    if (metrics.hasJSONata) factors.push('JSONata queries')

    if (factors.length === 0) {
      return `Recommended timeout: ${seconds} seconds (simple state machine)`
    }

    return `Recommended timeout: ${seconds} seconds (complex state machine with ${factors.join(
      ', ',
    )})`
  }
}
