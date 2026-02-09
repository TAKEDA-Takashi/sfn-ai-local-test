/**
 * Variables and Assign rules for mock and test generation
 */

export function getVariablesRules(): string {
  return `## Variables and Assign Rules

### How Variables Work in Step Functions
- **Assign** field on a state sets or updates variables after that state executes
- Variables are stored **separately from state output** (not part of the data flow)
- Access variables with \`$variableName\` (JSONPath) or \`$variableName\` (JSONata)
- Variables **persist across states** within the same scope

### Assign Patterns in ASL

**Static assignment:**
\`\`\`json
"Assign": {
  "status": "initialized",
  "counter": 0
}
\`\`\`

**Dynamic assignment (from state result):**
\`\`\`json
"Assign": {
  "discountAmount.$": "$.Payload.discountAmount",
  "processingStatus": "calculated"
}
\`\`\`

### Variable Scope Rules
- **Top-level states**: Variables are visible to all subsequent states
- **Inside Map/Parallel**: Variables defined inside are **NOT visible outside**
- **Outside → Inside**: Variables from outer scope **ARE visible inside** Map/Parallel
- **Exception**: Distributed Map does NOT inherit outer variables

### Implications for Mocking
- Mock responses must include fields referenced by Assign expressions
- Example: If Assign has \`"amount.$": "$.Payload.amount"\`, the mock response MUST include \`Payload.amount\`
- Variables set by Assign are available for Choice conditions in subsequent states
- Consider what values variables need for downstream Choice states to take the expected path`
}

export function getVariablesTestGuidance(): string {
  return `## Testing Variables

### ⚠️ CRITICAL: Variables Go in stateExpectations.variables, NOT in output

Variables are stored separately from state output. Always test them using the \`variables\` field:

\`\`\`yaml
stateExpectations:
  - state: "InitializeUser"
    variables:                    # ✅ Test variables here
      processingStatus: "initialized"
      transactionCount: 0

  - state: "CalculateDiscount"
    outputMatching: "partial"
    output:                       # State output (from mock response)
      Payload:
        discountRate: 0.2
    variables:                    # ✅ Variables set by Assign
      processingStatus: "discount_calculated"
      discountAmount: 50
\`\`\`

❌ **WRONG** - Do not put variable values in output:
\`\`\`yaml
stateExpectations:
  - state: "InitializeUser"
    output:
      processingStatus: "initialized"  # ❌ This is a variable, not output!
\`\`\`

### Testing Variable Persistence Across States
Create test cases that verify variables accumulate correctly:

\`\`\`yaml
stateExpectations:
  - state: "Step1"
    variables:
      counter: 1          # Set in Step1
  - state: "Step2"
    variables:
      counter: 2          # Updated in Step2
      total: 100          # New variable added in Step2
  - state: "Step3"
    variables:
      counter: 2          # Persisted from Step2 (not changed)
      total: 100          # Persisted from Step2
      status: "complete"  # New variable from Step3
\`\`\`

### Variables and Choice State Interaction
When a Choice state uses variables set by previous states, ensure your mock responses
produce the correct values for the Assign expressions to evaluate properly.
This determines which Choice branch is taken.`
}
