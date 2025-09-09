# MOCK FILE OUTPUT RULES

## ⚠️ THIS IS FOR MOCK FILES ONLY ⚠️

You are generating a **MOCK CONFIGURATION FILE**, not a test file.

## MANDATORY MOCK FILE STRUCTURE

```yaml
version: "1.0"                  # ⚠️ REQUIRED
mocks:                           # ⚠️ REQUIRED: Array of mock definitions
  - state: "ExactStateName"      # ⚠️ REQUIRED: Must match ASL state name exactly
    type: "fixed|conditional|stateful|error|itemReader"  # ⚠️ REQUIRED
    # Type-specific fields below (see MOCK TYPES section)
```

Optional fields:
- `name`: Mock configuration name
- `description`: Description

## MOCK TYPES

### 1. Fixed Mock
```yaml
- state: "StateName"
  type: "fixed"
  response:
    Payload: {...}       # For Lambda tasks
    StatusCode: 200
```

### 2. Conditional Mock
```yaml
- state: "StateName"
  type: "conditional"
  conditions:
    - when:
        input:           # REQUIRED: Must use 'input' field
          Payload: {...} # For Lambda tasks
      response: {...}
    - default: {...}
```

### 3. Stateful Mock
```yaml
- state: "StateName"
  type: "stateful"
  responses:             # Array returned in sequence
    - {...}
    - {...}
```

### 4. Error Mock
```yaml
- state: "StateName"
  type: "error"
  error:
    type: "ErrorType"
    cause: "Error cause"
    message: "Error message"
```

### 5. ItemReader Mock (for DistributedMap states ONLY)
```yaml
- state: "DistributedMapStateName"
  type: "itemReader"
  dataFile: "test-data/state-name-items.jsonl"  # ⚠️ REQUIRED
  dataFormat: "jsonl"  # Optional: json, jsonl, csv, yaml
```

**⚠️ CRITICAL for DistributedMap states:**
- **MUST use `type: "itemReader"`** - This is the ONLY mock type for DistributedMap
- **MUST include `dataFile`** - Path to test data file (will be auto-generated)
- **DO NOT create additional `type: "fixed"` mock** for the same DistributedMap state
- **One DistributedMap state = One itemReader mock ONLY**

## CRITICAL RULES FOR MOCKS

1. **MUST have 'mocks:' array** at the root level
2. **MUST NOT have 'testCases:'** - that's for test files
3. **MUST NOT have 'stateMachine:'** field - that's for test files
4. State names MUST match exactly with the ASL definition
5. Lambda tasks MUST use Payload wrapper in responses

## FORBIDDEN IN MOCK FILES

❌ DO NOT include these test-specific fields:
- `testCases`
- `stateMachine`
- `expectedPath`
- `stateExpectations`
- `settings.timeout`

## VALIDATION CHECK

Before outputting, verify:
1. File starts with `version: "1.0"`
2. Contains `mocks:` array
3. Does NOT contain `testCases:` or `stateMachine:`
4. All state names exist in the provided ASL
5. Lambda responses include Payload wrapper where needed