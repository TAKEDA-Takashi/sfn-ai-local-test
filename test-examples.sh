#!/bin/bash

# Examples Test Runner Script
# This script runs all example test suites and reports results

set -e

# Get the script directory dynamically
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
EXAMPLES_DIR="$SCRIPT_DIR/examples"

# Check if examples directory exists
if [ ! -d "$EXAMPLES_DIR" ]; then
  echo "Error: Examples directory not found at $EXAMPLES_DIR"
  echo "Please run this script from the project root directory."
  exit 1
fi

echo "==================================="
echo "   Running All Example Tests"
echo "==================================="
echo "Examples directory: $EXAMPLES_DIR"
echo

PASSED=0
FAILED=0

# List of example directories to test
EXAMPLES=(
  "01-simple"
  "02-choice"
  "03-parallel"
  "04-map"
  "05-distributed-map"
  "06-error-handling"
  "07-variables"
  "08-jsonata"
  "09-cdk-integration"
)

# Test each example
for example in "${EXAMPLES[@]}"; do
  echo "-----------------------------------"
  echo "Testing: $example"
  echo "-----------------------------------"
  
  cd "$EXAMPLES_DIR/$example"
  
  # Determine the test approach:
  # 1. If sfn-test.config.yaml exists, use auto-discovery (run without arguments)
  # 2. Otherwise, use test-suite.yaml with --suite option
  if [ -f "sfn-test.config.yaml" ]; then
    # Config file exists - auto-discovers test suites
    echo "Using sfn-test.config.yaml for test discovery"
    # For config-based runs, check for "Failed: 0" in Overall Results
    npx sfn-test run 2>&1 > /tmp/test-output.txt
    if grep -q "❌ Failed: 0" /tmp/test-output.txt || grep -q "All tests passed" /tmp/test-output.txt; then
      echo "✅ $example: PASSED"
      ((PASSED++))
    else
      echo "❌ $example: FAILED"
      ((FAILED++))
      echo "--- Test Output ---"
      cat /tmp/test-output.txt
      echo "--- End of Output ---"
    fi
  elif [ -f "test-suite.yaml" ]; then
    # Direct test suite file
    echo "Using test-suite.yaml"
    npx sfn-test run --suite test-suite.yaml 2>&1 > /tmp/test-output.txt
    if grep -q "All tests passed" /tmp/test-output.txt; then
      echo "✅ $example: PASSED"
      ((PASSED++))
    else
      echo "❌ $example: FAILED"
      ((FAILED++))
      echo "--- Test Output ---"
      cat /tmp/test-output.txt
      echo "--- End of Output ---"
    fi
  else
    echo "⚠️  $example: No test configuration found"
  fi
  echo
done

echo "==================================="
echo "        Test Results Summary"
echo "==================================="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "-----------------------------------"

if [ $FAILED -eq 0 ]; then
  echo "🎉 All example tests passed successfully!"
  exit 0
else
  echo "💥 Some tests failed. Please review the output above."
  exit 1
fi