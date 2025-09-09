# 05-distributed-map: Large-Scale Processing with Distributed Map

## Overview
This example demonstrates how to use the Distributed Map state for processing large datasets at scale. It showcases distributed processing patterns with batching, error handling, and result aggregation for scenarios involving millions of records.

## Test Data

The example includes external test data in the `test-data/` directory:
- `products.json` - Sample product dataset (10 items)

This demonstrates how ItemReader mock can load data from external files instead of inline data, keeping the mock configuration clean and maintainable.

## Learning Points

### 1. Distributed Map vs Regular Map
**Regular Map**:
- Processes items within a single execution
- Limited by execution history and memory
- Best for < 10K items

**Distributed Map**:
- Spawns child executions for processing
- Can handle millions of items
- Built for massive scale with fault tolerance

### 2. Key Components

#### ItemReader
```json
"ItemReader": {
  "Resource": "arn:aws:states:::s3:getObject",
  "ReaderConfig": {
    "InputType": "JSON"
  },
  "Parameters": {
    "Bucket.$": "$.dataSource.bucket",
    "Key.$": "$.dataSource.key"
  }
}
```

#### ItemBatcher
```json
"ItemBatcher": {
  "MaxItemsPerBatch": 10,
  "BatchInput": {
    "batchMetadata": {
      "processingType": "distributed",
      "timestamp.$": "$$.State.EnteredTime"
    }
  }
}
```

#### ProcessorConfig
```json
"ProcessorConfig": {
  "Mode": "DISTRIBUTED",
  "ExecutionType": "EXPRESS"
}
```

#### ResultWriter
```json
"ResultWriter": {
  "Resource": "arn:aws:states:::s3:putObject",
  "Parameters": {
    "Bucket": "my-results-bucket",
    "Key.$": "States.Format('results/{}.json', $$.Execution.Name)"
  }
}
```

### 3. Error Handling Features
- **ToleratedFailurePercentage**: Allow up to 5% of batches to fail
- **Retry Logic**: Automatic retry for transient failures
- **Catch Blocks**: Graceful error handling for batch failures

## State Machine Architecture

```
[Start]
   ↓
PrepareDataSource (Configure processing parameters)
   ↓
ProcessLargeDataset (Distributed Map)
   ├─── ItemReader: Read from S3
   ├─── ItemBatcher: Group into batches of 100
   ├─── ItemProcessor: For each batch (child execution):
   │    ├─── ProcessBatch (Lambda)
   │    ├─── ValidateResults (Choice)
   │    ├─── LogSuccess / LogEmptyBatch
   │    └─── HandleBatchError (if failed)
   ├─── ResultWriter: Write results to S3
   ↓
SummarizeResults (Aggregate final results)
   ↓
[End]
```

## Processing Flow

### 1. Data Ingestion
- **ItemReader** reads large dataset from S3 (JSON format)
- Supports CSV, JSON, JSONL, and Manifest formats
- Can handle files of any size

### 2. Batch Processing
- **ItemBatcher** groups items into configurable batch sizes
- Each batch becomes a separate child execution
- Batches run in parallel up to MaxConcurrency limit

### 3. Item Processing
- Each batch is processed by a Lambda function
- Includes retry logic for transient failures
- Logs processing results and errors

### 4. Result Aggregation
- **ResultWriter** stores results in S3
- Final state summarizes execution statistics
- Provides completion metrics and status

## Configuration Options

### Concurrency Control
```json
"MaxConcurrency": 1000  // Maximum parallel child executions
```

### Fault Tolerance
```json
"ToleratedFailurePercentage": 5  // Allow 5% batch failures
```

### Batch Configuration
```json
"ItemBatcher": {
  "MaxItemsPerBatch": 10,      // Items per batch (smaller for better demonstration)
  "MaxInputBytesPerBatch": 1048576  // Optional: Max bytes per batch
}
```

### Execution Mode
```json
"ProcessorConfig": {
  "Mode": "DISTRIBUTED",        // Required for Distributed Map
  "ExecutionType": "EXPRESS"    // Use Express workflows for speed
}
```

## Test Scenarios

### 1. Large Dataset Processing
- Simulates processing of large product catalog
- Tests distributed processing with batching
- Validates path execution and data flow

### 2. Small Dataset Processing
- Tests basic functionality with smaller dataset
- Ensures proper result aggregation
- Validates completion status

## Running Tests

```bash
# Run tests
sfn-test run --suite ./test-suite.yaml

# Expected results
✅ Large dataset processing
✅ Small dataset processing

All tests passed!
```

## Practical Use Cases

Distributed Map is ideal for:

### 1. Data Processing Pipelines
- **ETL Operations**: Transform millions of records
- **Data Validation**: Validate large datasets
- **Format Conversion**: Convert file formats at scale

### 2. Content Processing
- **Image Processing**: Resize/transform millions of images
- **Document Processing**: Extract data from documents
- **Media Transcoding**: Convert audio/video files

### 3. Business Operations
- **Report Generation**: Process large datasets for reporting
- **Batch Notifications**: Send notifications to millions of users
- **Data Migration**: Migrate data between systems

### 4. Machine Learning
- **Feature Engineering**: Process training datasets
- **Batch Prediction**: Run inference on large datasets
- **Model Evaluation**: Validate models against test data

## Best Practices

### 1. Optimize Batch Size
```json
// Consider these factors:
"MaxItemsPerBatch": 100,  // Balance between overhead and processing time
"MaxInputBytesPerBatch": 1048576  // Prevent oversized batches
```

### 2. Handle Failures Gracefully
```json
"ToleratedFailurePercentage": 5,  // Allow some failures
"Retry": [
  {
    "ErrorEquals": ["Lambda.ServiceException"],
    "MaxAttempts": 3,
    "BackoffRate": 2.0
  }
]
```

### 3. Monitor Progress
- Use CloudWatch metrics to monitor execution
- Implement logging in ItemProcessor for debugging
- Set up alarms for failure rates

### 4. Cost Optimization
- Use Express workflows for ItemProcessor
- Right-size batch configurations
- Monitor and optimize Lambda function performance

## Troubleshooting

### Q: Child executions failing with timeout?
**A**: Increase timeout in ItemProcessor or reduce batch size. Express workflows have a 5-minute limit.

### Q: Processing too slow?
**A**: Increase MaxConcurrency or optimize Lambda function performance. Consider batch size adjustments.

### Q: High costs?
**A**: Optimize batch size to reduce overhead. Use Express workflows and right-size Lambda functions.

### Q: ItemReader not finding data?
**A**: Verify S3 bucket/key parameters and ensure proper IAM permissions for the execution role.

## Advanced Features

### 1. Multiple Input Sources
```json
"ItemReader": {
  "Resource": "arn:aws:states:::s3:listObjectsV2",
  "Parameters": {
    "Bucket": "my-bucket",
    "Prefix": "data/"
  }
}
```

### 2. Custom Result Processing
```json
"ResultWriter": {
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": {
    "FunctionName": "CustomResultProcessor",
    "Payload.$": "$"
  }
}
```

### 3. Dynamic Configuration
```json
"MaxConcurrency.$": "$.processingConfig.maxConcurrency",
"ToleratedFailurePercentage.$": "$.processingConfig.failureThreshold"
```

## Next Steps
After mastering Distributed Map processing, learn about error handling patterns in [06-error-handling](../06-error-handling/).