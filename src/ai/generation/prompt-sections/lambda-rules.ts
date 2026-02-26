/**
 * Lambda integration rules for mock generation
 */

import { HTTP_STATUS_OK } from '../../../constants/defaults'

export function getLambdaIntegrationRules(): string {
  return `## Lambda Integration Rules

### 🚨 CRITICAL: Lambda Task Mock Patterns

AWS Step Functions has TWO Lambda integration patterns:

#### 1. OPTIMIZED INTEGRATION (arn:aws:states:::lambda:invoke) - MOST COMMON
**Parameters.Payload mapping rule for conditional mocks:**
- If the state has Parameters.Payload, the mock condition MUST use input.Payload

**Example ASL with Parameters.Payload:**
\`\`\`json
"Parameters": {
  "Payload.$": "$.data"
}
\`\`\`

**Corresponding conditional mock structure:**
\`\`\`yaml
- state: "LambdaTaskName"
  type: "conditional"
  conditions:
    - when:
        input:              # REQUIRED wrapper
          Payload:          # REQUIRED for Lambda input matching
            userId: "123"   # Your condition fields
      response:
        ExecutedVersion: "$LATEST"
        Payload:            # REQUIRED for Lambda response
          result: "success"
        StatusCode: ${HTTP_STATUS_OK}
    - default:
        ExecutedVersion: "$LATEST"
        Payload:
          result: "default"
        StatusCode: ${HTTP_STATUS_OK}
\`\`\`

#### 2. DIRECT ARN (arn:aws:lambda:region:account:function:name) - RARE
- No Payload wrapper needed for input or output
- Direct mock structure without Payload field

### ⚠️ COMMON MISTAKES TO AVOID

❌ **WRONG** (missing Payload wrapper for optimized integration):
\`\`\`yaml
- state: "GetUser"
  type: "conditional"
  conditions:
    - when:
        input:          # Missing Payload!
          userId: "123"
      response:         # Missing Payload wrapper!
        name: "John"
\`\`\`

✅ **CORRECT** (with Payload wrapper for optimized integration):
\`\`\`yaml
- state: "GetUser"
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:      # Required!
            userId: "123"
      response:
        Payload:        # Required!
          name: "John"
        StatusCode: ${HTTP_STATUS_OK}
        ExecutedVersion: "$LATEST"
\`\`\`

### Lambda Mock Response Format
- Response MUST include: { Payload: {...}, StatusCode: ${HTTP_STATUS_OK}, ExecutedVersion: "$LATEST" }
- The actual Lambda response goes in the Payload field
- StatusCode should typically be ${HTTP_STATUS_OK} for success
- Include ExecutedVersion for completeness`
}
