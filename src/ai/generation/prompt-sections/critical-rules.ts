/**
 * Critical rules for mock and test generation
 */

import { HTTP_STATUS_OK } from '../../../constants/defaults'

export function getCriticalRules(): string {
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

export function getTestCriticalRules(): string {
  return `# CRITICAL RULES FOR TEST GENERATION

⚠️⚠️⚠️ RULE #1: ALWAYS USE outputMatching: "partial" FOR ALL STATE EXPECTATIONS ⚠️⚠️⚠️
⚠️⚠️⚠️ RULE #2: BE AWARE OF FIXED EXECUTIONCONTEXT VALUES ⚠️⚠️⚠️
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

**NOTE:** ExecutionContext values like timestamps are FIXED during tests for deterministic behavior.
You CAN include these in exact matching if they come from ExecutionContext variables.

## EXECUTION CONTEXT - FIXED VALUES IN TESTS
**IMPORTANT:** ExecutionContext values are FIXED during tests for deterministic behavior:
- \`$$.Execution.Id\` = \`arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution\`
- \`$$.Execution.Name\` = \`test-execution\`
- \`$$.Execution.StartTime\` = \`2024-01-01T00:00:00.000Z\`
- \`$$.State.EnteredTime\` = \`2024-01-01T00:00:00.000Z\`

These values do NOT change during test execution, making them safe for assertions.

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
9. **⚠️ CAUTION: ExecutionContext timestamps are FIXED in tests (safe to use) ⚠️**
10. When copying from mock data, ALWAYS remove timestamp fields
11. For Parallel states, expect array output
12. For Map states, expect array output
13. For Distributed Map, expect execution metadata
14. DO NOT use "maxSteps" - it's not a valid field`
}

export function getExecutionContextInfo(): string {
  return `## IMPORTANT: ExecutionContext Fixed Values

During test execution, ExecutionContext values are FIXED for deterministic testing:

- **$$.Execution.Id** = \`arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution\`
- **$$.Execution.Name** = \`test-execution\`
- **$$.Execution.StartTime** = \`2024-01-01T00:00:00.000Z\`
- **$$.Execution.RoleArn** = \`arn:aws:iam::123456789012:role/StepFunctionsRole\`
- **$$.State.EnteredTime** = \`2024-01-01T00:00:00.000Z\`

**IMPLICATIONS FOR MOCKING:**
1. These values do NOT need to be mocked - they are predictable
2. Choice states using these values will always get the same result
3. You can rely on these fixed values when creating conditional mocks

**Example:** If a Choice state checks \`$$.Execution.StartTime\`, it will always see "2024-01-01T00:00:00.000Z"
`
}
