# Error Handling Example

This example demonstrates the **essential error handling patterns** in AWS Step Functions in a simple, easy-to-understand workflow.

## Learning Objectives

After studying this example, you will understand:

1. **Retry mechanisms** - How to automatically retry failed operations
2. **Catch blocks** - How to handle specific types of errors
3. **Error routing** - How different errors lead to different outcomes
4. **ResultPath** - How to preserve error information alongside original data

## Key Patterns Demonstrated

### 1. Happy Path (No Errors)
```
ProcessTransaction → NotifySuccess
```
Normal flow when everything works correctly.

### 2. Specific Error Handling
```
ProcessTransaction → [Error: InsufficientFunds] → HandleInsufficientFunds
ProcessTransaction → [Error: ValidationError] → HandleValidationError
```
Different errors routed to appropriate handlers.

### 3. Catch-All Error Handling
```
ProcessTransaction → [Error: Any Other] → HandleGeneralError
```
Unknown errors handled by a fallback mechanism.

### 4. Automatic Retry
```
ProcessTransaction → [Fails] → [Retry] → ProcessTransaction → NotifySuccess
```
Transient errors automatically retried before success.

## Workflow Structure

**Single Task with Comprehensive Error Handling:**
- `ProcessTransaction` - Main business logic with retry and catch configuration
- `NotifySuccess` - Success outcome
- `HandleInsufficientFunds` - Specific error handler
- `HandleValidationError` - Another specific error handler  
- `HandleGeneralError` - Catch-all error handler

## Error Handling Configuration

### Retry Block
```json
"Retry": [
  {
    "ErrorEquals": ["States.TaskFailed", "Lambda.ServiceException"],
    "IntervalSeconds": 1,
    "MaxAttempts": 2,
    "BackoffRate": 2.0
  }
]
```
- Retries network/service errors up to 2 times
- 1 second initial interval, doubles each retry

### Catch Block
```json
"Catch": [
  {
    "ErrorEquals": ["InsufficientFundsError"],
    "Next": "HandleInsufficientFunds",
    "ResultPath": "$.error"
  },
  // ... more specific handlers
  {
    "ErrorEquals": ["States.ALL"],
    "Next": "HandleGeneralError", 
    "ResultPath": "$.error"
  }
]
```
- Specific errors go to specific handlers
- `States.ALL` catches everything else
- `ResultPath: "$.error"` preserves error information

## Mock Configuration Strategy

This example uses a **conditional mock** approach that demonstrates different error scenarios based on the input `type` field:

```yaml
# mock.yaml - Conditional mock for comprehensive error testing
- state: "ProcessTransaction"
  type: "conditional"
  conditions:
    # Trigger InsufficientFundsError
    - when:
        input:
          Payload:
            type: "insufficient_funds"
      error:
        type: "InsufficientFundsError"
        cause: "Account balance is insufficient for transaction"
    
    # Trigger ValidationError  
    - when:
        input:
          Payload:
            type: "invalid"
      error:
        type: "ValidationError"
        cause: "Transaction validation failed"
    
    # Trigger generic error
    - when:
        input:
          Payload:
            type: "system_error"
      error:
        type: "States.TaskFailed"
        cause: "System processing error"
    
    # Default successful case
    - default:
        Payload:
          status: "completed"
          transactionId: "tx-12345"
          processedAt: "2024-01-01T12:00:00Z"
        StatusCode: 200
```

### Hybrid Approach for Complex Cases

For complex scenarios like retry testing, the example uses **mockOverrides** to provide stateful behavior:

```yaml
# In test-suite.yaml
mockOverrides:
  - state: "ProcessTransaction"
    type: "stateful"
    responses:
      - error:
          type: "States.TaskFailed"
          cause: "Temporary network timeout"
      - Payload:
          status: "completed"
          # ... success response
```

## Running the Tests

```bash
# Test all error handling patterns
sfn-test run --suite test-suite.yaml

# Run with coverage to see all paths tested
sfn-test run --suite test-suite.yaml --cov

# Test specific error pattern by input type
sfn-test run --input '{"transactionId": "test", "amount": 100, "type": "insufficient_funds"}'
sfn-test run --input '{"transactionId": "test", "amount": -50, "type": "invalid"}'
```

## Test Cases Explained

1. **Successful transaction** - Tests the happy path
2. **Insufficient funds error** - Tests specific error handling
3. **Validation error** - Tests different specific error handling
4. **Unexpected error** - Tests catch-all error handling
5. **Temporary failure with retry** - Tests automatic retry mechanism

Each test demonstrates a core error handling pattern that you'll use in real-world Step Functions.