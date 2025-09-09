# Map State Specialized Prompt

## 🔴 CRITICAL: Map States MUST Return Arrays! 🔴

**GOLDEN RULE**: Map and DistributedMap states ALWAYS return arrays, never single objects!

```yaml
# ✅ CORRECT - Map returns array
- state: "ProcessItems"
  type: "fixed"
  response:  # <-- This MUST be an array!
    - processedItem: "item1"
      status: "success"
    - processedItem: "item2"
      status: "success"

# ❌ WRONG - Single object
- state: "ProcessItems"
  type: "fixed"
  response:  # <-- This is WRONG!
    processedItem: "item1"
    status: "success"
```

## CRITICAL: Map State Structure Understanding

### How Map States Work
A Map state processes an array of items, applying the same processing logic (ItemProcessor) to each item.

**IMPORTANT**: Map states have a nested structure:
- The Map state itself (top-level)
- ItemProcessor containing the processing logic (nested states)

### Correct Mock Structure for Map States

#### Option 1: Simple Fixed Response (Mock entire Map state)
```yaml
# For simple cases where all items get same processing
mocks:
  - state: "ProcessItems"  # The Map state name
    type: "fixed"
    response:
      - processedItem: "item1-processed"
        status: "success"
      - processedItem: "item2-processed"
        status: "success"
```

#### Option 2: Conditional Processing (Mock ItemProcessor states)
```yaml
# For complex logic within ItemProcessor
mocks:
  # First, provide the list of items
  - state: "GetItemList"
    type: "fixed"
    response:
      Payload:
        items: ["item1", "item2", "item3"]
      StatusCode: 200

  # Then mock the processing logic
  - state: "ProcessItems"
    type: "map"
    itemProcessor:
      # Each item goes through these states
      mocks:
        - state: "ValidateItem"
          type: "conditional"
          conditions:
            - when:
                item: "item1"
              response:
                valid: true
            - default:
                valid: false
        
        - state: "TransformItem"
          type: "fixed"
          response:
            transformed: true
```

### Understanding ItemProcessor vs Iterator

**Modern (ItemProcessor)**:
```json
{
  "Type": "Map",
  "ItemProcessor": {
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": { "Type": "Task" }
    }
  }
}
```

**Iterator Format**:
```json
{
  "Type": "Map",
  "Iterator": {
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": { "Type": "Task" }
    }
  }
}
```

Both work the same way - ItemProcessor is the modern name.

### Test Expectations for Map States

#### Testing Map State Output
Use `stateExpectations` for the Map state itself:
```yaml
stateExpectations:
  - state: "ProcessItems"
    output:
      # Array of processed results
      - itemId: "1"
        result: "processed"
      - itemId: "2"
        result: "processed"
      - itemId: "3"
        result: "processed"
    outputMatching: "partial"
```

#### Testing Map Internal States

🔴 **ABSOLUTELY CRITICAL: NEVER use stateExpectations for states inside Map ItemProcessor!** 🔴

**THIS IS THE MOST COMMON MISTAKE - DO NOT MAKE IT!**

❌ **WRONG (WILL FAIL):**
```yaml
# This is INCORRECT and will cause "State execution not found" errors
stateExpectations:
  - state: "ValidateItem"  # ❌ WRONG! Inside Map ItemProcessor
    output: {...}
  - state: "TransformItem"  # ❌ WRONG! Inside Map ItemProcessor
    output: {...}
```

✅ **CORRECT:**
```yaml
# Test Map iteration behavior with mapExpectations
mapExpectations:
  - state: "ProcessItems"  # The Map state name
    iterationCount: 3
    iterationPaths:
      all: ["ValidateItem", "TransformItem", "SaveItem"]  # Internal states

# Test Map output with stateExpectations (for the Map state itself)
stateExpectations:
  - state: "ProcessItems"  # The Map state itself
    outputMatching: "partial"
    output: [result1, result2, result3]  # Array of results
```

**REMEMBER:**
- stateExpectations = Top-level states and the Map state itself
- mapExpectations = States INSIDE the Map ItemProcessor
- Individual states within ItemProcessor (like "ValidateItem") should NEVER be in stateExpectations!

### Common Map Patterns

1. **Batch Processing**
   - Input: Array of records
   - Process: Validate → Transform → Save
   - Output: Array of results

2. **Parallel Item Processing**
   - MaxConcurrency controls parallelism
   - Each item processed independently

3. **Error Handling**
   - ItemSelector: Select data for each iteration
   - ResultSelector: Transform each result
   - ResultPath: Where to place results

### Important Map Parameters

- **ItemsPath**: Where to find the array to iterate over (default: "$")
- **ItemSelector**: Transform input for each item
- **MaxConcurrency**: Limit parallel executions
- **ResultPath**: Where to place the results array

### ❌ Common Mistakes to Avoid

```yaml
# WRONG - Don't reference ItemProcessor states directly
mocks:
  - state: "ValidateItem"  # This won't work!
    response: {...}

# WRONG - Don't forget Map returns an array
stateExpectations:
  - state: "ProcessItems"
    output:
      result: "success"  # Should be an array!

# CORRECT
stateExpectations:
  - state: "ProcessItems"
    output:
      - result: "success"
      - result: "success"
```