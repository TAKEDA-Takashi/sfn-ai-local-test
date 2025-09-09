# 02-choice: Conditional Branching with Choice State

## Overview
This example demonstrates using Choice state to branch to different processing paths based on age and member type.
You can learn various Choice state features including single conditions, compound conditions (And), and default processing.

## Learning Points

### 1. Basic Choice State Structure
```json
"CheckAge": {
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.userData.age",
      "NumericGreaterThanEquals": 65,
      "Next": "SeniorProcess"
    }
  ],
  "Default": "UnknownAge"
}
```

### 2. Using Compound Conditions (And)
Combining multiple conditions with AND operator:

```json
{
  "And": [
    {
      "Variable": "$.userData.age",
      "NumericGreaterThanEquals": 65
    },
    {
      "Variable": "$.userData.memberType",
      "StringEquals": "premium"
    }
  ],
  "Next": "PremiumSeniorProcess"
}
```

### 3. Utilizing ResultSelector
Extracting contents from Lambda integration Payload:

```json
"ResultSelector": {
  "age.$": "$.Payload.age",
  "name.$": "$.Payload.name",
  "memberType.$": "$.Payload.memberType"
}
```

## State Machine Structure

```
[Start]
   ↓
GetUserAge (Task)
   - Retrieves user info via Lambda integration
   - Extracts required info from Payload using ResultSelector
   ↓
CheckAge (Choice)
   ├─[age >= 65 AND memberType == "premium"]─→ PremiumSeniorProcess (50% discount + benefits)
   ├─[age >= 65]─────────────────────────────→ SeniorProcess (30% discount)
   ├─[age >= 20]─────────────────────────────→ AdultProcess (no discount)
   ├─[age < 20]──────────────────────────────→ ChildProcess (50% discount + parental controls)
   └─[Default]───────────────────────────────→ UnknownAge (error handling)
```

## Importance of Condition Evaluation Order

Choices are evaluated from top to bottom:

1. **Premium Senior Condition** (most specific) placed first
2. **Regular Senior Condition** (non-premium seniors)
3. **Adult Condition**
4. **Child Condition**
5. **Default** (when no conditions match)

Placing more specific conditions at the top ensures correct branching.

## Mock Configuration Tips

### conditional Mock Type
Returns different responses based on input:

```yaml
conditions:
  - when:
      input:
        Payload:
          userId: "senior-premium-001"
    response:
      Payload:
        age: 70
        name: "Emily Davis"
        memberType: "premium"
      StatusCode: 200
```

Input is matched using partial matching, so Payload structure must be included.

## Test Case Design

### 1. Compound Condition Tests
- Premium Senior (age >= 65 AND premium)
- Regular Senior (age >= 65, standard member)

### 2. Boundary Value Tests
- Exactly 65 years old → processed as senior
- Exactly 20 years old → processed as adult
- 19 years old → processed as child

### 3. Default Processing
- No age data → branches to UnknownAge

## Running Tests

```bash
# Run test suite
sfn-test run --suite ./test-suite.yaml

# Expected output
✓ Premium senior classification (age >= 65 AND premium)
✓ Regular senior classification (age >= 65, standard member)
✓ Adult classification (age >= 20, < 65)
✓ Child classification (age < 20)
✓ Unknown age (default processing)

All tests passed!
```

## Troubleshooting

### Q: Compound conditions not evaluating as expected
A: All conditions within an And condition must be true. If any one is false, the entire condition is skipped.

### Q: Cannot retrieve values with ResultSelector
A: Check JSONPath syntax and the `.$` suffix for key names.

### Q: Conditional mocks not matching
A: Verify that the input structure (including Payload) is correct. Evaluation uses partial matching.

## Next Steps
Once you understand conditional branching, learn about parallel processing in [03-parallel](../03-parallel/).