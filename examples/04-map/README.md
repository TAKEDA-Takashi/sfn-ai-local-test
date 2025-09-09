# 04-map: Iterative Processing with Map State

## Overview
This example demonstrates how to use the Map state to process arrays of data iteratively.
In an item processing scenario, each item in a list goes through validation and processing steps.

## Learning Points

### 1. Basic Structure of Map State
```json
"ProcessItems": {
  "Type": "Map",
  "ItemsPath": "$.itemList.Payload.items",
  "MaxConcurrency": 2,
  "ItemSelector": {
    "item.$": "$$.Map.Item.Value",
    "index.$": "$$.Map.Item.Index",
    "category.$": "$.category"
  },
  "ItemProcessor": {
    "StartAt": "ValidateItem",
    "States": {
      /* Item processing states */
    }
  },
  "ResultPath": "$.processedItems",
  "Next": "SummarizeResults"
}
```

### 2. Map State Features
- **ItemsPath**: Specifies which array to iterate over
- **MaxConcurrency**: Limits parallel execution (optional)
- **ItemSelector**: Prepares input for each iteration
- **ItemProcessor**: State machine executed for each item
- **ResultPath**: Where to store the results array

### 3. Context Variables in Map
Special variables available within Map iterations:
```json
"$$.Map.Item.Value"  // Current item value
"$$.Map.Item.Index"  // Current item index (0-based)
```

### 4. Combining Map with Choice
The ItemProcessor can contain complex logic including Choice states for conditional processing based on validation results.

## State Machine Structure

```
[Start]
   ↓
GetItemList (Get array of items)
   ↓
ProcessItems (Map State)
   ├─── For each item:
   │    ├─── ValidateItem
   │    ├─── CheckValidation (Choice)
   │    ├─── ProcessValidItem (if valid)
   │    └─── HandleInvalidItem (if invalid)
   ↓
SummarizeResults (Aggregate results)
   ↓
[End]
```

## ItemProcessor Logic

For each item in the array:
1. **ValidateItem**: Check if the item meets criteria
2. **CheckValidation**: Choice state based on validation result
3. **ProcessValidItem**: Process valid items
4. **HandleInvalidItem**: Handle invalid items with Pass state

## Test Cases

### 1. Electronics Processing
- Process a list of electronics items
- All items are valid and get processed
- Results show successful processing for all items

### 2. Empty Category Processing
- Process unknown category returning empty list
- Validates Map behavior with zero items
- Results show proper aggregation with empty array

## Using mapExpectations

The `mapExpectations` feature enables detailed validation of Map state behavior including iteration count and execution path validation.

You can use the `mapExpectations` field to:

### Basic Validation
```yaml
mapExpectations:
  - state: "ProcessItems"
    iterationCount: 3  # Expected number of iterations (items processed)
```

### Common Path Validation for All Iterations
```yaml
mapExpectations:
  - state: "ProcessItems"
    iterationPaths:
      pathMatching: "exact"  # Choose from exact/includes/sequence
      all: ["ValidateItem", "CheckValidation", "ProcessValidItem"]  # Path all iterations follow
```

### Specific Iteration Path Validation
```yaml
mapExpectations:
  - state: "ProcessItems"
    iterationPaths:
      pathMatching: "exact"
      samples:
        0: ["ValidateItem", "CheckValidation", "ProcessValidItem"]   # Iteration 0 path
        1: ["ValidateItem", "CheckValidation", "HandleInvalidItem"]  # Iteration 1 path
        2: ["ValidateItem", "CheckValidation", "ProcessValidItem"]   # Iteration 2 path
```

### Path Matching Options
- `exact`: Complete match
- `sequence`: Ordered subset matching
- `includes`: Contains specified states (order independent)

```yaml
iterationPaths:
  pathMatching: "sequence"
  all: ["ValidateItem", "ProcessValidItem"]  # Can skip CheckValidation
```

## Key Configuration Options

### MaxConcurrency
```json
"MaxConcurrency": 2  // Process max 2 items in parallel
```

### ItemSelector
```json
"ItemSelector": {
  "item.$": "$$.Map.Item.Value",    // Current item
  "index.$": "$$.Map.Item.Index",   // Item index
  "category.$": "$.category"        // Data from parent context
}
```

### Result Handling
- **ResultPath**: `"$.processedItems"` - stores array of results
- Each result contains the output from ItemProcessor for that item
- Results maintain the same order as input items

## Running Tests

```bash
# Run tests
sfn-test run --suite ./test-suite.yaml

# Expected results
✓ Electronics processing
✓ Mixed validation scenario

All tests passed!
```

## Practical Use Cases

Map state is ideal for:
- **Batch Processing**: Process arrays of data items
- **Data Transformation**: Apply transformations to each item in a dataset
- **Validation Pipelines**: Validate and process items with different outcomes
- **Parallel Processing**: Process multiple items concurrently (with MaxConcurrency)

## Common Patterns

### 1. Filter Pattern
Use Choice states within ItemProcessor to filter items:
```json
"CheckValidation": {
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.validation.Payload.isValid",
      "BooleanEquals": true,
      "Next": "ProcessValidItem"
    }
  ],
  "Default": "HandleInvalidItem"
}
```

### 2. Error Handling
- Invalid items can be handled gracefully with Pass states
- Use Catch blocks in ItemProcessor for error recovery
- Results array will contain different structures based on processing outcome

## Troubleshooting

### Q: Map state results are in unexpected format?
A: Check ItemProcessor output. Each iteration's result becomes one element in the results array.

### Q: How to access original input data within ItemProcessor?
A: Use ItemSelector to pass necessary data from parent context to each iteration.

### Q: Performance with large arrays?
A: Use MaxConcurrency to control resource usage and prevent overwhelming downstream services.

## Next Steps
After understanding Map processing, learn about large-scale distributed processing in [05-distributed-map](../05-distributed-map/).