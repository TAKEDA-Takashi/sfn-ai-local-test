import * as yaml from 'js-yaml'
import { isTask, type StateMachine } from '../../types/asl'
import { isJsonArray, isJsonObject } from '../../types/type-guards'
import { findStateByName } from '../utils/state-traversal'

/**
 * Auto-fix common issues in test content
 */
export function autoFixTest(content: string): string {
  return content.replace(/outputMatching:\s*["']exact["']/g, 'outputMatching: "partial"')
}

/**
 * Auto-fix common issues in mock content
 */
export function autoFixMock(content: string, stateMachine: StateMachine): string {
  try {
    const parsed = yaml.load(content)
    if (!isJsonObject(parsed)) return content
    if (!isJsonObject(stateMachine)) return content

    let modified = false

    if (parsed.mocks && isJsonArray(parsed.mocks)) {
      for (const mock of parsed.mocks) {
        if (!isJsonObject(mock) || typeof mock.state !== 'string') continue
        const state = findStateByName(stateMachine, mock.state)

        // Check if this is a Lambda invoke task
        const resource = state && isTask(state) ? state.Resource : null
        if (resource && typeof resource === 'string' && resource.includes('lambda:invoke')) {
          // Fix conditional mocks for Lambda
          if (mock.type === 'conditional' && mock.conditions && isJsonArray(mock.conditions)) {
            for (const condition of mock.conditions) {
              if (!isJsonObject(condition)) continue

              if (
                condition.when &&
                isJsonObject(condition.when) &&
                condition.when.input &&
                isJsonObject(condition.when.input) &&
                !condition.when.input.Payload
              ) {
                condition.when.input = { Payload: condition.when.input }
                modified = true
              }

              if (
                condition.response &&
                isJsonObject(condition.response) &&
                !condition.response.Payload
              ) {
                condition.response = { Payload: condition.response, StatusCode: 200 }
                modified = true
              }
            }
          }

          // Fix fixed mock response for Lambda
          if (
            mock.type === 'fixed' &&
            mock.response &&
            isJsonObject(mock.response) &&
            !mock.response.Payload
          ) {
            mock.response = { Payload: mock.response, StatusCode: 200 }
            modified = true
          }
        }
      }
    }

    if (modified) {
      return yaml.dump(parsed, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
      })
    }
  } catch {
    // If parsing fails, return original content
  }

  return content
}
