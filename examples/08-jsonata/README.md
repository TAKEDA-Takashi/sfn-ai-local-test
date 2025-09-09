# JSONata Example - Order Processing Workflow

[日本語版はこちら](README_ja.md) | [English](#jsonata-example---order-processing-workflow)

This example demonstrates comprehensive **JSONata query language** support in AWS Step Functions, showcasing advanced data transformation and processing capabilities with **optimized mock generation** through data flow analysis.

## Overview

An e-commerce order processing workflow that demonstrates:
- **Variable Assignment** (`Assign` field) - Store calculated values
- **Data Transformation** (`Arguments` field) - Complex input transformations  
- **Output Shaping** (`Output` field) - Format results with JSONata
- **Conditional Logic** (`Condition` field) - JSONata-based choices
- **Advanced Functions** - UUID generation, hashing, date/time manipulation

## Workflow Architecture

```
CalculateOrderTotal (Pass + Assign)
    ├─ Calculate total price
    ├─ Count items
    └─ Store variables
           ↓
ProcessOrder (Task + Arguments)
    ├─ Generate order ID
    ├─ Transform item data
    └─ Add metadata
           ↓
CheckOrderValue (Choice + Condition)
    ├─ > $1000 → ProcessHighValueOrder
    ├─ > $100  → ProcessStandardOrder
    └─ default → ProcessLowValueOrder
           ↓
FormatFinalOutput (Pass + Output)
    └─ Generate comprehensive report
```

## Key JSONata Features Demonstrated

### 1. Variable Assignment (Assign field)
```json
"Assign": {
  "orderTotal": "{% $sum($states.input.items.price * $states.input.items.quantity) %}",
  "itemCount": "{% $count($states.input.items) %}",
  "customerFullName": "{% $states.input.customer.firstName & ' ' & $states.input.customer.lastName %}"
}
```
Variables are accessible in subsequent states using `$variableName`.

### 2. Complex Data Transformation (Arguments field)
```json
"items": "{% $states.input.items ~> |$|{
  'productId': $.id,
  'productName': $.name,
  'unitPrice': $.price,
  'quantity': $.quantity,
  'subtotal': $.price * $.quantity
}| %}"
```
The `~>` operator with pipeline `|...|` enables powerful transformations.

### 3. Conditional Branching (Condition field)
```json
"Choices": [
  {
    "Condition": "{% $states.input.orderTotal > 1000 %}",
    "Next": "ProcessHighValueOrder"
  }
]
```
Note: In JSONata mode, use `Condition` instead of `Variable` field.

### 4. JSONata Functions Catalog

| Category | Functions | Example |
|----------|-----------|---------|
| **Aggregation** | `$sum()`, `$count()`, `$average()` | `$sum(items.price)` |
| **String** | `&`, `$substring()`, `$uppercase()` | `firstName & ' ' & lastName` |
| **Math** | `$round()`, `$floor()`, `$ceil()` | `$round(price * 0.9, 2)` |
| **Date/Time** | `$now()`, `$millis()`, `$fromMillis()` | `$fromMillis($millis() + 86400000)` |
| **Utility** | `$uuid()`, `$hash()`, `$merge()` | `$hash(customerId & $now())` |
| **Transform** | `~>`, `$map()`, `$filter()` | `items ~> |$|{...}|` |

## Running the Example

```bash
# Run with optimized test suite (recommended)
npx sfn-test run --suite test-suite.yaml

# Run with custom input
npx sfn-test run --asl workflow.asl.json --input '{"customer":{"id":"test","firstName":"John","lastName":"Doe"},"items":[{"id":"1","name":"Test","price":1200,"quantity":1}],"source":"web"}'
```

## Optimized Mock Design

This example demonstrates an optimized 14-line mock configuration based on data flow analysis:

### Design Features

- **Simple Fixed Response**: Only 14 lines provide complete functionality
- **Data Flow Optimized**: Analyzes task output usage patterns to achieve minimal complexity  
- **100% Coverage**: All test cases pass with complete workflow coverage

## Input/Output Examples

### Sample Input
```json
{
  "customer": {
    "id": "CUST-12345",
    "firstName": "John",
    "lastName": "Doe"
  },
  "items": [
    {
      "id": "PROD-001",
      "name": "Laptop",
      "price": 1200.00,
      "quantity": 1
    },
    {
      "id": "PROD-002",
      "name": "Mouse",
      "price": 25.00,
      "quantity": 2
    }
  ],
  "source": "web"
}
```

### Expected Output Structure
```json
{
  "summary": {
    "orderId": "uuid-here",
    "customerName": "John Doe",
    "orderStatus": "high-value",
    "originalAmount": 1250.00,
    "finalAmount": 1062.50,
    "savings": 187.50
  },
  "benefits": ["free-shipping", "priority-support"],
  "delivery": {
    "estimatedDate": "2024-01-15",
    "trackingId": "A1B2C3D4"
  }
}
```

## AWS Compliance Notes

✅ **Pass State**: Supports `Output` and `Assign` but NOT `Arguments`  
✅ **Task State**: Supports both `Arguments` and `Output`  
✅ **Choice State**: Uses `Condition` field (not `Variable`) in JSONata mode  
✅ **Error Handling**: JSONata errors produce `States.QueryEvaluationError`  
✅ **Expression Syntax**: All JSONata wrapped in `{% ... %}` delimiters

## Files Overview

- **`workflow.asl.json`** - JSONata-enabled Step Functions workflow definition
- **`test-suite.yaml`** - Comprehensive test cases achieving 100% coverage
- **`mock.yaml`** - Optimized mock configuration (14 lines)
- **`USAGE.md`** - Quick start guide
- **`README_ja.md`** - Japanese documentation

## Best Practices

1. **Use Variables**: Store calculated values once with `Assign` to avoid recalculation
2. **Type Safety**: Use explicit conversion functions like `$number()` and `$string()`
3. **Error Handling**: Add Catch blocks for `States.QueryEvaluationError`
4. **Testing**: Validate JSONata expressions with AWS Step Functions test-state API
5. **Performance**: Complex transformations are more efficient than multiple states
6. **Mock Optimization**: Use data flow analysis to determine minimal required complexity

## Quick Start

For immediate testing:
```bash
npx sfn-test run --suite test-suite.yaml
```

This example provides a comprehensive template for using JSONata in production Step Functions workflows with best practices for mock optimization and demonstrates how data flow analysis can dramatically improve AI-generated code quality.