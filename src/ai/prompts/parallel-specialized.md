# Parallel State Specialized Prompt

## CRITICAL: Parallel State Structure Understanding

### How Parallel States Work
A Parallel state executes multiple branches simultaneously. Each branch is independent and has its own states.

**IMPORTANT**: Current implementation limitations:
1. **Parallel states themselves CANNOT be mocked directly**
2. **You MUST mock individual Task states WITHIN each branch**
3. **Branch states ARE mockable even though they're nested**

### Correct Mock Structure for Parallel States

```yaml
# ✅ CORRECT - Mock individual tasks within branches
mocks:
  # Tasks from Branch 0
  - state: "ValidateOrder"  # Task state inside branch 0
    type: "fixed"
    response:
      Payload:
        validationResult: "success"
        orderId: "12345"
      StatusCode: 200
  
  # Tasks from Branch 1
  - state: "CalculatePrice"  # Task state inside branch 1
    type: "fixed"
    response:
      Payload:
        totalPrice: 1200
        discount: 100
      StatusCode: 200
  
  # Tasks from Branch 2
  - state: "CheckInventory"  # Task state inside branch 2
    type: "fixed"
    response:
      Payload:
        inventoryStatus: "available"
        stock: 50
      StatusCode: 200

# ❌ WRONG - Cannot mock the Parallel state itself
mocks:
  - state: "ProcessInParallel"  # This will NOT work!
    type: "parallel"
    branches: [...]
```

### Test Expectations for Parallel States

#### Testing Parallel State Output
Use `stateExpectations` for the Parallel state itself:
```yaml
stateExpectations:
  - state: "ProcessInParallel"
    output:
      - validationResult: "success"  # Branch 0 result
        orderId: "12345"
      - totalPrice: 1200              # Branch 1 result
        discount: 100
      - inventoryStatus: "available"  # Branch 2 result
        stock: 50
    outputMatching: "partial"
```

#### Testing Parallel Branch States

🔴 **ABSOLUTELY CRITICAL: NEVER use stateExpectations for states inside Parallel branches!** 🔴

**THIS IS THE MOST COMMON MISTAKE - DO NOT MAKE IT!**

❌ **WRONG (WILL FAIL):**
```yaml
# This is INCORRECT and will cause "State execution not found" errors
stateExpectations:
  - state: "ValidateOrder"  # ❌ WRONG! Inside Parallel branch
    output: {...}
  - state: "CalculatePrice"  # ❌ WRONG! Inside Parallel branch
    output: {...}
```

✅ **CORRECT:**
```yaml
# Test branch execution with parallelExpectations
parallelExpectations:
  - state: "ProcessInParallel"  # The Parallel state name
    branchCount: 3
    branchPaths:
      0: ["ValidateOrder", "CheckFraud"]      # Branch 0 states
      1: ["CalculatePrice", "ApplyDiscount"]  # Branch 1 states
      2: ["CheckInventory", "ReserveItems"]   # Branch 2 states

# Test Parallel output with stateExpectations (for the Parallel state itself)
stateExpectations:
  - state: "ProcessInParallel"  # The Parallel state itself
    outputMatching: "partial"
    output: [branch0Result, branch1Result, branch2Result]  # Array of branch results
```

**REMEMBER:**
- stateExpectations = Top-level states and the Parallel state itself
- parallelExpectations = States INSIDE the Parallel branches
- Individual states within branches (like "ValidateOrder") should NEVER be in stateExpectations!

### Common Parallel Patterns

1. **Validation + Processing**
   - Branch 0: Validate input
   - Branch 1: Process data
   - Branch 2: Check resources

2. **Multi-service calls**
   - Branch 0: Call Service A
   - Branch 1: Call Service B
   - Branch 2: Call Service C

3. **Data enrichment**
   - Branch 0: Get user details
   - Branch 1: Get transaction history
   - Branch 2: Get preferences

### Error Handling in Parallel States

- If ANY branch fails, the entire Parallel state fails
- Use Catch on the Parallel state, not individual branches
- ResultPath combines all branch outputs into an array