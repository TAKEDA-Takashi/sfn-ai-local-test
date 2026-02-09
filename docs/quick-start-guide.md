# Quick Start Guide

This guide explains the basic workflow from installing sfn-ai-local-test to running tests.

## Installation

```bash
# Global installation (recommended)
pnpm add -g sfn-ai-local-test

# Or, install locally to project
pnpm add -D sfn-ai-local-test
```

## Environment Setup

To use AI features (automatic mock/test generation), configure one of the following:

### Option 1: Claude Code (Recommended)
When running in a Claude Code environment, authentication is handled automatically with no additional setup required.

### Option 2: Claude API Key
In environments other than Claude Code, set up an API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

> Note: Claude Code is automatically prioritized when available.

## Pattern 1: Using Configuration Files (Recommended)

This is convenient for managing multiple state machines or using with CDK projects.

### 1. Project Initialization

```bash
sfn-test init
```

This creates the following structure:
```
./
├── sfn-test.config.yaml      # Project configuration file
├── sfn-test/
│   ├── mocks/                # Place mock definitions here
│   ├── test-suites/          # Place test suites here
│   └── test-data/            # Place test data here
└── .sfn-test/                # Auto-generated working directory
    ├── extracted/            # ASL extracted from CDK
    └── coverage/             # Coverage reports
```

### 2. Register State Machines

Edit `sfn-test.config.yaml` to register state machines:

```yaml
version: "1.0"
stateMachines:
  # Extract from CDK
  - name: order-processing
    source:
      type: cdk
      path: ./cdk.out/MyStack.template.json
      stateMachineName: OrderProcessingStateMachine
  
  # Specify ASL file directly
  - name: payment-workflow
    source:
      type: file
      path: ./state-machines/payment.asl.json
```

### 3. Extract ASL from CDK (CDK users only)

```bash
# Build CDK
npx cdk synth

# Extract ASL (using configuration file)
sfn-test extract

# Extract from specific CDK output
sfn-test extract --cdk cdk.out/MyStack.template.json

# Extract from CDK output directory
sfn-test extract --cdk-out cdk.out

# Extract specific state machine by logical ID
sfn-test extract --cdk-out cdk.out --cdk-state-machine MyStateMachine

# Extract to custom output directory
sfn-test extract --output ./custom/extracted
```

Extracted ASL files are saved to `.sfn-test/extracted/` by default.

### 4. Generate Mocks

```bash
# Auto-generate mocks with AI assistance
sfn-test generate mock --name order-processing

# To create manually, place YAML files in sfn-test/mocks/
```

Generated mocks are saved to `sfn-test/mocks/order-processing.mock.yaml`.

### 5. Generate Test Suites

```bash
# Auto-generate test suites with AI assistance
sfn-test generate test --name order-processing

# To create manually, place YAML files in sfn-test/test-suites/
```

Generated tests are saved to `sfn-test/test-suites/order-processing.test.yaml`.

### 6. Run Tests

```bash
# Run all test suites
sfn-test run

# Run tests for a specific state machine only
sfn-test run --name order-processing

# Run with verbose output
sfn-test run --verbose
```

## Pattern 2: Usage Without Configuration Files

This is convenient for testing a single state machine or quick experimentation.

### 1. Prepare ASL File

Prepare a state machine definition (ASL) file:
```
./state-machine.asl.json
```

### 2. Generate Mocks

```bash
# Auto-generate mocks with AI assistance
sfn-test generate mock --asl ./state-machine.asl.json -o ./mock.yaml

# Creating mock.yaml manually is also possible
```

### 3. Generate Test Suites

```bash
# Auto-generate test suites with AI assistance
sfn-test generate test --asl ./state-machine.asl.json \
  --mock ./mock.yaml \
  -o ./test-suite.yaml

# Creating test-suite.yaml manually is also possible
```

### 4. Run Tests

```bash
# Run by specifying test suite
sfn-test run --suite ./test-suite.yaml

# Run by directly specifying ASL and mock (for one-off tests)
sfn-test run --asl ./state-machine.asl.json \
  --mock ./mock.yaml \
  --input '{"orderId": "test-001"}'
```

## Checking Results

### Test Results

```bash
✓ order-processing-workflow
  ✓ Test successful order (23ms)
  ✓ Test payment failure (15ms)
  ✓ Test inventory shortage (18ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Time:        0.056s
```

### Coverage Reports

```bash
# Display coverage after test execution
sfn-test run --name order-processing --cov

# Output in JSON format
sfn-test run --name order-processing --cov json

# Without configuration files
sfn-test run --suite ./test-suite.yaml --cov
```

Coverage reports are saved to `.sfn-test/coverage/`.

## Directory Structure Summary

### With Configuration Files (Pattern 1)
```
project-root/
├── sfn-test.config.yaml           # Project configuration
├── sfn-test/
│   ├── mocks/                     # Mock definitions
│   │   └── order-processing.mock.yaml
│   ├── test-suites/               # Test suites
│   │   └── order-processing.test.yaml
│   └── test-data/                 # Test data
│       └── sample-order.json
├── .sfn-test/                     # Auto-generated (recommended for .gitignore)
│   ├── extracted/                 # ASL extracted from CDK
│   │   └── order-processing.asl.json
│   └── coverage/                  # Coverage reports
│       └── coverage-summary.json
└── cdk.out/                       # CDK output (when using CDK)
    └── MyStack.template.json
```

### Without Configuration Files (Pattern 2)
```
project-root/
├── state-machine.asl.json         # State machine definition
├── mock.yaml                      # Mock definition
├── test-suite.yaml                # Test suite
└── .sfn-test/                     # Auto-generated
    └── coverage/                  # Coverage reports
```
