# TEST FILE OUTPUT RULES

## ⚠️ THIS IS FOR TEST FILES ONLY ⚠️

You are generating a **TEST SUITE FILE**, not a mock file.

## MANDATORY TEST FILE STRUCTURE

```yaml
version: "1.0"                  # ⚠️ REQUIRED
testCases:                       # ⚠️ REQUIRED: Array of test cases (NOT "tests")
  - name: "Test case name"       # ⚠️ REQUIRED for each test
    input: {}                    # ⚠️ REQUIRED for each test
    # Optional fields below
```

Optional fields at root level:
- `name`: Test suite name
- `stateMachine`: Path to state machine (auto-inferred from filename if omitted)
- `settings.timeout`: Global timeout in milliseconds

Optional fields per test case:
- `expectedPath`: Array of state names
- `expectedOutput`: Final output assertion
- `timeout`: Override timeout for this test
- `stateExpectations`: Array of state-level assertions

## CRITICAL RULES FOR TESTS

1. **MUST have 'testCases:' array** (NOT 'tests:')
2. **stateMachine field is OPTIONAL** (auto-inferred from filename if omitted)
3. Each test case MUST have 'name' and 'input'
4. Use 'state' NOT 'stateName' in stateExpectations
5. ALWAYS use 'outputMatching: "partial"' in stateExpectations
6. Variables go in stateExpectations.variables, NOT in output

## TEST-SPECIFIC FIELDS

### Input and Expected Output
```yaml
testCases:
  - name: "Success path test"
    input:
      userId: "123"
      amount: 100
    expectedOutput:              # Final output assertion
      success: true
      processedAmount: 100
```

### State Expectations
```yaml
stateExpectations:
  - state: "ProcessPayment"     # Exact state name
    outputMatching: "partial"   # ALWAYS partial
    output:
      paymentId: "test-id"
    variables:                   # Test Variables separately
      counter: 1
      status: "processing"
```

### Expected Path
```yaml
expectedPath:
  - "StartState"
  - "ProcessData"
  - "CheckCondition"
  - "SuccessState"
```

## FORBIDDEN IN TEST FILES

❌ DO NOT include these mock-specific fields:
- `mocks` (top-level mocks array)
- `type: "fixed|conditional|stateful"`
- `response` (use `output` instead)
- `conditions` array at top level

## TIMEOUT CONFIGURATION

```yaml
# Global timeout for all tests
settings:
  timeout: 30000  # milliseconds

# Test-specific override
testCases:
  - name: "Long running test"
    timeout: 60000  # Override for this test only
```

## VALIDATION CHECK

Before outputting, verify:
1. File starts with `version: "1.0"`
2. Contains `testCases:` array (NOT `tests:`)
3. Does NOT contain top-level `mocks:` array
4. Each test has 'name' and 'input'
5. stateExpectations use 'state' not 'stateName'
6. All outputMatching set to "partial"