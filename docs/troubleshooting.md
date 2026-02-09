# Troubleshooting Guide

## Overview

This document summarizes common issues and solutions when using sfn-ai-local-test.

## Common Issues and Solutions

### Mock-Related Issues

#### Q: Mock conditions don't match

**Symptoms:** Mocks don't work as expected, returning default responses or errors.

**Causes and Solutions:**

1. **Missing Payload wrapper for Lambda integration**
   ```yaml
   # ❌ Wrong
   when:
     orderId: "123"
   
   # ✅ Correct (for Lambda integration)
   when:
     Payload:
       orderId: "123"
   ```

2. **Condition structure doesn't match input**
   ```bash
   # Check actual input
   sfn-test run --verbose | grep "State input:"
   ```

3. **Misunderstanding partial matching**
   ```yaml
   # Conditions can be a subset of input
   when:
     Payload:
       orderId: "123"  # Other fields are ignored
   ```

#### Q: Stateful mocks don't work as expected

**Symptoms:** Stateful mock response order differs from expectations.

**Solution:**
- A new MockEngine instance is created for each test case, so stateful mock counters are reset to 0 at the start of each test case
- Within the same test case, counters advance with each call
- When used within Map states, counters advance for each iteration

```yaml
# Example for use within Map
- state: "ProcessItem"  # Only Map state name (parent Map name not needed)
  type: "stateful"
  responses:
    - Payload: { status: "processing" }  # 1st item
    - Payload: { status: "completed" }   # 2nd item
    - Payload: { status: "completed" }   # 3rd and later items
```

### ResultSelector Issues

#### Q: ResultSelector doesn't work

**Symptoms:** Fields specified in ResultSelector are not included in output.

**Causes and Solutions:**

1. **Missing `.$` suffix on field names**
   ```json
   // ❌ Wrong
   "ResultSelector": {
     "data": "$.Payload.result"
   }
   
   // ✅ Correct
   "ResultSelector": {
     "data.$": "$.Payload.result"
   }
   ```

2. **Incorrect reference path**
   ```json
   // $ in ResultSelector refers to task result
   "ResultSelector": {
     "data.$": "$.Payload.data",  // Extract Payload.data
     "status.$": "$.StatusCode"   // Extract StatusCode
   }
   ```

### Lambda Integration Patterns

#### Q: Lambda invocation result format is unexpected

**Symptoms:** Lambda function return value is returned in an unexpected format.

**Solution:**

Check the integration pattern:

```json
// Optimized integration (with Payload wrapper)
"Resource": "arn:aws:states:::lambda:invoke"
// Response: { "Payload": {...}, "StatusCode": 200, ... }

// Direct ARN specification (without Payload wrapper)
"Resource": "arn:aws:lambda:us-east-1:123456789012:function:MyFunction"
// Response: {...}  // Returned directly
```

### Map/Parallel Execution

#### Q: States within Map are not mocked

**Symptoms:** Mocks for child states within Map states don't work.

**Solution:**

States within Map should be specified by **state name only**, without the parent Map name:

```yaml
# ✅ Correct: State name only
- state: "ValidateItem"
  type: "fixed"
  response:
    Payload: { valid: true }

# ❌ Wrong: Including parent Map name
# - state: "ProcessItems.ValidateItem"
```

**Reason:** States within Map are executed as independent state machines, so qualification with parent Map name is unnecessary.

#### Q: Parallel branch execution order is unpredictable

**Symptoms:** Parallel state branches don't execute in the expected order.

**Solution:**

Parallel branches execute concurrently, so order is not guaranteed. Write tests that don't depend on order:

```yaml
parallelExpectations:
  - state: "ParallelProcessing"
    branchCount: 2
    branchPaths:
      0: ["ProcessA"]  # Branch 0 path
      1: ["ProcessB"]  # Branch 1 path
    # Order doesn't matter
```

### Choice Conditions

#### Q: Choice conditions don't evaluate as expected

**Symptoms:** Choice state selects unexpected branch.

**Debug Method:**

```bash
# Check condition evaluation with verbose logs
sfn-test run --verbose | grep "Choice evaluation:"
```

**Common Issues:**

1. **Type mismatch in numeric comparison**
   ```json
   // May be compared as string
   {
     "Variable": "$.amount",
     "NumericGreaterThan": 100  // Ensure $.amount is numeric
   }
   ```

2. **Boundary value handling**
   ```json
   // Note the difference between GreaterThan and GreaterThanEquals
   {
     "Variable": "$.value",
     "NumericGreaterThanEquals": 100  // Includes 100
   }
   ```

### Variables and Scope

#### Q: Variables cannot be referenced

**Symptoms:** Variable references become `undefined` or `null`.

**Causes and Solutions:**

1. **Check variable scope**
   - Variables defined within Parallel/Map cannot be referenced externally
   - External variables can be referenced internally (except Distributed Map)

2. **Check variable name**
   ```json
   // Define with Assign
   "Assign": {
     "myVar.$": "$.result"
   }
   
   // Reference
   "Parameters": {
     "value.$": "$myVar"  // $ prefix required
   }
   ```

### CDK Integration

#### Q: State machine cannot be extracted from CDK

**Symptoms:** `sfn-test extract` fails or cannot find state machine.

**Solution:**

1. **Run CDK synth**
   ```bash
   npx cdk synth
   ```

2. **Specify correct template path**
   ```yaml
   # sfn-test.config.yaml
   stateMachines:
     - name: my-workflow
       source:
         type: cdk
         path: ./cdk.out/MyStack.template.json  # Correct stack name
         stateMachineName: MyStateMachine123ABC  # Logical ID
   ```

3. **Check CloudFormation template**
   ```bash
   # Search for state machine resources
   grep -r "AWS::StepFunctions::StateMachine" cdk.out/
   ```

### Test Execution

#### Q: Tests timeout

**Symptoms:** Tests don't complete and timeout with error.

**Solution:**

1. **Increase timeout value**
   ```yaml
   settings:
     timeout: 60000  # Increase to 60 seconds
   ```

2. **Reduce Wait state time (for testing)**
   ```yaml
   mockOverrides:
     - state: "WaitForApproval"
       type: "wait"
       seconds: 0  # Skip waiting in tests
   ```

#### Q: Coverage is not calculated correctly

**Symptoms:** States that should have been executed are not included in coverage.

**Check:**

1. **Check nested states**
   ```bash
   # Check coverage details
   cat .sfn-test/coverage/coverage-*.json | jq .nestedStates
   ```

2. **Check conditional branches**
   - Are all Choice branches tested?
   - Is the default branch included?

### Performance

#### Q: Test execution is slow

**Optimization Methods:**

1. **Enable parallel execution**
   ```yaml
   settings:
     parallel: true
     maxWorkers: 4
   ```

2. **Skip unnecessary Wait states**
   ```yaml
   # Set wait time to 0 in test environment
   mockOverrides:
     - state: ".*Wait.*"
       type: "wait"
       seconds: 0
   ```

3. **Use external files for large data**
   ```yaml
   # Use file reference instead of inline
   - state: "GetLargeData"
     type: "file"
     path: "./test-data/large.json"
   ```

### AI Generation Issues

#### Q: AI generation times out

**Symptoms:** Mock or test case generation results in timeout error.

**Solution:**

1. **Use automatic timeout adjustment**
   ```bash
   # Tool automatically sets timeout based on complexity
   sfn-test generate mock --name my-workflow
   ```

2. **Manually extend timeout**
   ```bash
   # Set to 10 minutes (600 seconds)
   sfn-test generate mock --name my-workflow --timeout 600000
   ```

3. **Increase retry attempts**
   ```bash
   # Up to 3 retries (default is 2)
   sfn-test generate mock --name my-workflow --max-attempts 3
   ```

#### Q: AI generation quality is poor

**Symptoms:** Generated mocks or tests are incomplete or inaccurate.

**Solution:**

1. **Use retry functionality (GenerationRetryManager)**
   - Automatic validation and regeneration is performed
   - Quality improves with progressive feedback

2. **Regenerate after manual fixes**
   ```bash
   # Regenerate remaining parts after partial manual fixes
   sfn-test generate test --name my-workflow --mock ./sfn-test/mocks/my-workflow.mock.yaml
   ```

3. **Use Claude Code environment**
   - Claude Code environment has automated authentication for more stable generation

#### Q: Issues with Lambda integration mock generation

**Symptoms:** Payload structure is incorrect in Lambda integration mocks.

**Cause:** Presence or absence of Payload wrapper differs by Lambda integration pattern.

**Solution:**

For optimized integration (`arn:aws:states:::lambda:invoke`):
```yaml
# Should be handled correctly by auto-generation, but for manual fixes:
- state: "InvokeLambda"
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:  # Required: Payload wrapper
            userId: "123"
      response:
        Payload:     # Required: Payload wrapper
          result: "success"
        StatusCode: 200
        ExecutedVersion: "$LATEST"
```

## Debug Techniques

### Using Verbose Logs

```bash
# Output logs with maximum verbosity
sfn-test run --verbose

# Output logs for specific state only
sfn-test run --verbose | grep "StateName"
```

### Checking Execution Traces

```bash
# Check latest execution result
ls -lt .sfn-test/coverage/execution-*.json | head -1

# Check execution path
cat .sfn-test/coverage/execution-*.json | jq .executionPath
```

### Checking Mock Matching

```bash
# Check mock evaluation logs
sfn-test run --verbose 2>&1 | grep -A 5 "Mock evaluation"
```

### AI Generation Timeout

**Symptoms:** "Claude CLI timed out" error occurs during mock/test generation.

**Cause:** Analysis of complex state machines takes time.

**Solution:**

```bash
# Default: 180 seconds (3 minutes)
sfn-test generate mock --asl ./state-machine.json

# Extend timeout to 10 minutes
sfn-test generate mock --asl ./state-machine.json --timeout 600000

# For complex state machines, extend to 15 minutes
sfn-test generate test --asl ./state-machine.json --timeout 900000
```

**Other Solutions:**
1. Simplify state machine and generate partially
2. Use Claude CLI (may be faster depending on environment)
3. Check network connection

## Error Message List

### `Mock not found for state: XXX`
Mock is not defined for the specified state. Check mock configuration.

### `Invalid JSONPath expression: XXX`
JSONPath expression is invalid. Ensure it starts with `$.`.

### `State machine definition not found`
ASL file not found or extraction from CDK failed.

### `Circular reference detected in state: XXX`
Circular reference exists in state machine. Check Next specifications.

### `Maximum iterations exceeded in Map state`
Map state iteration count exceeded limit. Check input data.

## Advanced Features

### Automatic Filename Inference

#### Automatic stateMachine Field Inference

When test suite filename follows specific patterns, the `stateMachine` field can be omitted:

**Inference Pattern**: `{state-machine-name}.test.yaml` or `{state-machine-name}.test.yml`

**Examples**:
- `payment-workflow.test.yaml` → `payment-workflow`
- `order-processor.test.yml` → `order-processor`

#### baseMock Field Resolution

```yaml
# Reference by name
baseMock: "payment-workflow"
# → sfn-test/mocks/payment-workflow.mock.yaml

# Reference by relative path  
baseMock: "./custom/mocks/special.mock.yaml"
```

### Path Resolution Rules

#### responseFile Resolution

```yaml
mocks:
  - state: "TaskA"
    type: "fixed"
    responseFile: "response.json"  # → test-data/response.json
    
  - state: "ProcessOrder"
    type: "fixed"
    responseFile: "ProcessOrder.json"  # → test-data/ProcessOrder.json
```

#### Path Resolution Priority

1. **Absolute path**: Used as-is
2. **Relative path** (starting with `./` or `../`): Relative to project root
3. **Simple filename**: Search within `test-data` directory

## Environment Variables

### ANTHROPIC_API_KEY
Claude API key (required when using AI features)
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### AI_MODEL
Default AI model for generation (optional)
```bash
export AI_MODEL="claude-sonnet-4-5-20250929"  # default value
```

### Configuration File Path Specification
Configuration file path can be specified with CLI `--config` option (default: `./sfn-test.config.yaml`)
```bash
sfn-test run --config ./custom-config.yaml
```

### DEBUG_OUTPUT_PATH
Enable mock engine internal debug logs
```bash
export DEBUG_OUTPUT_PATH=true
```

Outputs mock matching details (which mocks were found, input data, condition evaluation results, etc.) to console. This is lower-level debug information separate from the `--verbose` option.

## Known Limitations

### Unsupported Features
- `.waitForTaskToken` pattern (callback waiting with task token)
- `.sync` pattern (synchronous service integration)

### Limitations
- Memory limit: Depends on Node.js heap size
- Parallelism: Depends on CPU core count
