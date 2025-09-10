# sfn-ai-local-test

> AI-powered local testing tool for AWS Step Functions

A powerful tool for locally executing and testing AWS Step Functions state machines.

## ✨ Key Features

- 🚀 **Fast Execution**: TypeScript-based state machine interpreter
- 🤖 **AI Support**: Automatic mock/test case generation via Claude API
- 🧪 **Comprehensive Testing**: YAML-based regression test suites
- 📊 **Coverage Measurement**: Automatic execution path coverage calculation and visualization
- 🔄 **Full Support**: Both JSONPath and JSONata support, all state types supported
- 🏗️ **CDK Integration**: Automatic ASL extraction from CDK output

## 📦 Installation

```bash
npm install -g sfn-test
```

## 🚀 Quick Start

1. **Initialize Project**
   ```bash
   # Set Claude API key
   export ANTHROPIC_API_KEY="your-api-key"
   
   # Initialize project
   sfn-test init
   ```

2. **Extract ASL from CDK** (for CDK projects)
   ```bash
   sfn-test extract
   ```

3. **Generate Mocks and Tests** (AI-assisted)
   ```bash
   sfn-test generate mock --name my-workflow
   sfn-test generate test --name my-workflow
   ```

4. **Run Tests**
   ```bash
   # Run all tests
   sfn-test run
   
   # Run with coverage
   sfn-test run --cov
   ```

## 🛠️ Basic Commands

| Command | Description |
|---------|-------------|
| `sfn-test init` | Initialize project (interactive) |
| `sfn-test extract` | Extract ASL definitions from CDK/CloudFormation |
| `sfn-test extract --cdk <path>` | Extract from specific CDK synth output |
| `sfn-test extract --cdk-out <dir>` | Extract from CDK output directory |
| `sfn-test generate mock --name <name>` | Generate mock configuration with AI |
| `sfn-test generate mock --max-attempts 3` | Generate mock with retry count |
| `sfn-test generate test --name <name>` | Generate test cases with AI |
| `sfn-test generate test --max-attempts 3` | Generate test with retry count |
| `sfn-test run` | Run all test suites |
| `sfn-test run --name <name>` | Run single state machine |
| `sfn-test run --suite <path>` | Run specific test suite file |
| `sfn-test run --cov` | Run with coverage measurement |

## 📚 Documentation

### 📖 Detailed Guides
- **[Quick Start Guide](./docs/quick-start-guide.md)** - From installation to execution
- **[Testing Guide](./docs/testing-guide.md)** - Detailed test creation methods
- **[Configuration Reference](./docs/configuration-reference.md)** - Complete configuration options
- **[Troubleshooting](./docs/troubleshooting.md)** - Problem solving guide

### 🔧 Examples and Samples
- **[Simple Example](./examples/01-simple/)** - Simple workflow and tests
- **[Choice Branching](./examples/02-choice/)** - Conditional branching and tests
- **[Parallel Processing](./examples/03-parallel/)** - Using Parallel states
- **[Map Processing](./examples/04-map/)** - Array data batch processing
- **[Distributed Map](./examples/05-distributed-map/)** - Large-scale data processing
- **[Error Handling](./examples/06-error-handling/)** - Retry and catch processing
- **[Variables and Scope](./examples/07-variables/)** - Variable passing and scope management
- **[JSONata Usage](./examples/08-jsonata/)** - JSONata expression language usage
- **[CDK Integration](./examples/09-cdk-integration/)** - Usage in CDK projects

## ⚙️ For Developers

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Quality check
npm run check

# Run tests
npm test
```

## 🔍 Supported Features

### ✅ Supported State Types
- **Task** - Lambda integration with optimized patterns
- **Choice** - Conditional branching
- **Wait** - Wait processing
- **Succeed/Fail** - Terminal states
- **Pass** - Data transformation
- **Parallel** - Parallel processing
- **Map** - Array processing
- **Distributed Map** - Large-scale data processing (ItemReader/ItemBatcher/ResultWriter support)
- **Retry/Catch** - Error handling

### 🎯 Main Features
- **JSONPath/JSONata Support** - Full support for expression languages
- **Mock Configuration** - Fixed values, conditional branching, stateful, error simulation
- **External Data Integration** - Data loading from JSON/CSV/JSONL/YAML files
- **Execution Path Validation** - Complex branch path validation
- **Coverage Measurement** - Automatic execution path coverage calculation
- **Report Output** - Console/JSON/JUnit format result output

### 🤖 AI Generation Features

#### Automatic Timeout Adjustment
Automatically analyzes state machine complexity and sets appropriate timeout values.

**Calculation Logic**:
```
Base time: 60s + (state count × 2s)
Complexity factors:
  - Map states: × 1.5 (up to 3 compounded)
  - DistributedMap states: × 2.0 (up to 2 compounded)
  - Parallel states: × 1.3 (up to 3 compounded)
  - JSONata usage: × 1.3
  - Variables usage: × 1.2
  - Deep nesting (4+ levels): × 1.5
Maximum: 10 minutes
```

#### Retry Feature (GenerationRetryManager)
AI-generated content is automatically validated and regenerated with progressive feedback if issues are found.

- **1st failure**: Concise and friendly suggestions
- **2nd failure**: More detailed and emphasized suggestions
- **3rd+ failures**: Strict mode with all errors shown in detail

```bash
# Default: up to 2 attempts
sfn-test generate mock --asl ./state-machine.json

# Change maximum attempts
sfn-test generate mock --asl ./state-machine.json --max-attempts 3

# Manual timeout specification (disables auto-calculation)
sfn-test generate mock --asl ./state-machine.json --timeout 600000
```

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📞 Support

- **[Issues](https://github.com/TAKEDA-Takashi/sfn-ai-local-test/issues)** - Bug reports and feature requests
- **[Discussions](https://github.com/TAKEDA-Takashi/sfn-ai-local-test/discussions)** - Questions and discussions

## 📄 License

MIT

---

*Initial release v1.0.0*