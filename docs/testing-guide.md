# Comprehensive Testing Guide

This guide provides comprehensive coverage of test case creation, mock configuration, and best practices for using sfn-ai-local-test.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Mock Configuration](#mock-configuration)
3. [Test Case Creation](#test-case-creation)
4. [Best Practices](#best-practices)
5. [CI/CD Integration](#ci-cd-integration)
6. [Performance Optimization](#performance-optimization)

---

## Quick Start

### Basic Test Suite

```yaml
version: "1.0"
name: "My Test Suite"
stateMachine: "payment-workflow"
baseMock: "payment-mocks"

testCases:
  - name: "Normal Processing"
    input: { orderId: "123", amount: 1000 }
    expectedOutput:
      status: "completed"
      transactionId: "tx-123"
```

### Basic Mock Configuration

```yaml
version: "1.0"
mocks:
  - state: "ProcessPayment"
    type: "fixed"
    response:
      Payload:
        status: "completed"
        transactionId: "tx-123"
```

---

## Mock Configuration

### Mock Type Specifications

#### 1. Fixed Response (fixed)

Returns consistent data for predictable scenarios.

```yaml
- state: "GetUserInfo"
  type: "fixed"
  response:
    Payload:
      userId: "123"
      name: "John Smith"
```

**Use Cases:**
- Simple unit tests
- Deterministic behavior verification
- Basic integration tests

#### 2. Conditional Response (conditional)

Returns different responses based on input conditions. Evaluated using partial matching.

```yaml
- state: "ProcessPayment"
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:
            amount: 500
      response:
        Payload: { status: "approved" }
    - when:
        input:
          Payload:
            amount: 5000
      response:
        Payload: { status: "manual_review" }
    - default:
        Payload: { status: "pending" }
```

**Important:** 
- Always use the `input` field in `when` conditions
- Wrap with `Payload` for Lambda integrations
- Conditions are evaluated using exact or partial matching (complex operators are not supported)

#### 3. Stateful Response (stateful)

Changes behavior based on call count.

```yaml
- state: "RetryableProcess"
  type: "stateful"
  responses:
    - Payload: { status: "processing" }      # 1st call
    - Payload: { status: "still_processing" } # 2nd call
    - Payload: { status: "completed" }       # 3rd call
```

**Use Cases:**
- Testing retry behavior
- Polling pattern verification
- Progressive workflow testing

#### 4. Error Simulation (error)

Simulates error conditions to test error handling.

```yaml
- state: "FlakeyService"
  type: "error"
  error:
    type: "States.TaskFailed"
    cause: "Service temporarily unavailable"
  probability: 0.3  # 30% error probability
```

**Error Type Examples:**
- `States.TaskFailed` - Task execution failure
- `States.Timeout` - Timeout error
- `States.Permissions` - Permission error
- `Lambda.ServiceException` - Lambda-specific error

#### 5. ItemReader (for Distributed Map)

Mocks data source for Distributed Map states.

```yaml
- state: "ProcessBatch"
  type: "itemReader"
  dataFile: "items.csv"     # Read from test-data directory
  dataFormat: "csv"         # Optional (auto-detected from extension)
```

### Delay Configuration

All mock types can delay responses using the `delay` field:

```yaml
# Delay with Fixed type
- state: "SlowAPI"
  type: "fixed"
  delay: 2000  # 2 second delay
  response:
    Payload: { result: "success" }

# Delay with Error type (delay before error)
- state: "TimeoutService"
  type: "error"
  delay: 5000  # Error after 5 seconds
  error:
    type: "States.Timeout"
    cause: "Service timeout"

# Conditional delays
- state: "PriorityProcessor"
  type: "conditional"
  conditions:
    - when:
        input:
          priority: "high"
      delay: 100  # Fast processing for high priority
      response:
        Payload: { status: "expedited" }
    - when:
        input:
          priority: "low"
      delay: 3000  # Delay for low priority
      response:
        Payload: { status: "queued" }
```

### Lambda Integration Patterns

When using optimized integration (`arn:aws:states:::lambda:invoke`), responses are wrapped in `Payload`:

```yaml
- state: "ProcessOrder"
  type: "fixed"
  response:
    ExecutedVersion: "$LATEST"
    Payload:  # Required for Lambda integration
      orderId: "12345"
      status: "processed"
    StatusCode: 200
```

**Note**: Direct ARN specification is deprecated. Always use optimized integration.

### Condition Matching Details

#### Partial Matching

Conditional mocks use partial matching:

```yaml
conditions:
  - when:
      input:
        Payload:
          orderId: "order-001"  # Other fields are ignored
    response:
      Payload: { status: "found" }
```


### Mocks within Map/Parallel States

States within Map are specified by state name only (Map state name is not needed):

```yaml
- state: "ProcessItem"  # Child state within Map (no Map state name prefix)
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:
            itemId: "item-001"
      response:
        Payload: { processed: true }
```

**Note**: States within Map execute as independent state machines, so parent Map state names (like `ProcessItems`) are not needed.

---

## Test Case Creation

### Testing Strategies

#### Unit Test Approach

For testing individual states independently:

```yaml
testCases:
  - name: "Single State Test"
    input: { taskType: "single" }
    stateExpectations:
      - state: "ProcessTask"
        input: { taskType: "single" }
        output: { processed: true }
        outputMatching: "exact"
```

#### Integration Test Approach

For verifying entire workflow behavior:

```yaml
testCases:
  - name: "End-to-End Flow"
    input: { orderId: "12345" }
    expectedOutput:
      orderId: "12345"
      status: "completed"
    expectedPath:
      - "ValidateOrder"
      - "ProcessPayment"
      - "ShipOrder"
      - "SendNotification"
```

#### Error Case Testing

For verifying error handling:

```yaml
testCases:
  - name: "Error Handling Test"
    input: { amount: -100 }
    expectedError: "States.TaskFailed"
    mockOverrides:
      - state: "ValidateAmount"
        type: "error"
        error:
          type: "ValidationError"
          cause: "Amount cannot be negative"
```

### Coverage Improvement Techniques

#### 1. Boundary Value Testing

```yaml
testCases:
  - name: "Minimum Value Test"
    input: { value: 0 }
  - name: "Maximum Value Test"
    input: { value: 999999 }
  - name: "Boundary Value Test"
    input: { value: 100 }  # Threshold value
```

#### 2. Complete Path Coverage

Covering all branches of Choice states:

```yaml
testCases:
  - name: "Path A"
    input: { type: "A" }
    expectedPath: ["Check", "ProcessA"]
  
  - name: "Path B"
    input: { type: "B" }
    expectedPath: ["Check", "ProcessB"]
  
  - name: "Default Path"
    input: { type: "Unknown" }
    expectedPath: ["Check", "DefaultProcess"]
```

#### Choice State Mocks (Special Cases)

Choice states typically don't require mocks since they don't call external resources, but they're useful in these special cases:

**Avoiding Infinite Loops**:
```yaml
# Retry loop testing - force specific branch transition
mocks:
  - state: "RetryDecision"
    type: "fixed"
    response:
      Next: "Success"  # Override Choice evaluation for forced transition
```

**Stateful Loop Control**:
```yaml
# Force termination on 3rd loop
mocks:
  - state: "CheckRetryCount"
    type: "stateful"
    responses:
      - { Next: "RetryOperation" }  # 1st call: retry
      - { Next: "RetryOperation" }  # 2nd call: retry
      - { Next: "ForceSuccess" }    # 3rd call: force success
```

**Conditional Branch Control**:
```yaml
# Force different branches based on input
mocks:
  - state: "ComplexValidation"
    type: "conditional"
    conditions:
      - when:
          input:
            testMode: true
        response:
          Next: "SkipValidation"  # Skip validation in test mode
      
      - when:
          input:
            forceComplete: true
        response:
          Next: "ForceComplete"   # Force completion
      
      # Falls back to normal Choice evaluation when Next is not present
      - default: {}
```

**Debug Branch Control**:
```yaml
# Force testing of specific feature paths
mocks:
  - state: "FeatureFlag"
    type: "fixed"
    response:
      Next: "NewFeaturePath"  # Force new feature path
```

**Important Notes**:
- Choice state mocks specify next transition using the `Next` field (ASL compliant)
- When `Next` is not specified, falls back to normal Choice condition evaluation
- Supports `fixed`, `conditional`, and `stateful` types like other states

#### 3. Parallel Processing Verification

Verifying all branches of Parallel states:

```yaml
testCases:
  - name: "Parallel Processing Test"
    parallelExpectations:
      - state: "ParallelProcess"
        branchCount: 3
        branchPaths:
          0: ["Branch1Task1", "Branch1Task2"]
          1: ["Branch2Task1", "Branch2Task2"]
          2: ["Branch3Task1", "Branch3Task2"]
```

### Assertion Configuration

#### Output Verification Mode

```yaml
assertions:
  outputMatching: "partial"  # Partial matching (recommended for development)
  # outputMatching: "exact"   # Exact matching (recommended for production)
```

#### Path Verification Mode

```yaml
assertions:
  pathMatching: "includes"   # Sequence appears consecutively in path
  # pathMatching: "exact"    # Exact matching
```

### Mock Overrides

Override mocks per test case:

```yaml
testCases:
  - name: "Special Case"
    mockOverrides:  # Only effective for this test case
      - state: "GetUser"
        type: "fixed"
        response:
          Payload: { userId: "special" }
```

---

## Best Practices

### Test Design Principles

#### Minimal Mocking

Achieve maximum coverage with minimal necessary mocks:

```yaml
# ❌ Overly detailed mocks
- state: "GetUser"
  type: "fixed"
  response:
    Payload:
      userId: "123"
      name: "John"
      email: "john@example.com"
      address: { ... }  # Unnecessary for test

# ✅ Sufficiently minimal mocks
- state: "GetUser"
  type: "fixed"
  response:
    Payload:
      userId: "123"
      name: "John"  # Minimum required for test
```

#### Data-Driven Testing

Manage test data using external files:

```yaml
# Data-driven testing using ItemReader
mocks:
  - state: "ProcessBatch"
    type: "itemReader"
    dataFile: "test-cases.csv"  # 100 test data entries
```

### Environment-Specific Configuration

#### Debug Configuration

During development or test debugging:

```yaml
settings:
  parallel: false          # Sequential execution (easier error tracking)
  verbose: true            # Detailed log output
  timeout: 30000           # Longer timeout (30 seconds)

assertions:
  outputMatching: "partial"    # Loose validation (flexible during development)
```

#### CI/CD Configuration

For production environments or CI/CD pipelines:

```yaml
settings:
  parallel: true           # High-speed execution
  verbose: false           # Minimal logging
  stopOnFailure: true      # Early termination
  timeout: 5000            # Shorter timeout (5 seconds)

assertions:
  outputMatching: "exact"  # Strict validation
  pathMatching: "exact"    # Strict path validation
```

### Test Structure and Management

#### Test Suite Division

For large projects, divide files by state machine or functionality:

```
sfn-test/
├── mocks/                      # Mock configurations
│   ├── order-workflow.mock.yaml
│   └── payment-workflow.mock.yaml
├── test-suites/                # Test suites
│   ├── order-workflow.test.yaml
│   ├── payment-workflow.test.yaml
│   └── integration.test.yaml
└── test-data/                  # Test data
    ├── sample-orders.json
    └── test-users.csv
```

#### Shared Mock Utilization

Share basic mock configurations to reduce duplication:

```yaml
# base.mock.yaml - Common mocks
mocks:
  - state: "CommonAuth"
    type: "fixed"
    response: { authenticated: true }

# test-suite.yaml - Test suite
baseMock: "base"  # Reference common mocks
testCases:
  - name: "Authenticated User Test"
    # CommonAuth mock is automatically applied
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Step Functions Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - run: npm ci
      
      - name: Synthesize CDK
        run: npx cdk synth
        
      - name: Run Step Functions tests
        run: npx sfn-test run
        
      - name: Upload coverage
        uses: actions/upload-artifact@v3
        with:
          name: coverage
          path: .sfn-test/coverage/
```


### CDK Integration

#### Leveraging Automatic Extraction

```yaml
# sfn-test.config.yaml
stateMachines:
  - name: order-processing
    source:
      type: cdk
      path: ./cdk.out/MyStack.template.json
      stateMachineName: OrderProcessingStateMachine
```

#### CDK Development Workflow

**Recommended Development Flow**:

1. Modify CDK TypeScript code
2. Manually run `cdk synth` to update template
3. Run `sfn-test run` to execute tests

```bash
# After CDK code changes
npx cdk synth
sfn-test run

# Or in one line
npx cdk synth && sfn-test run
```

**Automatic Detection Mechanism**:
- sfn-ai-local-test monitors template file timestamps
- If templates are updated, ASL definitions are automatically re-extracted
- Caching provides fast operation when no changes are detected

---

## Performance Optimization

### Leveraging Parallel Execution

Speed up independent test cases with parallel execution:

```yaml
settings:
  parallel: true  # Parallel execution based on CPU core count
```

### Selective Execution

Run only specific tests during development:

```yaml
testCases:
  - name: "Currently Working Test"
    only: true  # Execute only this test
```

### Timeout Optimization

Reduce unnecessary waiting with appropriate timeout settings:

```yaml
settings:
  timeout: 5000  # Usually 5 seconds is sufficient

testCases:
  - name: "Long Processing Test"
    timeout: 15000  # Extend only for specific tests
```

### Memory Efficiency

Use external files for large datasets:

```yaml
# ❌ Avoid: Direct embedding of large data
- state: "GetLargeDataset"
  type: "fixed"
  response:
    Payload:
      items: [... 10000 items ...]

# ✅ Recommended: External file reference
- state: "GetLargeDataset"
  type: "itemReader"
  dataFile: "large-dataset.jsonl"  # JSON Lines format
```

---

## Security

### Managing Sensitive Information

Do not include sensitive information in test data:

```yaml
# ❌ Avoid
- state: "GetSecret"
  response:
    Payload:
      apiKey: "sk-actual-api-key-12345"

# ✅ Recommended
- state: "GetSecret"
  response:
    Payload:
      apiKey: "test-api-key-dummy"
```
