# Choice State Mock Guidelines

## ⚠️ CRITICAL: Choice Mocks Are Special Cases Only

### Basic Principle
**DO NOT mock Choice states unless absolutely necessary**

Choice states should evaluate naturally based on their conditions. Mocking a Choice state overrides its logic and forces a specific branch, which should only be done in exceptional cases.

## When to Use Choice Mocks (RARE CASES)

### 1. Infinite Loop Prevention (PRIMARY USE CASE)

#### Non-Deterministic Patterns to Watch For:

**General Categories (ALWAYS CHECK FOR THESE):**
1. **Time-based conditions** - Any comparison involving current time, elapsed time, or timestamps
2. **Random/UUID functions** - Any function generating random or unique values
3. **Execution context** - Values that change during execution (retry counts, state names, tokens)
4. **External state** - Conditions depending on external systems or databases
5. **Custom functions** - Any user-defined or extension functions with non-deterministic behavior

**Common Examples in JSONPath Mode:**
- Timestamp comparisons: `TimestampEquals`, `TimestampEqualsPath`, `TimestampLessThanPath`
- Context variables: `$$.State.EnteredTime`, `$$.Execution.StartTime`, `$$.Task.Token`
- But also consider: ANY custom comparison that might involve time or external state

**Common Examples in JSONata Mode:**
- Random functions: `$random()`, `$uuid()` (AWS extension)
- Time functions: `$now()`, `$millis()` (returns current timestamp/milliseconds)
- Context functions: 
  - `$states.context.State.EnteredTime` - Changes every state entry
  - `$states.context.State.RetryCount` - Increments with each retry
  - `$states.context.Execution.StartTime` - Fixed but test-dependent
- But also consider: ANY custom function that might be non-deterministic

**Structural Loops:**
- Choice state that can reach itself through any path
- Retry patterns without fixed limits
- Polling loops waiting for external conditions
- State machines checking for async operation completion

#### How to Identify Non-Deterministic Conditions:

Ask yourself:
1. **Will this condition always evaluate the same way with the same input?**
   - If NO → Consider mocking
2. **Does this condition depend on time, randomness, or external state?**
   - If YES → Consider mocking
3. **Can this Choice create an unbounded loop?**
   - If YES → Must use mock with stateful responses

```yaml
# Example: Non-deterministic JSONata condition
# State has: Condition: "{% $random() > 0.5 %}"
- state: "RandomChoice"
  type: "stateful"
  responses:
    - nextState: "ProcessA"  # First execution
    - nextState: "ProcessB"  # Second execution
    - nextState: "Complete"  # Force completion

# Example: Timestamp comparison loop
- state: "WaitingChoice"
  type: "stateful"
  responses:
    - nextState: "Wait"  # Loop 1-2 times
    - nextState: "Wait"  
    - nextState: "Proceed"  # Force exit on 3rd iteration
```

### 2. Testing Error Paths
When you need to test error handling branches that are hard to trigger:

```yaml
# Force error handling path for testing
- state: "ValidationChoice"
  type: "fixed"
  response:
    nextState: "HandleCriticalError"  # Force error path
```

### 3. Testing Timeout/Deadline Branches
When testing time-sensitive branches without waiting:

```yaml
# Skip waiting for actual timeout
- state: "TimeoutCheck"
  type: "fixed"
  response:
    nextState: "HandleTimeout"  # Force timeout branch
```

### 4. Breaking Circular Dependencies in Tests
When state machine has circular references that need breaking:

```yaml
# Break circular dependency for test completion
- state: "CircularCheck"
  type: "conditional"
  conditions:
    - when:
        input:
          testMode: true
      response:
        nextState: "ExitCircle"
```

## When NOT to Use Choice Mocks (MOST CASES)

### ❌ DO NOT mock when:
1. **Normal conditions work fine** - Let the Choice evaluate naturally
2. **Testing happy path** - Use appropriate input data instead
3. **Validating Choice logic** - The whole point is to test the conditions
4. **Simple true/false branches** - Just provide the right input

### Example of UNNECESSARY mock:
```yaml
# ❌ BAD - Don't mock simple choices
- state: "IsAdultCheck"
  type: "fixed"
  response:
    nextState: "ProcessAdult"
    
# ✅ GOOD - Just provide appropriate input
input:
  age: 25  # This will naturally choose ProcessAdult branch
```

## How Choice Mocks Work

When a Choice state has a mock:
1. Mock is checked FIRST before evaluating conditions
2. If mock returns `nextState`, that branch is taken
3. If no mock or mock has no `nextState`, normal evaluation occurs

### Mock Response Format:
```yaml
- state: "ChoiceStateName"
  type: "fixed|conditional|stateful"
  response:
    nextState: "ForcedNextState"  # Required field for Choice mocks
```

## Best Practices

### 1. Document Why You're Mocking
```yaml
# IMPORTANT: Mocking to prevent infinite loop with dynamic timestamps
- state: "TimestampChoice"
  type: "stateful"
  responses: [...]
```

### 2. Use Stateful Mocks for Loops
```yaml
# Allow 2 iterations then force exit
- state: "RetryChoice"
  type: "stateful"
  responses:
    - nextState: "RetryTask"     # Iteration 1
    - nextState: "RetryTask"     # Iteration 2
    - nextState: "GiveUp"        # Force exit
```

### 3. Keep Mock Logic Simple
- Don't create complex conditional mocks for Choice states
- If complex logic is needed, reconsider if mocking is the right approach

## Warning Signs You're Over-Mocking

🚨 **Red Flags:**
- Mocking every Choice state in your test
- Using mocks to avoid setting up proper test data
- Complex conditional logic in Choice mocks
- Mocking Choices that work fine with normal inputs

## Summary

**Remember:** Choice mocks are a powerful escape hatch for specific problems, not a standard testing tool. Use them sparingly and always document why they're necessary.