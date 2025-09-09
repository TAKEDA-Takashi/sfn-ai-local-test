# 03-parallel: Parallel Processing with Parallel State

## Overview
This example demonstrates how to use the Parallel state to execute multiple processes concurrently.
In an order processing scenario, validation, price calculation, and inventory check are executed simultaneously.

## Learning Points

### 1. Basic Structure of Parallel State
```json
"ProcessInParallel": {
  "Type": "Parallel",
  "Branches": [
    { /* Branch 1 definition */ },
    { /* Branch 2 definition */ },
    { /* Branch 3 definition */ }
  ],
  "ResultPath": "$.parallelResults",
  "Next": "AggregateResults"
}
```

### 2. Branch Characteristics
- Each branch is an independent state machine
- All branches execute in parallel
- Transitions to the next state after all branches complete
- Results are returned as an array (in branch order)

### 3. Result Aggregation
Results from parallel execution are returned as an array, accessible by index:
```json
"$.parallelResults[0]"  // Branch 1 result
"$.parallelResults[1]"  // Branch 2 result
"$.parallelResults[2]"  // Branch 3 result
```

## State Machine Structure

```
[Start]
   ↓
PrepareData
   ↓
ProcessInParallel ─────┬─── Branch 1: ValidateOrder
                      ├─── Branch 2: CalculatePrice → ApplyDiscount
                      └─── Branch 3: CheckInventory
   ↓ (After all branches complete)
AggregateResults
   ↓
[End]
```

## Using parallelExpectations

A dedicated field for validating parallel execution details:

### Branch Count Validation
```yaml
parallelExpectations:
  - state: "ProcessInParallel"
    branchCount: 3  # 3 branches exist
```

### Individual Branch Path Validation
```yaml
parallelExpectations:
  - state: "ProcessInParallel"
    branchPaths:
      0: ["ValidateOrder"]                    # Branch 0 path
      1: ["CalculatePrice", "ApplyDiscount"]  # Branch 1 path
      2: ["CheckInventory"]                   # Branch 2 path
```

### pathMatching Options
```yaml
branchPaths:
  pathMatching: "sequence"  # Choose from exact/includes/sequence
  0: ["ValidateOrder"]
```

## Distinction Between parallelExpectations and stateExpectations

| Validation Content | Field Used | Example |
|-------------------|-----------|---------|
| **Branch Count** | parallelExpectations | `branchCount: 3` |
| **Individual Branch Execution Paths** | parallelExpectations | `branchPaths: { 0: [...] }` |
| **Parallel Execution Input/Output Data** | stateExpectations | `state: "ProcessInParallel"` input/output |
| **Individual Branch Internal Data** | stateExpectations | Currently not supported |

## Test Case Design

### 1. Basic Parallel Processing
All branches execute successfully and results are aggregated

### 2. Detailed Branch Execution Validation
Verify branch count and paths using parallelExpectations

### 3. Error Scenarios
Behavior when a specific branch encounters an error
(Note: If one branch fails, the entire execution fails)

### 4. Data Aggregation Validation
Verify that parallel execution results are correctly aggregated

## Running Tests

```bash
# Run tests
sfn-test run --suite ./test-suite.yaml

# Expected results
✓ Comprehensive normal flow validation
✓ Out of stock scenario

All tests passed!
```

## Practical Use Cases

Cases where parallel processing is effective:
- **Order Processing**: Simultaneous execution of validation, price calculation, and inventory check
- **Data Processing**: Parallel execution of different transformation processes
- **Notification Delivery**: Simultaneous sending of email, SMS, and push notifications
- **External API Calls**: Parallel calls to multiple APIs

## Troubleshooting

### Q: Is the order of parallel execution results not guaranteed?
A: Results are always organized into an array in branch definition order. Even though execution order is parallel, the array index of results is fixed.

### Q: What happens if one branch encounters an error?
A: By default, the entire execution fails. If individual error handling is needed, use Catch within each branch.

## Next Steps
After understanding parallel processing, learn about iterative processing in [04-map](../04-map/).