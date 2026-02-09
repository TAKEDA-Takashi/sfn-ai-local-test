/**
 * YAML output rules for mock and test generation prompts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export function getMockYamlOutputRules(promptsDir: string): string {
  try {
    const common = fs.readFileSync(path.join(promptsDir, 'yaml-output-rules-common.md'), 'utf-8')
    const mock = fs.readFileSync(path.join(promptsDir, 'yaml-output-rules-mock.md'), 'utf-8')
    return `${common}\n\n${mock}`
  } catch {
    return getDefaultMockYamlOutputRules()
  }
}

export function getTestYamlOutputRules(promptsDir: string): string {
  try {
    const common = fs.readFileSync(path.join(promptsDir, 'yaml-output-rules-common.md'), 'utf-8')
    const test = fs.readFileSync(path.join(promptsDir, 'yaml-output-rules-test.md'), 'utf-8')
    return `${common}\n\n${test}`
  } catch {
    return getDefaultTestYamlOutputRules()
  }
}

function getDefaultMockYamlOutputRules(): string {
  return `# OUTPUT FORMAT RULES

⚠️⚠️⚠️ CRITICAL: OUTPUT MUST BE PURE YAML - NO EXPLANATIONS ⚠️⚠️⚠️

**OUTPUT ONLY VALID YAML. NO EXPLANATIONS, NO MARKDOWN MARKERS.**

## MOCK FILE STRUCTURE
The output MUST:
1. Start with: version: "1.0"
2. Be valid YAML from first to last character
3. NOT include \`\`\`yaml or \`\`\` markers
4. Contain 'mocks:' array with mock definitions
5. NOT contain 'testCases:' or 'stateMachine:' fields

## EXAMPLE OF CORRECT MOCK FILE:
version: "1.0"
mocks:
  - state: "StateName"
    type: "fixed"
    response:
      Payload: {...}
      StatusCode: 200

**OUTPUT ONLY THE YAML CONTENT. NOTHING ELSE.**`
}

function getDefaultTestYamlOutputRules(): string {
  return `# OUTPUT FORMAT RULES

⚠️⚠️⚠️ CRITICAL: OUTPUT MUST BE PURE YAML - NO EXPLANATIONS ⚠️⚠️⚠️

**OUTPUT ONLY VALID YAML. NO EXPLANATIONS, NO MARKDOWN MARKERS.**

## TEST FILE STRUCTURE
The output MUST:
1. Start with: version: "1.0"
2. Be valid YAML from first to last character
3. NOT include \`\`\`yaml or \`\`\` markers
4. Use 'testCases' (NOT 'tests') for test definitions
5. NOT contain top-level 'mocks:' array

## EXAMPLE OF CORRECT TEST FILE:
version: "1.0"
name: "Test Suite Name"
stateMachine: "path/to/stateMachine.asl.json"  # Optional
testCases:  # NOT "tests"
  - name: "Test case 1"
    input: {...}
    stateExpectations:
      - state: "StateName"  # NOT "stateName"
        outputMatching: "partial"
        output: {...}

**OUTPUT ONLY THE YAML CONTENT. NOTHING ELSE.**`
}
