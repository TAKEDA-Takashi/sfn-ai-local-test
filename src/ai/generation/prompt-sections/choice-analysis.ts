/**
 * Choice state analysis: loop detection, variable pattern detection, and mock guidelines
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  type ChoiceRule,
  type ChoiceState,
  isChoice,
  type State,
  type StateMachine,
} from '../../../types/asl'

export function hasProblematicChoicePatterns(stateMachine: StateMachine): boolean {
  const result = detectChoiceLoops(stateMachine)
  return result.hasProblematicPatterns || result.hasStructuralLoops
}

export function detectChoiceLoops(stateMachine: StateMachine): {
  hasProblematicPatterns: boolean
  hasStructuralLoops: boolean
  problematicStates: string[]
} {
  const problematicStates: string[] = []
  let hasProblematicPatterns = false
  let hasStructuralLoops = false

  // Only patterns that are truly variable and cannot be made deterministic in tests
  const variablePatterns = {
    jsonpath: ['$$.State.RetryCount', '$$.Map.Item.Index', '$$.Task.Token'],
    jsonata: ['$states.context.State.RetryCount', '$states.context.Map.Item.Index', '$random'],
  }

  if (!stateMachine.States) {
    return {
      hasProblematicPatterns: false,
      hasStructuralLoops: false,
      problematicStates: [],
    }
  }

  const states = stateMachine.States
  const stateGraph = buildStateGraph(states)

  for (const [stateName, state] of Object.entries(states)) {
    if (isChoice(state)) {
      const choices = state.Choices

      if (!choices) continue

      const hasVariablePattern = checkChoiceForVariablePatterns(
        choices,
        variablePatterns.jsonpath,
        variablePatterns.jsonata,
      )

      if (hasVariablePattern) {
        hasProblematicPatterns = true
        problematicStates.push(stateName)
      }

      // Structural loop detection
      const possibleNextStates = getChoiceNextStates(state)
      for (const nextState of possibleNextStates) {
        if (canReachState(stateGraph, nextState, stateName)) {
          hasStructuralLoops = true
          if (!problematicStates.includes(stateName)) {
            problematicStates.push(stateName)
          }
        }
      }
    }
  }

  return {
    hasProblematicPatterns,
    hasStructuralLoops,
    problematicStates,
  }
}

export function getChoiceMockGuidelines(
  promptsDir: string,
  analysis?: {
    hasProblematicPatterns: boolean
    hasStructuralLoops: boolean
    problematicStates: string[]
  },
): string {
  let guidelines: string
  try {
    guidelines = fs.readFileSync(path.join(promptsDir, 'choice-mock-guidelines.md'), 'utf-8')
  } catch {
    guidelines = getDefaultChoiceMockGuidelines()
  }

  if (analysis && analysis.problematicStates.length > 0) {
    const header = `# Choice State Mock Guidelines

## ⚠️ IMPORTANT: We detected potential infinite loops in the following Choice states:
${analysis.problematicStates.map((state) => `- **${state}**`).join('\n')}

${analysis.hasProblematicPatterns ? '**Reason**: Non-deterministic patterns (time-based, random, or context-dependent conditions)' : ''}
${analysis.hasStructuralLoops ? '**Reason**: Structural loops where Choice states can reach themselves' : ''}

Consider using stateful mocks to break these loops after a reasonable number of iterations.

`
    // Replace the header in the guidelines
    guidelines = guidelines.replace(/^# Choice State Mock Guidelines.*?\n\n/s, `${header}\n`)
  }

  return guidelines
}

export function getDefaultChoiceMockGuidelines(): string {
  return `## Choice State Mock Guidelines

⚠️ IMPORTANT: Only mock Choice states for these specific cases:

1. **Infinite Loop Prevention** (PRIMARY USE)

   Non-deterministic patterns:
   - JSONPath: TimestampEqualsPath, $$.State.EnteredTime
   - JSONata: $random(), $uuid(), $now(), $millis()
   - Structural loops where Choice can reach itself

2. **Testing Error Paths**
   - Force error handling branches

3. **Breaking Test Deadlocks**
   - Circular dependencies in tests

DO NOT mock Choice states for normal testing - use appropriate input data instead.

Example for non-deterministic conditions:
\`\`\`yaml
# JSONata with random function
- state: "RandomChoice"
  type: "stateful"
  responses:
    - Next: "PathA"     # First execution
    - Next: "PathB"     # Second execution
    - Next: "Complete"  # Force completion

# Structural loop prevention
- state: "RetryChoice"
  type: "stateful"
  responses:
    - Next: "ProcessTask"    # Allow 2 retries
    - Next: "ProcessTask"
    - Next: "CompleteWork"   # Force exit
\`\`\``
}

export function buildStateGraph(states: Record<string, State>): Map<string, string[]> {
  const graph = new Map<string, string[]>()

  for (const [stateName, state] of Object.entries(states || {})) {
    const nextStates: string[] = []

    if (state.Next && typeof state.Next === 'string') {
      nextStates.push(state.Next)
    }

    if (isChoice(state)) {
      const choices = state.Choices || []
      for (const choice of choices) {
        if (choice.Next && typeof choice.Next === 'string') nextStates.push(choice.Next)
      }
      const defaultState = state.Default
      if (defaultState && typeof defaultState === 'string') nextStates.push(defaultState)
    }

    graph.set(stateName, nextStates)
  }

  return graph
}

export function checkChoiceForVariablePatterns(
  choices: ChoiceRule[],
  jsonPathPatterns: string[],
  jsonataPatterns: string[],
): boolean {
  for (const choice of choices) {
    if (choice.isJSONata()) {
      const conditionStr = choice.Condition?.toLowerCase() || ''
      if (jsonataPatterns.some((pattern) => conditionStr.includes(pattern.toLowerCase()))) {
        return true
      }
    } else {
      if (checkJSONPathChoiceForPatterns(choice, jsonPathPatterns)) {
        return true
      }
    }
  }
  return false
}

export function checkJSONPathChoiceForPatterns(choice: ChoiceRule, patterns: string[]): boolean {
  if (!choice.isJSONPath()) {
    return false
  }

  if (choice.Variable) {
    if (patterns.some((pattern) => choice.Variable?.includes(pattern))) {
      return true
    }
  }

  if (choice.And) {
    return choice.And.some((rule) => checkJSONPathChoiceForPatterns(rule, patterns))
  }
  if (choice.Or) {
    return choice.Or.some((rule) => checkJSONPathChoiceForPatterns(rule, patterns))
  }
  if (choice.Not) {
    return checkJSONPathChoiceForPatterns(choice.Not, patterns)
  }

  return false
}

export function getChoiceNextStates(choiceState: ChoiceState): string[] {
  const nextStates: string[] = []
  const choices = choiceState.Choices || []
  for (const choice of choices) {
    if (choice.Next && typeof choice.Next === 'string') nextStates.push(choice.Next)
  }
  const defaultState = choiceState.Default
  if (defaultState && typeof defaultState === 'string') nextStates.push(defaultState)
  return nextStates
}

export function canReachState(
  graph: Map<string, string[]>,
  from: string,
  target: string,
  visited: Set<string> = new Set(),
): boolean {
  if (from === target) return true
  if (visited.has(from)) return false

  visited.add(from)
  const nextStates = graph.get(from) || []

  for (const next of nextStates) {
    if (canReachState(graph, next, target, visited)) {
      return true
    }
  }

  return false
}
