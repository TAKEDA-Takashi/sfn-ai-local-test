# CDK Integration Example

This example demonstrates how to integrate sfn-ai-local-test with AWS CDK projects to test AWS Step Functions state machines defined in CDK TypeScript code. It shows a complete workflow from CDK definition to local testing with 100% state and branch coverage.

## Overview

This example features an order processing workflow that demonstrates:
- **CDK Integration**: State machine defined using AWS CDK
- **JSONPath Expressions**: Complex data transformations and routing logic
- **Multiple State Types**: Pass, Task, Choice, Map, Wait, Parallel, Succeed, and Fail states
- **Error Handling**: Retry policies and error catching
- **Conditional Logic**: Order amount-based discount calculation
- **Parallel Processing**: Concurrent order processing and email sending
- **Local Testing**: Complete test coverage with comprehensive mocking

## State Machine Architecture

The order processing workflow includes:

1. **PrepareOrder** (Pass) - Initialize order data with timestamp
2. **ValidateOrder** (Task) - Lambda function to validate order data
3. **CheckOrderAmount** (Choice) - Route based on order total
4. **CalculateDiscount** (Task) - Apply discount for large orders (>$5000)
5. **ProcessItems** (Map) - Process each item using modern ItemProcessor and ItemSelector
6. **WaitForProcessing** (Wait) - 3-second processing delay
7. **ParallelProcessing** (Parallel) - Concurrent execution of:
   - **ProcessOrder** (Task) - Finalize order processing
   - **SendOrderEmail** (Task) - Send confirmation email
8. **OrderComplete** (Succeed) - Successful completion
9. **OrderFailed** (Fail) - Error handling endpoint

## Prerequisites

- Node.js 18+ with npm
- AWS CDK CLI (`npm install -g aws-cdk`)
- sfn-ai-local-test CLI installed globally (`npm install -g sfn-ai-local-test`)

## Setup

1. **Install dependencies:**
   ```bash
   # Install project dependencies
   npm install
   
   # Install sfn-ai-local-test globally (if not already installed)
   npm install -g sfn-ai-local-test
   ```

2. **Configure AWS credentials** (for CDK deployment, optional for testing):
   ```bash
   aws configure
   ```

3. **Extract state machine definition from CDK:**
   ```bash
   # Synth CDK stack and extract ASL JSON
   npx cdk synth
   sfn-test extract
   
   # This creates: .sfn-test/extracted/order-processing-workflow.asl.json
   ```

4. **Run local tests:**
   ```bash
   # Run the complete test suite with coverage
   sfn-test run
   
   # Expected output:
   # ✅ 3/3 tests passed (100.0% success rate)
   # 📊 Coverage: 100.0% states, 100.0% branches
   ```

## Project Structure

```
├── bin/
│   └── app.ts                           # CDK app entry point
├── lib/
│   └── order-processing-stack.ts        # Order processing state machine stack
├── sfn-test/
│   ├── mocks/
│   │   └── order-processing-workflow.mock.yaml  # Lambda function mocks
│   ├── test-suites/
│   │   └── order-processing-workflow.test.yaml  # Test cases with 100% coverage
│   └── test-data/                       # Test data (optional)
├── .sfn-test/
│   ├── coverage/                        # Coverage reports (auto-generated)
│   └── extracted/
│       └── order-processing-workflow.asl.json  # Extracted state machine
├── cdk.out/                            # CDK synth output (auto-generated)
│   └── OrderProcessingStack.template.json
├── sfn-test.config.yaml                # sfn-test configuration file
├── cdk.json                            # CDK configuration
├── package.json                        # Node.js dependencies
└── tsconfig.json                       # TypeScript configuration
```

## Test Cases and Coverage

The example includes comprehensive test cases achieving **100% state and branch coverage**:

### Test Case 1: Small Order (No Discount)
- Order total: $400
- Path: PrepareOrder → ValidateOrder → CheckOrderAmount → ProcessItems → WaitForProcessing → ParallelProcessing → OrderComplete
- Tests: Map iteration (2 items), Parallel branches, Normal flow

### Test Case 2: Large Order (With Discount)  
- Order total: $6000
- Path: PrepareOrder → ValidateOrder → CheckOrderAmount → **CalculateDiscount** → ProcessItems → WaitForProcessing → ParallelProcessing → OrderComplete
- Tests: Discount calculation branch, High-value order processing

### Test Case 3: Validation Failure
- Invalid order (empty items)
- Path: PrepareOrder → ValidateOrder → **OrderFailed**
- Tests: Error handling, Catch block execution

## Mock Configuration

The mock configuration (`sfn-test/mocks/order-processing-workflow.mock.yaml`) demonstrates:

- **Conditional Mocks**: Different responses based on order ID
- **Lambda Integration**: Proper Payload wrapping for Lambda invoke patterns
- **Error Simulation**: Validation failure scenarios
- **Realistic Data**: Order processing with actual item calculations

## Key Features Demonstrated

### 1. CDK TypeScript Integration
- State machine defined in `lib/order-processing-stack.ts`
- Full TypeScript typing with AWS CDK constructs
- Proper Lambda function ARN references
- Modern ASL syntax with ItemProcessor and ItemSelector

**Example CDK Map State (Modern Syntax):**
```typescript
const processItems = new sfn.Map(this, 'ProcessItems', {
  itemsPath: '$.items',
  maxConcurrency: 5,
  resultPath: '$.processedItems',
  // Modern ItemSelector for data transformation
  itemSelector: {
    'itemId.$': '$.itemId',
    'quantity.$': '$.quantity',
    'price.$': '$.price',
    'status': 'processed',
  },
}).itemProcessor(
  // ItemProcessor with simplified Pass state
  new sfn.Pass(this, 'ProcessItem')
);
```

**Generated ASL (Modern Syntax):**
```json
"ProcessItems": {
  "Type": "Map",
  "ItemsPath": "$.items",
  "ItemSelector": {
    "itemId.$": "$.itemId",
    "quantity.$": "$.quantity",
    "price.$": "$.price",
    "status": "processed"
  },
  "ItemProcessor": {
    "ProcessorConfig": { "Mode": "INLINE" },
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": {
        "Type": "Pass",
        "End": true
      }
    }
  },
  "MaxConcurrency": 5,
  "ResultPath": "$.processedItems"
}
```

### 2. Advanced JSONPath Usage
- Context field access (`$$.State.EnteredTime`)
- Complex parameter mapping and result paths
- ItemSelector for data transformation

### 3. Professional Test Coverage
- **100% State Coverage**: All states executed at least once
- **100% Branch Coverage**: All Choice conditions and error paths tested  
- **Map Validation**: Iteration count and path tracking with ItemProcessor/Iterator support
- **Parallel Validation**: Branch count and concurrent execution paths
- **Nested Coverage**: Full tracking of states within Map ItemProcessor and Parallel branches

## Usage

### 1. Extract State Machine from CDK

The `sfn-test extract` command automatically extracts the state machine definition from CDK:

```bash
# Synth CDK stack and extract state machine definitions
npx cdk synth
sfn-test extract

# This automatically:
# 1. Finds CloudFormation templates in cdk.out/
# 2. Extracts Step Functions state machine definitions
# 3. Saves them to .sfn-test/extracted/
# 4. Creates metadata for each state machine
```

### 2. Generate Mock and Test Files (Optional)

If starting from scratch, use automated generation:

```bash
# Generate mock configuration
sfn-test generate mock --name order-processing-workflow

# Generate test cases  
sfn-test generate test --name order-processing-workflow

# Run both commands as needed
```

### 3. Run Tests and View Coverage

```bash
# Run all configured tests
sfn-test run

# Run with verbose output
sfn-test run --verbose

# Run tests with coverage
sfn-test run --cov
```

### 4. Development Workflow

```bash
# 1. Modify CDK code in lib/
vim lib/order-processing-stack.ts

# 2. Extract updated state machine
npx cdk synth && sfn-test extract

# 3. Update tests if needed
vim sfn-test/test-suites/order-processing-workflow.test.yaml

# 4. Validate changes
sfn-test run

# 5. Deploy to AWS (optional)
npx cdk deploy
```

## Configuration Highlights

### sfn-test.config.yaml
```yaml
version: "1.0"
project:
  name: "CDK Integration Example"
  
stateMachines:
  order-processing-workflow:
    aslPath: ".sfn-test/extracted/order-processing-workflow.asl.json"
    
mocks:
  order-processing-workflow:
    path: "sfn-test/mocks/order-processing-workflow.mock.yaml"
    
testSuites:
  - path: "sfn-test/test-suites/order-processing-workflow.test.yaml"
```

### Key Configuration Features
- **Name-based References**: Use logical names instead of file paths
- **Automatic Path Resolution**: Supports both relative and absolute paths
- **Mock Auto-detection**: Automatically finds mock files for test generation
- **Coverage Tracking**: Centralized coverage reporting in `.sfn-test/coverage/`

## Best Practices Demonstrated

### 1. CDK Integration
- ✅ Type-safe state machine definitions
- ✅ Modern ASL syntax (ItemProcessor/ItemSelector instead of Iterator/Parameters)
- ✅ Proper Lambda function integration with ARN resolution  
- ✅ Standardized extraction script for CI/CD pipelines
- ✅ Clean separation of infrastructure and test code

### 2. Test Design  
- ✅ Comprehensive path coverage including error scenarios
- ✅ Realistic test data mimicking production use cases
- ✅ Mock conditions matching actual Lambda invoke patterns
- ✅ Validation of complex state behaviors (Map, Parallel, Choice)

### 3. Mock Engineering
- ✅ Conditional responses based on input variations
- ✅ Proper error simulation for negative test cases
- ✅ Lambda Payload wrapping handled correctly
- ✅ Stateless mock design for reliable test execution

### 4. Quality Assurance
- ✅ 100% state coverage ensuring all code paths tested
- ✅ 100% branch coverage including all conditional logic
- ✅ Test-driven development approach for robust implementation
- ✅ Automated coverage reporting and validation

## Benefits of This Approach

### Development Efficiency
- **🚀 Fast Local Testing**: Instant feedback without AWS deployment
- **💰 Cost Optimization**: Zero AWS execution costs during development
- **🔍 Rich Debugging**: Detailed execution logs and state transition tracking
- **⚡ TDD Workflow**: Test-driven development with immediate validation

### Quality Assurance  
- **📊 Complete Coverage**: Automated measurement of state and branch coverage
- **🎯 Automated Generation**: Comprehensive test case and mock creation
- **🔄 Regression Prevention**: Continuous validation of state machine behavior
- **📈 Coverage Metrics**: Quantitative quality assessment

### CI/CD Integration
- **🏗️ Pipeline Ready**: Easy integration into build and deployment workflows
- **📋 Standardized Testing**: Consistent test patterns across CDK projects  
- **🔐 Pre-deployment Validation**: Catch issues before AWS deployment
- **📝 Automated Reporting**: Coverage reports for code review processes

## Next Steps

1. **Extend Test Cases**: Add more complex scenarios and edge cases
2. **Integration Testing**: Combine with actual Lambda function testing
3. **Performance Testing**: Validate execution time and resource usage
4. **Production Deployment**: Use `npx cdk deploy` after local validation
5. **Monitoring Setup**: Configure AWS CloudWatch for production workflows

## Troubleshooting

### Common Issues

**CDK Synth Fails**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify CDK bootstrap
npx cdk bootstrap
```

**Template Parsing Errors**  
```bash
# Check CloudFormation templates are generated correctly
ls -la cdk.out/*.template.json

# Re-synthesize CDK
npx cdk synth
```

**Test Failures**
```bash
# Run with verbose logging
sfn-test run --verbose

# Check mock conditions match actual inputs
cat .sfn-test/coverage/execution-*.json
```

**Coverage Issues**
```bash
# Run tests with coverage to see details
sfn-test run --cov

# Update test cases to cover missing branches
vim sfn-test/test-suites/order-processing-workflow.test.yaml
```