# CRITICAL OUTPUT FORMAT RULES

## ⚠️⚠️⚠️ MANDATORY: YAML-ONLY OUTPUT ⚠️⚠️⚠️

### RULE 1: NO MARKDOWN, NO EXPLANATIONS
- Output MUST be valid YAML from the first character to the last
- DO NOT include ```yaml or ``` markers
- DO NOT include any explanatory text before or after the YAML
- DO NOT include comments outside the YAML structure

### RULE 2: START WITH version:
The output MUST start directly with:
```
version: "1.0"
```
NOT with:
```
I'll analyze... 
```yaml
version: "1.0"
```

### RULE 3: VALID YAML STRUCTURE ONLY
✅ CORRECT OUTPUT EXAMPLE:
```
version: "1.0"
mocks:
  - state: "StateName"
    type: "fixed"
    response:
      key: "value"
```

❌ WRONG OUTPUT EXAMPLE:
```
I'll create a mock configuration for your state machine.

```yaml
version: "1.0"
mocks:
  - state: "StateName"
    ...
```

This mock provides comprehensive coverage...
```

### RULE 4: NO TRAILING MARKDOWN
The file MUST end with the last line of YAML, not with:
- ```
- Explanatory text
- Summary comments

## TEST FILE SPECIFIC RULES

### MANDATORY FIELDS
```yaml
version: "1.0"
name: "Test suite name"
stateMachine: "path/to/state-machine.asl.json"  # REQUIRED
testCases:  # NOT "tests"
  - name: "Test case name"
    input: {}
    expectedPath: []
    stateExpectations: []
```

### FORBIDDEN FIELDS
- ❌ `tests` (use `testCases`)
- ❌ `stateName` in stateExpectations (use `state`)
- ❌ `maxSteps` (not a valid field)
- ❌ `timeout` at test case level (use settings.timeout or testCase.timeout)

### TIMEOUT CONFIGURATION
For test execution timeouts:
```yaml
# Global timeout for all tests in the suite
settings:
  timeout: 30000  # milliseconds

testCases:
  - name: "Long running test"
    timeout: 60000  # Override for specific test case (milliseconds)
    input: {}
    expectedPath: []
    stateExpectations: []
```

## MOCK FILE SPECIFIC RULES

### MANDATORY STRUCTURE
```yaml
version: "1.0"
mocks:
  - state: "ExactStateName"  # Must match ASL state name
    type: "fixed|conditional|stateful|error"
    response: {}  # or conditions/responses for other types
```

## FINAL VALIDATION CHECK

Before outputting, verify:
1. First line is `version: "1.0"`
2. No text before the YAML
3. No ``` markers anywhere
4. No text after the YAML
5. All fields use correct names (testCases not tests)
6. StateMachine field is included for test files

## OUTPUT INSTRUCTION

**OUTPUT ONLY THE YAML CONTENT. NOTHING ELSE.**