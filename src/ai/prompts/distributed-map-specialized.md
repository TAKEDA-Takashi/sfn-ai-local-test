# Distributed Map State Specialized Prompt

## CRITICAL: Distributed Map Structure Understanding

### What Makes Distributed Map Different
Distributed Map is designed for massive scale processing (up to 10,000 parallel executions):
- **ItemReader**: Reads large datasets from S3, DynamoDB, etc.
- **ItemProcessor**: Processes each item (can run as separate Lambda/ECS tasks)
- **ResultWriter**: Writes results back to S3 or other storage

### Critical: ItemReader Data Must Match ItemProcessor Input Requirements

**⚠️ IMPORTANT: ItemReader data becomes the input for ItemProcessor states ⚠️**

When generating ItemReader mock data, you MUST analyze the ItemProcessor to understand what fields are expected:

1. **Check the first state in ItemProcessor** - What fields does it reference?
2. **Look for Choice conditions** - Variables like `$.orderId`, `$.status` indicate required fields
3. **Examine Parameters/ItemSelector** - Field references show what the processor expects
4. **Match the data structure** - Each item from ItemReader becomes input to ItemProcessor

Example: If ItemProcessor has a Choice state checking `$.orderId` and `$.amount`:
```yaml
# CORRECT - Data matches processor expectations
- state: "ProcessOrders"
  type: "itemReader"
  dataFile: "orders.json"
  # The generated orders.json should contain:
  # [
  #   { "orderId": "001", "amount": 100, "status": "pending" },
  #   { "orderId": "002", "amount": 250, "status": "active" }
  # ]
```

### ⚠️ CRITICAL: Correct Mock Structure for Distributed Map ⚠️

**IMPORTANT**: DistributedMap states use ONLY ONE mock with `type: "itemReader"`

### Correct Mock Structure for Distributed Map

```yaml
mocks:
  # DistributedMap Mock - Use itemReader type ONLY
  - state: "ProcessLargeDataset"
    type: "itemReader"
    dataFile: "test-data/process-dataset-items.jsonl"  # ⚠️ REQUIRED
    dataFormat: "jsonl"  # Optional: json, jsonl, csv
  
  # Other states can be mocked normally
  - state: "PrepareDataSource"
    type: "fixed"
    response:
      Payload:
        bucket: "input-bucket"
        prefix: "data/"
        totalFiles: 10
      StatusCode: 200
```

**⚠️ DO NOT create duplicate mocks for DistributedMap states!**
- ✅ CORRECT: One mock with `type: "itemReader"`
- ❌ WRONG: Additional `type: "fixed"` mock for the same state
- ❌ WRONG: `type: "distributed-map"` (not a valid type)

### Understanding Distributed Map Components

#### ItemReader Configuration
```json
{
  "ItemReader": {
    "Resource": "arn:aws:states:::s3:listObjectsV2",
    "Parameters": {
      "Bucket": "my-bucket",
      "Prefix": "data/"
    }
  }
}
```

#### ItemProcessor (Child Workflow)
```json
{
  "ItemProcessor": {
    "ProcessorConfig": {
      "Mode": "DISTRIBUTED",
      "ExecutionType": "EXPRESS"
    },
    "StartAt": "ProcessBatch",
    "States": {
      "ProcessBatch": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke"
      }
    }
  }
}
```

#### ResultWriter Configuration
```json
{
  "ResultWriter": {
    "Resource": "arn:aws:states:::s3:putObject",
    "Parameters": {
      "Bucket": "output-bucket",
      "Prefix": "results/"
    }
  }
}
```

### Test Expectations for Distributed Map

🔴 **CRITICAL: NEVER use stateExpectations for states inside DistributedMap ItemProcessor!** 🔴

**USE THE RIGHT EXPECTATION TYPE:**
- stateExpectations = The DistributedMap state itself (for metadata output)
- mapExpectations = States INSIDE the ItemProcessor

✅ **CORRECT:**
```yaml
# Test DistributedMap output metadata
stateExpectations:
  - state: "ProcessLargeDataset"  # The DistributedMap state itself
    output:
      ProcessedItemCount: 1000
      FailedItemCount: 0
      PendingItemCount: 0
      ResultWriterDetails:
        Bucket: "output-bucket"
    outputMatching: "partial"

# Test ItemProcessor execution paths
mapExpectations:
  - state: "ProcessLargeDataset"
    iterationCount: 1000
    iterationPaths:
      samples:
        0: ["ValidateBatch", "ProcessBatch", "SaveResults"]
```

❌ **WRONG:**
```yaml
# NEVER do this for states inside ItemProcessor!
stateExpectations:
  - state: "ProcessBatch"  # ❌ WRONG! Inside ItemProcessor
    output: {...}
```

### Key Differences from Regular Map

1. **Scale**: Handles millions of items vs thousands
2. **Execution Mode**: DISTRIBUTED vs INLINE
3. **Child Executions**: Separate Step Functions executions
4. **Cost Model**: Charged per state transition in child executions
5. **Storage**: Built-in S3 integration for input/output

### Common Distributed Map Patterns

1. **S3 Batch Processing**
   - Read list of S3 objects
   - Process each object in parallel
   - Write results back to S3

2. **Large Dataset ETL**
   - Read from data lake
   - Transform in distributed fashion
   - Aggregate results

3. **Log Processing**
   - Process CloudWatch Logs exports
   - Analyze patterns across files
   - Generate reports

### ❌ Common Mistakes to Avoid

```yaml
# ❌❌❌ ABSOLUTELY WRONG - NEVER create multiple mocks for the same state!
mocks:
  - state: "ProcessLargeDataset"
    type: "itemReader"
    dataFile: "data.jsonl"
  - state: "ProcessLargeDataset"  # ❌ DUPLICATE - This causes errors!
    type: "fixed"
    response: {...}

# ❌ WRONG - Don't mock ItemReader/ResultWriter as separate states
mocks:
  - state: "ProcessLargeDataset.ItemReader"  # Not a state!
    response: {...}

# ❌ WRONG - Don't forget Distributed Map has different output
stateExpectations:
  - state: "ProcessLargeDataset"
    output:
      - result1  # Wrong - not an array like regular Map
      - result2

# ✅ CORRECT for mocks - ONE mock with itemReader type
mocks:
  - state: "ProcessLargeDataset"
    type: "itemReader"
    dataFile: "data.jsonl"
    # That's it! No additional mock needed!

# ✅ CORRECT for test expectations - Distributed Map returns execution metadata
stateExpectations:
  - state: "ProcessLargeDataset"
    output:
      ProcessedItemCount: 1000
      ResultWriterDetails:
        Bucket: "output-bucket"
```

### 🚨 CRITICAL RULE FOR DISTRIBUTED MAP MOCKS 🚨
**ONE state = ONE mock definition**
- If a state has ItemReader, use `type: "itemReader"` ONLY
- NEVER create two mocks with the same state name
- The mock engine will fail if duplicate state names exist

### Important Configuration

- **MaxConcurrency**: Up to 10,000 (vs 40 for regular Map)
- **ToleratedFailurePercentage**: Continue even with failures
- **ItemBatcher**: Group items for batch processing
- **Label**: Name for the distributed execution