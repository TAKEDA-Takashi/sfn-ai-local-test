# 01-simple: The Simplest State Machine

## Overview
This is the most basic state machine example with Task → Pass → Succeed flow.
It serves as a starting point for understanding basic Step Functions concepts.

## Learning Points

### 1. Basic State Types
- **Task**: Calls external services (Lambda)
- **Pass**: Transforms and formats data
- **Succeed**: Ends with success

### 2. Understanding Data Flow
- `Parameters`: Constructs input to the state
- `ResultPath`: Specifies where to save task results
- `$`: References current input data
- `$$`: References context variables (system information)

## State Machine Structure

```
[Start]
   ↓
GetUserInfo (Task)
   - Calls Lambda function to retrieve user info
   - Saves result to $.user
   ↓
FormatOutput (Pass)  
   - Extracts username and timestamp
   - Formats to new structure
   ↓
Complete (Succeed)
   - Ends with success
[End]
```

## Running Tests

```bash
# Run tests
sfn-test run --suite ./test-suite.yaml

# Expected output
✓ Workflow integration test

All tests passed!
```

## Mock Configuration Tips

`mock.yaml` mocks Lambda function responses with fixed values:

```yaml
response:
  Payload:      # Actual Lambda return value
    id: "user-123"
    name: "John Smith"
    email: "john@example.com"
  StatusCode: 200  # Lambda execution metadata
```

## Test Configuration Tips

### Basic Assertions
- `expectedOutput`: Validates final output
- `expectedPath`: Validates execution path

### State-Level Validation
Use `stateExpectations` to validate input/output for each state in detail:

```yaml
stateExpectations:
  - state: "GetUserInfo"
    input: { ... }   # Input to state
    output: { ... }  # Output after state execution
```

### Using Partial Matching
For dynamic values like timestamps, use `outputMatching: "partial"`:

```yaml
assertions:
  outputMatching: "partial"
```

## Next Steps
Once you understand the basics, learn about conditional branching in [02-choice](../02-choice/).