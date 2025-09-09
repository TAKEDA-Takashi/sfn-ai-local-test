# sfn-ai-local-test Examples

Step Functions Local Testing Tool examples. Learn AWS Step Functions testing from basic patterns to advanced implementations through progressive examples.

## 📚 Tutorial Examples (Recommended Learning Order)

### [01-simple](./01-simple/): Basic Workflow
- **Learning**: Task, Pass, Succeed state fundamentals
- **Features**: Lambda integration, ResultSelector, ResultPath
- **Testing**: Basic input/output validation, execution path verification

### [02-choice](./02-choice/): Conditional Branching
- **Learning**: Choice state for conditional processing
- **Features**: Compound conditions (And), default handling, boundary testing
- **Testing**: Complete branch path coverage

### [03-parallel](./03-parallel/): Parallel Processing
- **Learning**: Parallel state for concurrent execution
- **Features**: Branch processing, result aggregation, complex data flow
- **Testing**: Parallel execution validation, branch path verification

### [04-map](./04-map/): Iterative Processing
- **Learning**: Map state for array processing
- **Features**: ItemProcessor, MaxConcurrency, validation patterns
- **Testing**: Array processing, mixed validation scenarios

### [05-distributed-map](./05-distributed-map/): Large-Scale Distributed Processing
- **Learning**: Distributed Map for massive datasets
- **Features**: ItemReader, ItemBatcher, ResultWriter, fault tolerance
- **Testing**: Large-scale processing scenarios, batch validation

## 🔧 Advanced Examples

### [06-error-handling](./06-error-handling/): Error Management
- **Learning**: Retry, Catch, error recovery patterns
- **Features**: Transaction processing with error scenarios
- **Testing**: Error handling validation

### [07-variables](./07-variables/): Variable Management
- **Learning**: Variable definition and usage, scope management
- **Features**: Assign, Variables, reference patterns
- **Testing**: Variable scope validation

### [08-jsonata](./08-jsonata/): JSONata Expression Language
- **Learning**: JSONata syntax, complex data transformations
- **Features**: Advanced query expressions, data manipulation
- **Testing**: Expression evaluation testing

## 🏗️ Integration Examples

### [09-cdk-integration](./09-cdk-integration/): CDK Integration
- **Learning**: Testing AWS CDK-defined state machines locally
- **Features**: CDK auto-extraction, ItemProcessor/ItemSelector, 100% coverage
- **Testing**: Order processing workflow with complete validation

## 🚀 Quick Start

### 1. Run Individual Examples
```bash
# Navigate to any example directory
cd examples/01-simple

# Run the test suite
sfn-test run --suite ./test-suite.yaml
```

### 2. Global Installation (Optional)
```bash
# Install globally
npm install -g sfn-ai-local-test

# Run from any example directory
sfn-test run --suite ./test-suite.yaml
```

## 📖 Learning Path

### 🟢 Beginner Path
Start here if you're new to Step Functions or testing:
1. [01-simple](./01-simple/) - Understanding basic states
2. [02-choice](./02-choice/) - Learning conditional logic
3. [03-parallel](./03-parallel/) - Grasping concurrent execution

### 🟡 Intermediate Path
For those comfortable with Step Functions basics:
1. [04-map](./04-map/) - Processing arrays and iterations
2. [05-distributed-map](./05-distributed-map/) - Large-scale distributed processing
3. [06-error-handling](./06-error-handling/) - Managing failures gracefully

### 🔴 Advanced Path
For experienced developers building production systems:
1. [07-variables](./07-variables/) - Variables and scope management
2. [08-jsonata](./08-jsonata/) - Advanced data transformation
3. [09-cdk-integration](./09-cdk-integration/) - Infrastructure as Code integration
4. Custom mock engine development
5. Complex workflow patterns

## 📄 Documentation

For detailed technical information, please refer to:

- [🔧 Mock Configuration Guide](../docs/mock-guide.md) - Detailed mock types and usage
- [💡 Best Practices](../docs/best-practices.md) - Effective test design and implementation patterns
- [🐛 Troubleshooting](../docs/troubleshooting.md) - Common issues and solutions
- [📊 Test Case Guide](../docs/test-case-guide.md) - How to create test suites
