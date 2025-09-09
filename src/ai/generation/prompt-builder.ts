/**
 * Prompt Builder with State Hierarchy Analysis
 * Handles complex state structure understanding
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { HTTP_STATUS_OK } from '../../constants/defaults'
import type {
  ChoiceState,
  DistributedMapState,
  ItemReader,
  State,
  StateMachine,
} from '../../types/asl'
import { EMBEDDED_TYPE_DEFINITIONS } from '../agents/embedded-types'
import {
  type ChoiceDependency,
  DataFlowAnalyzer,
  type MapOutputSpec,
  type PassVariableFlow,
} from '../analysis/data-flow-analyzer'
import { detectDynamicFields } from '../analysis/dynamic-field-detector'
import {
  detectOutputTransformation,
  getOutputTransformationDetails,
} from '../analysis/output-transformation-detection'
import { StateHierarchyAnalyzer } from '../analysis/state-hierarchy-analyzer'
import { findStates, hasState, StateFilters } from '../utils/state-traversal'

export class PromptBuilder {
  private analyzer: StateHierarchyAnalyzer
  private dataFlowAnalyzer?: DataFlowAnalyzer
  private readonly promptsDir = path.join(__dirname, '..', 'prompts')

  constructor() {
    this.analyzer = new StateHierarchyAnalyzer()
    // DataFlowAnalyzer will be initialized per state machine in buildMockPrompt
  }

  /**
   * Extract mock-specific type definitions from embedded types
   */
  private extractMockTypeDefinitions(): string {
    // Find the Mock Configuration section
    const mockSectionStart = '## Mock Configuration Type Definition (TypeScript):'
    const startIndex = EMBEDDED_TYPE_DEFINITIONS.indexOf(mockSectionStart)

    if (startIndex === -1) {
      // Fallback: return entire definitions if section not found
      return EMBEDDED_TYPE_DEFINITIONS
    }

    // Extract from Mock section to the end
    return EMBEDDED_TYPE_DEFINITIONS.substring(startIndex)
  }

  /**
   * Extract test-specific type definitions from embedded types
   */
  private extractTestTypeDefinitions(): string {
    // Find the Test Suite section and extract until Mock section
    const testSectionStart = '## Test Suite Type Definition (TypeScript):'
    const mockSectionStart = '## Mock Configuration Type Definition (TypeScript):'

    const testStartIndex = EMBEDDED_TYPE_DEFINITIONS.indexOf(testSectionStart)
    const mockStartIndex = EMBEDDED_TYPE_DEFINITIONS.indexOf(mockSectionStart)

    if (testStartIndex === -1 || mockStartIndex === -1) {
      // Fallback: return entire definitions if sections not found
      return EMBEDDED_TYPE_DEFINITIONS
    }

    // Extract Test section only (from start to Mock section)
    return EMBEDDED_TYPE_DEFINITIONS.substring(testStartIndex, mockStartIndex).trim()
  }

  /**
   * Build mock generation prompt with hierarchy understanding
   */
  buildMockPrompt(stateMachine: StateMachine): string {
    const sections: string[] = []
    const hierarchy = this.analyzer.analyzeHierarchy(stateMachine)

    // モック専用のYAMLルールを最初に置くことでAIが確実に遵守
    sections.push(this.getMockYamlOutputRules())

    // TypeScript型定義から生成したスキーマを提示（モック部分のみ）
    sections.push(this.extractMockTypeDefinitions())

    // 利用可能なステート名を明示して誤りを防止
    sections.push(this.getAvailableStatesSection(stateMachine))

    // バリデーションエラーを避けるための必須ルール
    sections.push(this.getCriticalRules())

    // ネスト構造の解析結果をAIに提供
    const structureExplanation = this.analyzer.generateStructureExplanation(hierarchy)
    if (structureExplanation) {
      sections.push(structureExplanation)
    }

    // ステートタイプごとの特別な処理が必要
    const hasParallel = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Parallel')
    const hasMap = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Map')
    const hasDistributedMap = Object.values(hierarchy.nestedStructures).some(
      (s) => s.type === 'DistributedMap',
    )

    if (hasParallel) {
      sections.push(this.getParallelSpecializedPrompt())
    }
    if (hasMap && !hasDistributedMap) {
      sections.push(this.getMapSpecializedPrompt())
    }
    if (hasDistributedMap) {
      sections.push(this.getDistributedMapSpecializedPrompt())
    }

    // ItemReaderがある場合は必須モックとして明示
    if (hasState(stateMachine, StateFilters.hasItemReader)) {
      const allStates = findStates(stateMachine, StateFilters.hasItemReader)
      const itemReaderStates = allStates
        .filter(({ state }) => state.isDistributedMap())
        .map(({ name, state }) => {
          // isDistributedMap()がtrueなら、DistributedMapStateとして扱える
          const distributedMapState = state as DistributedMapState
          return {
            name,
            itemReader: distributedMapState.ItemReader,
            hasResultWriter: !!distributedMapState.ResultWriter,
          }
        })
        .filter(
          (state): state is { name: string; itemReader: ItemReader; hasResultWriter: boolean } =>
            state.itemReader !== undefined,
        )
      sections.push(this.getItemReaderMandatorySection(itemReaderStates))
    }

    // モックが必要なステートの明確化
    const mockableStates = this.analyzer.getMockableStates(hierarchy)
    sections.push(this.getMockableStatesGuidance(mockableStates))

    // Add Lambda integration rules if needed
    if (hasState(stateMachine, StateFilters.isLambdaTask)) {
      sections.push(this.getLambdaIntegrationRules())
    }

    // Add Variables/Assign rules if needed
    if (hasState(stateMachine, StateFilters.hasVariables)) {
      sections.push(this.getVariablesRules())
    }

    // Add Choice mock guidelines if there are problematic patterns
    if (this.hasProblematicChoicePatterns(stateMachine)) {
      const analysis = this.detectChoiceLoops(stateMachine)
      sections.push(this.getChoiceMockGuidelines(analysis))
    }

    // Add data flow analysis for improved mock generation
    this.dataFlowAnalyzer = new DataFlowAnalyzer(stateMachine)
    const dataFlowAnalysis = this.dataFlowAnalyzer?.analyzeDataFlowConsistency() || {
      consistency: {
        isConsistent: true,
        breaks: [],
        warnings: [],
      },
      recommendations: [],
    }
    sections.push(this.getDataFlowGuidance(dataFlowAnalysis))

    // Add the state machine definition
    sections.push('## State Machine Definition')
    sections.push('```json')
    sections.push(JSON.stringify(stateMachine, null, 2))
    sections.push('```')

    // Re-emphasize the output format at the end
    sections.push('## FINAL REMINDER')
    sections.push(
      '**OUTPUT ONLY THE YAML CONTENT. NO EXPLANATIONS, NO MARKDOWN, NO COMMENTS OUTSIDE YAML.**',
    )
    sections.push('**START DIRECTLY WITH: version: "1.0"**')

    // If there are ItemReaders, remind about data file references
    if (hasState(stateMachine, StateFilters.hasItemReader)) {
      sections.push('')
      sections.push(
        '**⚠️ REMEMBER: Include all ItemReader mocks with dataFile references in the YAML ⚠️**',
      )
      sections.push('**Data files will be generated separately based on your YAML configuration.**')
    }

    return sections.join('\n\n')
  }

  /**
   * Build test generation prompt
   */
  buildTestPrompt(stateMachine: StateMachine, mockContent?: string): string {
    const sections: string[] = []
    const hierarchy = this.analyzer.analyzeHierarchy(stateMachine)

    // テスト専用のYAMLルールを最初に置くことでAIが確実に遵守
    sections.push(this.getTestYamlOutputRules())

    // TypeScript型定義から生成したスキーマを提示（テスト部分のみ）
    sections.push(this.extractTestTypeDefinitions())

    // 利用可能なステート名を明示して誤りを防止
    sections.push(this.getAvailableStatesSection(stateMachine))

    // Critical test rules
    sections.push(this.getTestCriticalRules())

    // Add output transformation guidance if needed
    const hasOutputTransformation = detectOutputTransformation(stateMachine)
    if (hasOutputTransformation) {
      const transformationDetails = getOutputTransformationDetails(stateMachine)
      sections.push(this.getOutputTransformationGuidance(transformationDetails))
    }

    // Dynamic field detection
    const dynamicFields = detectDynamicFields(stateMachine)
    if (dynamicFields.length > 0) {
      sections.push(this.getDynamicFieldGuidance(dynamicFields))
    }

    // Structure analysis
    const structureExplanation = this.analyzer.generateStructureExplanation(hierarchy)
    if (structureExplanation) {
      sections.push(structureExplanation)
    }

    // Add specialized test guidance based on state types
    const hasParallel = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Parallel')
    const hasMap = Object.values(hierarchy.nestedStructures).some((s) => s.type === 'Map')
    const hasDistributedMap = Object.values(hierarchy.nestedStructures).some(
      (s) => s.type === 'DistributedMap',
    )

    if (hasParallel) {
      sections.push(this.getParallelTestGuidance())
    }
    if (hasMap) {
      sections.push(this.getMapTestGuidance())
    }
    if (hasDistributedMap) {
      sections.push(this.getDistributedMapTestGuidance())
    }

    // Add Variables guidance if needed
    if (hasState(stateMachine, StateFilters.hasVariables)) {
      sections.push(this.getVariablesTestGuidance())
    }

    // Add state machine and mock
    sections.push('## State Machine Definition')
    sections.push('```json')
    sections.push(JSON.stringify(stateMachine, null, 2))
    sections.push('```')

    if (mockContent) {
      sections.push('## Mock Configuration')
      sections.push('```yaml')
      sections.push(mockContent)
      sections.push('```')
    }

    // Re-emphasize the output format at the end
    sections.push('## FINAL REMINDER')
    sections.push(
      '**OUTPUT ONLY THE YAML CONTENT. NO EXPLANATIONS, NO MARKDOWN, NO COMMENTS OUTSIDE YAML.**',
    )
    sections.push('**START DIRECTLY WITH: version: "1.0"**')

    return sections.join('\n\n')
  }

  private getAvailableStatesSection(stateMachine: StateMachine): string {
    const states = Object.keys(stateMachine.States || {})
    if (states.length === 0) {
      return ''
    }

    return `## Available States in This State Machine

⚠️ IMPORTANT: Only use state names from this list ⚠️

The following states exist in the state machine:
${states.map((s) => `- "${s}"`).join('\n')}

**Critical**: 
- Use these exact state names (case-sensitive)
- Do NOT create or reference states that are not in this list
- This list shows TOP-LEVEL states only. See "Mockable States" section for all states that can be mocked`
  }

  private getMockYamlOutputRules(): string {
    try {
      const common = fs.readFileSync(
        path.join(this.promptsDir, 'yaml-output-rules-common.md'),
        'utf-8',
      )
      const mock = fs.readFileSync(path.join(this.promptsDir, 'yaml-output-rules-mock.md'), 'utf-8')
      return `${common}\n\n${mock}`
    } catch {
      return this.getDefaultMockYamlOutputRules()
    }
  }

  private getTestYamlOutputRules(): string {
    try {
      const common = fs.readFileSync(
        path.join(this.promptsDir, 'yaml-output-rules-common.md'),
        'utf-8',
      )
      const test = fs.readFileSync(path.join(this.promptsDir, 'yaml-output-rules-test.md'), 'utf-8')
      return `${common}\n\n${test}`
    } catch {
      return this.getDefaultTestYamlOutputRules()
    }
  }

  private getDefaultMockYamlOutputRules(): string {
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

  private getDefaultTestYamlOutputRules(): string {
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

  private getCriticalRules(): string {
    return `# CRITICAL RULES FOR MOCK GENERATION

## Mock Structure Rules
1. Use the exact state names from the state machine
2. For Lambda tasks, wrap response in { Payload: {...}, StatusCode: ${HTTP_STATUS_OK} }
3. For Parallel states, mock at the parent level, not individual branches
4. For Map/Parallel nested states: use ONLY the nested state name (no parent prefix)

⚠️⚠️⚠️ CRITICAL NAMING RULE ⚠️⚠️⚠️
- Map ItemProcessor states: use "NestedStateName" NOT "MapState.ItemProcessor.NestedStateName"
- Parallel Branch states: use "BranchStateName" NOT "ParallelState.Branch[0].BranchStateName"
- Nested states are referenced by their own name only, without parent hierarchy`
  }

  private getTestCriticalRules(): string {
    return `# CRITICAL RULES FOR TEST GENERATION

⚠️⚠️⚠️ RULE #1: ALWAYS USE outputMatching: "partial" FOR ALL STATE EXPECTATIONS ⚠️⚠️⚠️
⚠️⚠️⚠️ RULE #2: NEVER INCLUDE TIMESTAMPS OR DATES IN EXPECTATIONS ⚠️⚠️⚠️
⚠️⚠️⚠️ RULE #3: NEVER USE stateExpectations FOR MAP/PARALLEL INTERNAL STATES ⚠️⚠️⚠️

## 🔴 CRITICAL: Map/Parallel Internal State Testing Rules 🔴

**ABSOLUTELY FORBIDDEN:**
❌ NEVER use stateExpectations for states inside Map ItemProcessor
❌ NEVER use stateExpectations for states inside Parallel branches
❌ NEVER use stateExpectations for states inside DistributedMap ItemProcessor

**REQUIRED INSTEAD:**
✅ Use mapExpectations for Map internal state testing
✅ Use parallelExpectations for Parallel branch state testing
✅ Use mapExpectations for DistributedMap internal state testing

**CORRECT EXAMPLE:**
\`\`\`yaml
testCases:
  - name: "Test with Map and Parallel"
    input: {...}
    # ✅ CORRECT: Top-level states use stateExpectations
    stateExpectations:
      - state: "PrepareData"  # Top-level state
        output: {...}
      - state: "FinalizeResults"  # Top-level state
        output: {...}
    # ✅ CORRECT: Map internal states use mapExpectations
    mapExpectations:
      - state: "ProcessItems"  # Map state name
        iterationCount: 3
        iterationPaths:
          all: ["ValidateItem", "TransformItem"]  # Internal states
    # ✅ CORRECT: Parallel branch states use parallelExpectations  
    parallelExpectations:
      - state: "ParallelTasks"  # Parallel state name
        branchCount: 2
        branchPaths:
          0: ["CheckServiceA", "UpdateServiceA"]  # Branch 0 states
          1: ["CheckServiceB", "UpdateServiceB"]  # Branch 1 states
\`\`\`

**WRONG EXAMPLE (WILL FAIL):**
\`\`\`yaml
# ❌ WRONG: Using stateExpectations for Map internal states
stateExpectations:
  - state: "ValidateItem"  # This is INSIDE a Map!
    output: {...}
  - state: "CheckServiceA"  # This is INSIDE a Parallel!
    output: {...}
\`\`\`

## TIMESTAMP RULES - CRITICAL
**⚠️ NEVER INCLUDE THESE FIELDS IN STATE EXPECTATIONS:**
- StartDate, EndDate, StopDate
- createdAt, updatedAt, timestamp
- Any field containing ISO date strings (e.g., "2024-01-15T10:00:00.000Z")
- Any field that looks like a date or time

**WHY:** Timestamps change on every execution. Including them causes tests to fail.
**SOLUTION:** Use outputMatching: "partial" and omit all timestamp fields from expectations.

## REQUIRED TEST FILE STRUCTURE
\`\`\`yaml
version: "1.0"
name: "Suite Name"
stateMachine: "<path to ASL file>"  # ⚠️ REQUIRED FIELD
settings:
  timeout: 10000  # optional, in milliseconds
testCases:  # ⚠️ NOT "tests" - MUST BE "testCases"
  - name: "Test name"
    input: {...}
    expectedPath: [...]  # optional
    stateExpectations:  # For TOP-LEVEL states ONLY
      - state: "StateName"  # ⚠️ NOT "stateName" - MUST BE "state"
        outputMatching: "partial"  # ⚠️ ALWAYS "partial"
        output: 
          # Include only stable fields, NEVER timestamps
          ExecutionArn: "..."  # OK - stable
          Status: "SUCCEEDED"  # OK - stable
          # StartDate: "..."  # ❌ NEVER include
          # StopDate: "..."   # ❌ NEVER include
    mapExpectations:  # For Map internal states
      - state: "MapStateName"
        iterationCount: 3
    parallelExpectations:  # For Parallel branch states
      - state: "ParallelStateName"
        branchCount: 2
\`\`\`

## Test Structure Rules
1. MUST include "stateMachine" field at root level
2. MUST use "testCases" NOT "tests"
3. stateExpectations is ONLY for top-level states
4. mapExpectations is ONLY for Map state iteration testing
5. parallelExpectations is ONLY for Parallel branch testing
6. MUST use "state" NOT "stateName" in expectations
7. Every expectation MUST have outputMatching: "partial"
8. Variables go in stateExpectations.variables, NOT in output
9. **⚠️ NEVER include timestamps, dates, or time-related fields in expectations ⚠️**
10. When copying from mock data, ALWAYS remove timestamp fields
11. For Parallel states, expect array output
12. For Map states, expect array output
13. For Distributed Map, expect execution metadata
14. DO NOT use "maxSteps" - it's not a valid field`
  }

  private getParallelSpecializedPrompt(): string {
    try {
      return fs.readFileSync(path.join(this.promptsDir, 'parallel-specialized.md'), 'utf-8')
    } catch {
      return this.getDefaultParallelPrompt()
    }
  }

  private getMapSpecializedPrompt(): string {
    try {
      return fs.readFileSync(path.join(this.promptsDir, 'map-specialized.md'), 'utf-8')
    } catch {
      return this.getDefaultMapPrompt()
    }
  }

  private getDistributedMapSpecializedPrompt(): string {
    try {
      return fs.readFileSync(path.join(this.promptsDir, 'distributed-map-specialized.md'), 'utf-8')
    } catch {
      return this.getDefaultDistributedMapPrompt()
    }
  }

  private getMockableStatesGuidance(mockableStates: string[]): string {
    return `## Mockable States for This State Machine

The following states can be mocked:
${mockableStates.map((s) => `- ${s}`).join('\n')}

**Important for Parallel States**: 
- Mock states inside Parallel branches using their state name ONLY (e.g., "CheckServiceA", NOT "ParallelChecks.CheckServiceA")
- Each branch state needs its own mock definition
- The Parallel state itself does NOT need a mock

**Important for Map States**:
- For inline Map: Mock the Map state itself OR individual states inside ItemProcessor
- For distributed Map: Mock the Map state for ItemReader data, and individual processor states as needed`
  }

  private getParallelTestGuidance(): string {
    return `## Testing Parallel States

🔴 **CRITICAL: NEVER use stateExpectations for states inside Parallel branches!** 🔴

For Parallel states in your tests:
1. The Parallel state output is an ARRAY with one element per branch
2. Each array element contains the output from that branch
3. Always use outputMatching: "partial" for flexibility
4. Test the combined output at the Parallel state level using stateExpectations
5. **Use parallelExpectations to test branch execution paths**

**CORRECT STRUCTURE:**
\`\`\`yaml
# Test the Parallel state output
stateExpectations:
  - state: "ParallelProcessing"  # The Parallel state itself
    outputMatching: "partial"
    output: [result1, result2]  # Array of branch results

# Test the branch execution paths
parallelExpectations:
  - state: "ParallelProcessing"
    branchCount: 2
    branchPaths:
      0: ["BranchATask1", "BranchATask2"]
      1: ["BranchBTask1", "BranchBTask2"]
\`\`\`

❌ **NEVER DO THIS:**
\`\`\`yaml
stateExpectations:
  - state: "BranchATask1"  # WRONG! This is inside Parallel
    output: {...}
\`\`\``
  }

  private getMapTestGuidance(): string {
    return `## Testing Map States

🔴 **CRITICAL: NEVER use stateExpectations for states inside Map ItemProcessor!** 🔴

For Map states in your tests:
1. The Map state output is an ARRAY of processed items
2. Each array element is the result of processing one input item
3. Test both empty arrays and multiple items
4. Consider MaxConcurrency effects on execution order
5. **Use mapExpectations to test iteration behavior**

**CORRECT STRUCTURE:**
\`\`\`yaml
# Test the Map state output
stateExpectations:
  - state: "ProcessItems"  # The Map state itself
    outputMatching: "partial"
    output: [item1Result, item2Result]  # Array of results

# Test the iteration behavior
mapExpectations:
  - state: "ProcessItems"
    iterationCount: 2
    iterationPaths:
      all: ["ValidateItem", "TransformItem", "SaveItem"]
\`\`\`

❌ **NEVER DO THIS:**
\`\`\`yaml
stateExpectations:
  - state: "ValidateItem"  # WRONG! This is inside Map
    output: {...}
\`\`\``
  }

  private getDistributedMapTestGuidance(): string {
    return `## Testing Distributed Map States

🔴 **CRITICAL: NEVER use stateExpectations for states inside DistributedMap ItemProcessor!** 🔴

For Distributed Map states:
1. Output contains execution metadata (ProcessedItemCount, FailedItemCount, etc.)
2. NOT an array like regular Map
3. Test ResultWriterDetails for S3 output location
4. Consider testing with different batch sizes
5. **Use mapExpectations to test processor behavior**

**CORRECT STRUCTURE:**
\`\`\`yaml
# Test the DistributedMap state output
stateExpectations:
  - state: "BatchProcessing"  # The DistributedMap state itself
    outputMatching: "partial"
    output:
      ProcessedItemCount: 100
      FailedItemCount: 0

# Test the processor behavior
mapExpectations:
  - state: "BatchProcessing"
    iterationCount: 100
    iterationPaths:
      samples:
        0: ["LoadItem", "ProcessItem", "StoreResult"]
\`\`\`

❌ **NEVER DO THIS:**
\`\`\`yaml
stateExpectations:
  - state: "ProcessItem"  # WRONG! This is inside DistributedMap
    output: {...}
\`\`\``
  }

  private getVariablesTestGuidance(): string {
    return `## Testing Variables

When testing states with Variables:
1. Put variable expectations in stateExpectations.variables
2. Variables are separate from state output
3. Test variable persistence across states
4. Verify variable values change as expected`
  }

  private getLambdaIntegrationRules(): string {
    return `## Lambda Integration Rules

### 🚨 CRITICAL: Lambda Task Mock Patterns

AWS Step Functions has TWO Lambda integration patterns:

#### 1. OPTIMIZED INTEGRATION (arn:aws:states:::lambda:invoke) - MOST COMMON
**Parameters.Payload mapping rule for conditional mocks:**
- If the state has Parameters.Payload, the mock condition MUST use input.Payload

**Example ASL with Parameters.Payload:**
\`\`\`json
"Parameters": {
  "Payload.$": "$.data"
}
\`\`\`

**Corresponding conditional mock structure:**
\`\`\`yaml
- state: "LambdaTaskName"
  type: "conditional"
  conditions:
    - when:
        input:              # REQUIRED wrapper
          Payload:          # REQUIRED for Lambda input matching
            userId: "123"   # Your condition fields
      response:
        ExecutedVersion: "$LATEST"
        Payload:            # REQUIRED for Lambda response
          result: "success"
        StatusCode: ${HTTP_STATUS_OK}
    - default:
        ExecutedVersion: "$LATEST"
        Payload:
          result: "default"
        StatusCode: ${HTTP_STATUS_OK}
\`\`\`

#### 2. DIRECT ARN (arn:aws:lambda:region:account:function:name) - RARE
- No Payload wrapper needed for input or output
- Direct mock structure without Payload field

### ⚠️ COMMON MISTAKES TO AVOID

❌ **WRONG** (missing Payload wrapper for optimized integration):
\`\`\`yaml
- state: "GetUser"
  type: "conditional"
  conditions:
    - when:
        input:          # Missing Payload!
          userId: "123"
      response:         # Missing Payload wrapper!
        name: "John"
\`\`\`

✅ **CORRECT** (with Payload wrapper for optimized integration):
\`\`\`yaml
- state: "GetUser"
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:      # Required!
            userId: "123"
      response:
        Payload:        # Required!
          name: "John"
        StatusCode: ${HTTP_STATUS_OK}
        ExecutedVersion: "$LATEST"
\`\`\`

### Lambda Mock Response Format
- Response MUST include: { Payload: {...}, StatusCode: ${HTTP_STATUS_OK}, ExecutedVersion: "$LATEST" }
- The actual Lambda response goes in the Payload field
- StatusCode should typically be ${HTTP_STATUS_OK} for success
- Include ExecutedVersion for completeness`
  }

  private getVariablesRules(): string {
    return `## Variables and Assign Rules

Variables are stored separately from state output:
- Use Assign field to set variables
- Access variables with $variableName
- Variables persist across states
- Test variables in stateExpectations.variables`
  }

  private getDefaultParallelPrompt(): string {
    return `## Parallel State Guidance

### ⚠️ CRITICAL: Parallel State Mock Pattern ⚠️

**Parallel states execute branches INDEPENDENTLY and IN PARALLEL.**

**How to mock Parallel state tasks:**
1. **DO NOT mock the Parallel state itself** - it's a control flow state
2. **MOCK INDIVIDUAL TASK STATES INSIDE EACH BRANCH** - these are the actual execution points
3. **Use state name ONLY** - e.g., "CheckServiceA", NOT "ParallelChecks.Branch[0].CheckServiceA"

**Example for a Parallel state with 2 branches:**
\`\`\`yaml
# Branch 1 has task "CheckServiceA"
- state: "CheckServiceA"
  type: "fixed"
  response:
    Payload:
      status: "healthy"
      
# Branch 2 has tasks "CheckServiceB" and "ProcessServiceBResult"  
- state: "CheckServiceB"
  type: "fixed"
  response:
    Payload:
      status: "degraded"
      
- state: "ProcessServiceBResult"
  type: "fixed"
  response:
    Payload:
      processed: true
\`\`\`

**Runtime behavior:**
- Parallel state collects outputs from all branches into an array
- Output: [branch1_result, branch2_result, ...]
- Each branch runs independently with its own mocks`
  }

  private getDefaultMapPrompt(): string {
    return `## Map State Guidance
- Can mock entire Map state or individual nested states inside Map
- For nested states: use ONLY the state name (e.g., "ProcessItem" NOT "MapState.ItemProcessor.ProcessItem")
- Output is an array of processed items
- Consider using conditional mocks for item-specific logic`
  }

  private getDefaultDistributedMapPrompt(): string {
    return `## Distributed Map Guidance

### ⚠️⚠️⚠️ CRITICAL: DistributedMap REQUIRES TWO MOCKS ⚠️⚠️⚠️

**EVERY DistributedMap needs BOTH:**
1. **ItemReader mock (MANDATORY)** - for input data
2. **State result mock** - for output metadata

### 🔴 CRITICAL: ItemReader Data MUST Match ItemProcessor Requirements

**Each item from ItemReader becomes the input to ItemProcessor states!**

Before creating the ItemReader mock, you MUST:
1. **Analyze the ItemProcessor's first state** - What fields does it expect?
2. **Check Choice conditions** - Variables like \`$.orderId\` indicate required fields
3. **Look at Parameters/ItemSelector** - These show field transformations
4. **Generate matching data** - Each item must have the required fields

Example: If ItemProcessor has a Choice checking \`$.status\` and \`$.amount\`:
\`\`\`yaml
- state: "ProcessOrders"
  type: "itemReader"
  dataFile: "orders.json"
  # Generated file MUST contain: [{"status": "pending", "amount": 100}, ...]
\`\`\`

### MANDATORY ItemReader Mock:
**⚠️ YOU MUST ALWAYS INCLUDE THIS FOR DISTRIBUTEDMAP WITH ITEMREADER ⚠️**
\`\`\`yaml
- state: "YourDistributedMapStateName"
  type: "itemReader"
  dataFile: "your-items.jsonl"  # External file with test data
  dataFormat: "jsonl"  # Match the ItemReader.ReaderConfig.InputType
\`\`\`

### DistributedMap Output (Automatically Generated):
The DistributedMap executor automatically generates the output based on ItemReader data:
- **Without ResultWriter**: Returns an array of processed results
- **With ResultWriter**: Returns metadata object with ProcessedItemCount and ResultWriterDetails

**⚠️ DO NOT CREATE A FIXED MOCK FOR DISTRIBUTEDMAP OUTPUT ⚠️**
The executor handles this automatically based on ItemReader processing.

### ItemReader Requirements:
- **S3:listObjectsV2**: Mock S3 object list
- **S3:getObject with InputType: JSONL**: Mock JSONL file content
- **S3:getObject with InputType: CSV**: Mock CSV data
- **S3:getObject with InputType: JSON**: Mock JSON array
- **S3:getObject with InputType: MANIFEST**: Mock S3 inventory manifest

**⚠️ NEVER SKIP THE ITEMREADER MOCK FOR DISTRIBUTEDMAP ⚠️**`
  }

  private getItemReaderMandatorySection(
    itemReaderStates: Array<{
      name: string
      itemReader: ItemReader
      hasResultWriter: boolean
    }>,
  ): string {
    const sections: string[] = []

    sections.push('## ⚠️⚠️⚠️ MANDATORY ITEMREADER MOCKS AND DATA FILES ⚠️⚠️⚠️')
    sections.push('')
    sections.push('**THE FOLLOWING ITEMREADER MOCKS AND DATA FILES ARE REQUIRED:**')
    sections.push('')

    itemReaderStates.forEach(({ name, itemReader }) => {
      const readerConfig = itemReader.ReaderConfig || {}
      const inputType = (readerConfig.InputType as string) || 'JSONL'
      const resource = (itemReader.Resource as string) || ''
      const dataFileName = `${name.toLowerCase().replace(/\s+/g, '-')}-items.${inputType.toLowerCase()}`

      sections.push(`### State: "${name}"`)
      sections.push(`- Resource: ${resource}`)
      sections.push(`- InputType: ${inputType}`)
      sections.push('')

      // Data file content requirements
      sections.push(`**1. CREATE DATA FILE: "${dataFileName}"**`)
      sections.push(`\`\`\`${inputType.toLowerCase()}`)

      if (inputType === 'JSONL') {
        sections.push('{"id": "item-1", "name": "First Item", "value": 100}')
        sections.push('{"id": "item-2", "name": "Second Item", "value": 200}')
        sections.push('{"id": "item-3", "name": "Third Item", "value": 300}')
      } else if (inputType === 'JSON') {
        sections.push('[')
        sections.push('  {"id": "item-1", "name": "First Item", "value": 100},')
        sections.push('  {"id": "item-2", "name": "Second Item", "value": 200},')
        sections.push('  {"id": "item-3", "name": "Third Item", "value": 300}')
        sections.push(']')
      } else if (inputType === 'CSV') {
        sections.push('id,name,value')
        sections.push('item-1,First Item,100')
        sections.push('item-2,Second Item,200')
        sections.push('item-3,Third Item,300')
      } else if (inputType === 'MANIFEST') {
        sections.push('{"Bucket": "my-bucket", "Key": "object1.json", "Size": 1024}')
        sections.push('{"Bucket": "my-bucket", "Key": "object2.json", "Size": 2048}')
        sections.push('{"Bucket": "my-bucket", "Key": "object3.json", "Size": 3072}')
      }

      sections.push('```')
      sections.push('')

      sections.push('**2. ADD ITEMREADER MOCK IN YAML:**')
      sections.push('```yaml')
      sections.push(`- state: "${name}"`)
      sections.push('  type: "itemReader"')
      sections.push(`  dataFile: "${dataFileName}"`)
      sections.push(`  dataFormat: "${inputType.toLowerCase()}"`)
      sections.push('```')
      sections.push('')

      // Note: DistributedMap result is automatically generated by the executor
      // No need for a separate fixed mock
      sections.push(
        '**NOTE:** The DistributedMap result (ProcessedItemCount, ResultWriterDetails, etc.)',
      )
      sections.push('is automatically generated by the executor based on the ItemReader data.')
      sections.push('DO NOT create a separate fixed mock for DistributedMap states.')
      sections.push('')
    })

    sections.push('## IMPORTANT NOTES:')
    sections.push('1. **Include the ItemReader mocks in your YAML output**')
    sections.push('2. **Reference the data file names correctly in dataFile field**')
    sections.push(
      '3. **Data files shown above are examples - actual files will be generated separately**',
    )
    sections.push('')
    sections.push('**⚠️ YOUR YAML MUST INCLUDE ALL ITEMREADER MOCKS SHOWN ABOVE ⚠️**')

    return sections.join('\n')
  }

  hasProblematicChoicePatterns(stateMachine: StateMachine): boolean {
    // Structure-based analysis for potential infinite loops
    const result = this.detectChoiceLoops(stateMachine)
    return result.hasProblematicPatterns || result.hasStructuralLoops
  }

  detectChoiceLoops(stateMachine: StateMachine): {
    hasProblematicPatterns: boolean
    hasStructuralLoops: boolean
    problematicStates: string[]
  } {
    const problematicStates: string[] = []
    let hasProblematicPatterns = false
    let hasStructuralLoops = false

    // Non-deterministic patterns for both JSONPath and JSONata
    // These are common patterns, but we also check for general categories
    const nonDeterministicPatterns = {
      jsonpath: [
        // Dynamic timestamps
        'TimestampEquals',
        'TimestampEqualsPath',
        'TimestampLessThanPath',
        'TimestampGreaterThanPath',
        'TimestampLessThanEquals',
        'TimestampGreaterThanEquals',
        // Context variables that change
        '$$.State.EnteredTime',
        '$$.Execution.StartTime',
        '$$.State.Name',
        '$$.Task.Token',
        '$$.State.RetryCount',
        '$$.Map.Item.Index',
      ],
      jsonata: [
        // JSONata non-deterministic functions
        '$random',
        '$uuid',
        '$now',
        '$millis',
        // Context functions (correct paths)
        '$states.context.State.EnteredTime',
        '$states.context.State.RetryCount',
        '$states.context.Execution.StartTime',
        '$states.context.State.Name',
        // Also check for general patterns (case-insensitive)
        'random',
        'uuid',
        'time',
        'date',
        'timestamp',
        'millis',
        'now',
      ],
      // General suspicious patterns that might indicate non-determinism
      general: [
        'retry',
        'attempt',
        'count',
        'iteration',
        'poll',
        'wait',
        'timeout',
        'deadline',
        'expire',
      ],
    }

    // Handle missing States object
    if (!stateMachine.States) {
      return {
        hasProblematicPatterns: false,
        hasStructuralLoops: false,
        problematicStates: [],
      }
    }

    // StateMachine should already contain processed State instances
    const states = stateMachine.States as Record<string, State>

    // Build a state graph for structural analysis
    const stateGraph = this.buildStateGraph(states)

    // Check each Choice state
    for (const [stateName, state] of Object.entries(states)) {
      if (state.isChoice()) {
        const isJSONata = state.isJSONataState()

        // Check for non-deterministic conditions
        const choices = state.Choices
        if (isJSONata && choices) {
          // JSONata mode - check Condition field
          for (const choice of choices) {
            if ('Condition' in choice && !('Variable' in choice)) {
              const conditionStr = JSON.stringify(choice.Condition).toLowerCase()

              // Check specific JSONata patterns
              const hasSpecificPattern = nonDeterministicPatterns.jsonata.some((pattern) =>
                conditionStr.includes(pattern.toLowerCase()),
              )

              // Check general suspicious patterns
              const hasGeneralPattern = nonDeterministicPatterns.general.some((pattern) =>
                conditionStr.includes(pattern.toLowerCase()),
              )

              if (hasSpecificPattern || hasGeneralPattern) {
                hasProblematicPatterns = true
                problematicStates.push(stateName)
                break
              }
            }
          }
        } else if (choices) {
          // JSONPath mode - check Variable and comparison operators
          for (const choice of choices) {
            // Check if choice object has any timestamp comparison operators
            const hasTimestampOperator = Object.keys(choice).some((key) =>
              nonDeterministicPatterns.jsonpath.some((pattern) => key.includes(pattern)),
            )

            // Also check the values for context variables
            const choiceStr = JSON.stringify(choice)
            const hasContextVariable = nonDeterministicPatterns.jsonpath.some(
              (pattern) => pattern.startsWith('$$') && choiceStr.includes(pattern),
            )

            // Check general suspicious patterns (case-insensitive)
            const choiceStrLower = choiceStr.toLowerCase()
            const hasGeneralPattern = nonDeterministicPatterns.general.some((pattern) =>
              choiceStrLower.includes(pattern.toLowerCase()),
            )

            if (hasTimestampOperator || hasContextVariable || hasGeneralPattern) {
              hasProblematicPatterns = true
              problematicStates.push(stateName)
              break
            }
          }
        }

        // Structural loop detection - can this Choice create a loop?
        const possibleNextStates = this.getChoiceNextStates(state)
        for (const nextState of possibleNextStates) {
          if (this.canReachState(stateGraph, nextState, stateName)) {
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

  private buildStateGraph(states: Record<string, State>): Map<string, string[]> {
    const graph = new Map<string, string[]>()

    for (const [stateName, state] of Object.entries(states || {})) {
      const nextStates: string[] = []

      if (state.Next && typeof state.Next === 'string') {
        nextStates.push(state.Next)
      }

      if (state.isChoice()) {
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

  private getChoiceNextStates(choiceState: ChoiceState): string[] {
    const nextStates: string[] = []
    const choices = choiceState.Choices || []
    for (const choice of choices) {
      if (choice.Next && typeof choice.Next === 'string') nextStates.push(choice.Next)
    }
    const defaultState = choiceState.Default
    if (defaultState && typeof defaultState === 'string') nextStates.push(defaultState)
    return nextStates
  }

  private canReachState(
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
      if (this.canReachState(graph, next, target, visited)) {
        return true
      }
    }

    return false
  }

  private getChoiceMockGuidelines(analysis?: {
    hasProblematicPatterns: boolean
    hasStructuralLoops: boolean
    problematicStates: string[]
  }): string {
    let guidelines: string
    try {
      guidelines = fs.readFileSync(path.join(this.promptsDir, 'choice-mock-guidelines.md'), 'utf-8')
    } catch {
      guidelines = this.getDefaultChoiceMockGuidelines()
    }

    // Add specific detection message if analysis is provided
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

  private getDefaultChoiceMockGuidelines(): string {
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
    - nextState: "PathA"     # First execution
    - nextState: "PathB"     # Second execution  
    - nextState: "Complete"  # Force completion

# Structural loop prevention
- state: "RetryChoice"
  type: "stateful"
  responses:
    - nextState: "ProcessTask"    # Allow 2 retries
    - nextState: "ProcessTask"
    - nextState: "CompleteWork"   # Force exit
\`\`\``
  }

  /**
   * Generate data flow guidance for improved mock generation
   */
  private getDataFlowGuidance(analysis: {
    choiceDependencies: ChoiceDependency[]
    mapOutputSpecs: MapOutputSpec[]
    passVariableFlows: PassVariableFlow[]
    consistencyIssues: string[]
    recommendations: string[]
  }): string {
    const sections: string[] = []

    sections.push('## Data Flow Analysis and Mock Recommendations')
    sections.push('')

    if (analysis.consistencyIssues.length > 0) {
      sections.push('⚠️ **CRITICAL: Data flow inconsistencies detected** ⚠️')
      sections.push('')
      sections.push('The following issues must be addressed in your mocks:')
      sections.push('')

      for (const issue of analysis.consistencyIssues) {
        sections.push(`### Data Flow Issue`)
        sections.push(issue)
        sections.push('')
      }
    }

    // Choice dependency guidance
    if (analysis.choiceDependencies.length > 0) {
      sections.push('### Choice State Dependencies')
      sections.push('')
      sections.push('The following Choice states have specific field requirements:')
      sections.push('')

      for (const dep of analysis.choiceDependencies) {
        sections.push(`#### ${dep.choiceStateName}`)
        sections.push(`Required fields: ${dep.requiredFields.join(', ')}`)
        sections.push(`Field types: ${JSON.stringify(dep.fieldTypes)}`)
        sections.push('')

        if (dep.upstreamRequirements.length > 0) {
          sections.push('**Upstream state requirements:**')
          for (const req of dep.upstreamRequirements) {
            sections.push(`- ${req.targetStateName || 'Any upstream state'}: ${req.reason}`)
            sections.push(`  Required fields: ${req.requiredOutputFields.join(', ')}`)
          }
          sections.push('')
        }
      }
    }

    // Map output requirements
    if (analysis.mapOutputSpecs.length > 0) {
      sections.push('### Map State Output Requirements')
      sections.push('')

      for (const spec of analysis.mapOutputSpecs) {
        sections.push(`#### ${spec.stateName}`)

        if (spec.requiredFields.length > 0) {
          sections.push('**Required fields:**')
          for (const field of spec.requiredFields) {
            sections.push(`- ${field.field} (${field.type}): ${field.description}`)
          }
        }

        if (spec.dynamicFields.length > 0) {
          sections.push('**Dynamic fields:**')
          for (const field of spec.dynamicFields) {
            sections.push(`- ${field.field}: ${field.calculation}`)
          }
        }

        if (spec.conditionalLogic) {
          sections.push(`**Conditional logic:** ${spec.conditionalLogic}`)
        }

        sections.push('')
      }
    }

    // Pass variable flows
    if (analysis.passVariableFlows.length > 0) {
      sections.push('### Pass State Variable Dependencies')
      sections.push('')

      for (const flow of analysis.passVariableFlows) {
        sections.push(`#### ${flow.passStateName}`)
        sections.push(`Variables set: ${JSON.stringify(flow.variables)}`)

        if (flow.choiceCompatibility) {
          sections.push('**Downstream Choice compatibility:**')
          sections.push(
            `Compatible states: ${flow.choiceCompatibility.compatibleChoiceStates.join(', ')}`,
          )
          if (flow.choiceCompatibility.missingFields.length > 0) {
            sections.push(`Missing fields: ${flow.choiceCompatibility.missingFields.join(', ')}`)
          }
          if (flow.choiceCompatibility.recommendedChanges.length > 0) {
            sections.push(
              `Recommendations: ${flow.choiceCompatibility.recommendedChanges.join('; ')}`,
            )
          }
        }
        sections.push('')
      }
    }

    if (sections.length === 2) {
      sections.push('✅ No critical data flow issues detected. Standard mocking practices apply.')
    }

    return sections.join('\n')
  }

  /**
   * Generate output transformation guidance for test generation
   */
  private getOutputTransformationGuidance(
    transformationDetails: ReturnType<typeof getOutputTransformationDetails>,
  ): string {
    if (transformationDetails.length === 0) {
      return ''
    }

    // Group by transformation type
    const jsonPathTransforms = transformationDetails.filter((d) =>
      ['ResultSelector', 'OutputPath', 'ResultPath'].includes(d.transformationType),
    )
    const jsonataTransforms = transformationDetails.filter((d) =>
      ['JSONataOutput', 'JSONataAssign'].includes(d.transformationType),
    )

    let guidance = `## 🔧 CRITICAL: Output Transformation Detected

# ⚠️ IMPORTANT: Test Expectation Adjustment Required ⚠️

**THIS STATE MACHINE TRANSFORMS OUTPUT DATA**
**TEST EXPECTATIONS MUST MATCH THE TRANSFORMED OUTPUT, NOT RAW TASK RESULTS**

☕ Understanding: When states use JSONPath (ResultSelector/OutputPath/ResultPath) or JSONata (Output/Assign)
to transform output, test expectations should match the TRANSFORMED result.
`

    if (jsonPathTransforms.length > 0) {
      const stateList = jsonPathTransforms
        .map(
          (detail) => `- **${detail.stateName}** (${detail.transformationType}): ${detail.reason}`,
        )
        .join('\n')

      // Simplified example without field-specific logic

      guidance += `
### JSONPath Transformations

${stateList}

**Test Expectation Rules for JSONPath:**
\`\`\`yaml
stateExpectations:
  # For ResultSelector: Only expect the selected fields
  - state: "StateWithResultSelector"
    output:
      selectedField: "value"  # Only fields specified in ResultSelector

  # For OutputPath: Only expect the filtered portion
  - state: "StateWithOutputPath" 
    output: "filtered_value"  # Only the portion specified by OutputPath

  # For ResultPath: Expect merged input + result
  - state: "StateWithResultPath"
    output:
      # Original input fields remain
      originalField: "value"
      # Result is merged at specified path
      resultField: "task_result"
\`\`\`
`
    }

    if (jsonataTransforms.length > 0) {
      const stateList = jsonataTransforms
        .map(
          (detail) => `- **${detail.stateName}** (${detail.transformationType}): ${detail.reason}`,
        )
        .join('\n')

      guidance += `
### JSONata Transformations

${stateList}

**Test Expectation Rules for JSONata:**
\`\`\`yaml
stateExpectations:
  # For JSONata Output: Expect the computed result
  - state: "StateWithJSONataOutput"
    output:
      # The result of JSONata expression evaluation
      computedField: "computed_value"
      
  # For JSONata Assign: Expect input + assigned values  
  - state: "StateWithJSONataAssign"
    output:
      # Original input preserved
      originalField: "value"
      # Assigned values added/updated
      assignedField: "assigned_value"
\`\`\`
`
    }

    guidance += `
### ⚡ ACTION REQUIRED ⚡

1. **ANALYZE** each transformation above to understand what the output should be
2. **MATCH** test expectations to the transformed output, not the raw task response
3. **VERIFY** that transformations are correctly represented in your test expectations
4. **TEST** various input scenarios to ensure transformations work as expected

### 🔴 KEY PRINCIPLE 🔴

**Test what the state ACTUALLY outputs, not what the underlying task returns.**
Transformation changes the shape and content of the output - your tests must reflect this.
`

    return guidance
  }

  /**
   * Generate guidance for states with dynamic fields
   */
  private getDynamicFieldGuidance(
    dynamicFields: Array<{ stateName: string; dynamicPaths: string[]; reason: string }>,
  ): string {
    const stateList = dynamicFields
      .map(
        (d) => `- **${d.stateName}**: ${d.reason}\n  Dynamic fields: ${d.dynamicPaths.join(', ')}`,
      )
      .join('\n')

    return `## ⏰ CRITICAL: Dynamic Fields Detected

# ⚠️ DYNAMIC VALUES DETECTED IN THESE STATES ⚠️

The following states contain dynamic fields that change on every execution:

${stateList}

### ℹ️ Note: Partial Matching is Default

Since outputMatching defaults to "partial", these dynamic fields will be handled correctly.
However, if you need exact matching for other reasons, you must explicitly set outputMatching: "exact"
and exclude dynamic fields from your expectations.

Dynamic fields include:
- Timestamps (EnteredTime, StartTime)
- Execution IDs
- UUIDs
- Random values
- Other context-dependent values

**EXAMPLE:**
\`\`\`yaml
stateExpectations:
  - state: "${dynamicFields[0]?.stateName || 'StateWithDynamicFields'}"
    outputMatching: "partial"  # ⚠️ REQUIRED due to dynamic fields
    output:
      # Only include stable fields
      userId: "12345"
      status: "success"
      # DO NOT include: timestamp, executionId, uuid, etc.
\`\`\`

### 🔴 RULE: Omit Dynamic Fields from Expectations 🔴

**NEVER include these in test expectations:**
- Any timestamp fields
- Execution IDs or names
- UUIDs or random values
- State tokens
- Map item indices (when dynamic)

**Why?** These values are different every time the test runs, causing false failures.
`
  }
}
