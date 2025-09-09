# Variables Example

This example demonstrates the **Variables feature** in AWS Step Functions using the `Assign` field to create, update, and reference variables throughout the workflow execution.

## Learning Objectives

After studying this example, you will understand:

1. **Variable Assignment** - How to create and update variables using the `Assign` field
2. **Variable References** - How to access variables using `$$.Variables`
3. **Variable Scope** - How variables persist across states
4. **Variable Calculations** - How to perform calculations with existing variables
5. **Timestamp Variables** - How to capture state entry times

## Key Concepts

### Assign Field Syntax
```json
"Assign": {
  "staticVariable": "fixed-value",
  "dynamicVariable.$": "$.inputField", 
  "timestampVariable.$": "$$.State.EnteredTime",
  "calculatedVariable.$": "States.MathAdd($existingVar, $.newValue)"
}
```

### Variable References
```json
"Parameters": {
  "userId.$": "$.userId",
  "totalSavings.$": "$totalSavings",
  "processingStatus.$": "$processingStatus"
}
```

## Workflow Structure

```
InitializeUser (Assign: userCreated, processingStatus, transactionCount)
↓
CalculateDiscount (Lambda Task - Assign: discountCalculated, processingStatus, calculationStep, discountAmount)  
↓
CheckEligibility (Choice based on eligibleForBonus)
├─ ProcessBonus (Lambda Task - Assign: bonusProcessed, processingStatus, bonusAmount, transactionCount++, totalSavings)
└─ ProcessRegular (Lambda Task - Assign: regularProcessed, processingStatus, transactionCount++, totalSavings)
↓
GenerateReport (Pass - Assign: reportGenerated, processingStatus = "completed")
```

## Variable Usage Patterns

### 1. Counter Variables
```json
// Initialize counter
"transactionCount": 0

// Increment counter in later states using States.MathAdd
"transactionCount.$": "States.MathAdd($transactionCount, 1)"
```

### 2. Status Tracking
```json
// Set status at each stage
"processingStatus": "initialized"      // InitializeUser
"processingStatus": "discount_calculated"  // CalculateDiscount  
"processingStatus": "bonus_applied"        // ProcessBonus
"processingStatus": "completed"            // GenerateReport
```

### 3. Accumulator Variables
```json
// Combine values from different sources using States.MathAdd
"totalSavings.$": "States.MathAdd($discountAmount, $.bonusAmount)"

// For regular path (discount only)
"totalSavings.$": "$discountAmount"
```

### 4. Timestamp Tracking
```json
// Capture when states are entered
"userCreated.$": "$$.State.EnteredTime"
"discountCalculated.$": "$$.State.EnteredTime"  
"reportGenerated.$": "$$.State.EnteredTime"
```

## Variable Scope Rules

1. **Assignment Timing**: All expressions in `Assign` are evaluated first, then assigned simultaneously
2. **Availability**: Variables are available from the same state and all subsequent states
3. **Reference Syntax**: Use `$variableName` to reference variables
4. **Math Operations**: Use States intrinsic functions like `States.MathAdd($var1, $var2)` for calculations
5. **Persistence**: Variables persist throughout the entire execution
6. **Size Limits**: 
   - Single variable: max 256 KiB
   - All variables in one Assign: max 256 KiB  
   - Total execution variables: max 10 MiB

## Important Implementation Notes

- **Variables in Current State**: Variables can be referenced in the same state's other fields (like Parameters)
- **States Functions**: Use `States.MathAdd()`, `States.MathRandom()`, etc. for mathematical operations
- **Variable vs Input**: `$variableName` for variables, `$.fieldName` for input data
- **Mixed References**: You can mix variable references (`$var`) and input references (`$.field`) in the same expression

## Test Features

### State Expectations
The test suite uses `stateExpectations` to verify variable values at specific states:

```yaml
stateExpectations:
  - state: "ProcessBonus"
    variables:
      transactionCount: 1
      totalSavings: 75  # discountAmount (50) + bonusAmount (25)
      processingStatus: "bonus_applied"
      bonusAmount: 25
```

### Variable Reference Testing
Tests verify that variables can be:
- Created and updated correctly
- Referenced in subsequent states
- Used in calculations
- Accumulated across multiple operations

## Running the Tests

```bash
# Run all variable test cases
sfn-test run --suite test-suite.yaml

# Run with verbose output to see variable changes
sfn-test run --suite test-suite.yaml --verbose

# Test specific variable pattern
sfn-test run --suite test-suite.yaml --case "Variable accumulation over multiple states"
```

## Test Cases

1. **Bonus eligible user** - Full variable lifecycle with bonus path
2. **Regular user** - Alternative path with different variable values  
3. **Variable accumulation** - Complex calculations and accumulation patterns
4. **Variable references** - Testing different ways to reference variables
5. **Timestamp variables** - Testing time-based variable assignments

Each test case includes `stateExpectations` to validate that variables are assigned and updated correctly at each step in the workflow.

## Important Notes

- Variables are **execution-scoped** - they persist for the entire workflow run
- Use `$variableName` to reference variables in JSON paths
- Use States intrinsic functions for mathematical operations (e.g., `States.MathAdd($var1, $.field)`)
- Variable assignments happen **after** all other field processing in a state  
- Variables are particularly useful for tracking state across complex workflows
- Consider variable size limits when storing large data structures