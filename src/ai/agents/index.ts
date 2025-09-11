import { Anthropic } from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import { HTTP_STATUS_OK, LAMBDA_VERSION_LATEST } from '../../constants/defaults'
// import { analyzeExpressions } from '../utils/expression-analyzer'
// import { DataFlowTracker } from '../utils/data-flow-tracker'
// import { MockFormatSelector } from '../utils/mock-format-selector'
// import { ConsistencyChecker } from '../utils/consistency-checker'
import type { JsonObject, StateMachine } from '../../types/asl'
// Inline type check
import {
  generateMockWithClaudeCLI,
  generateTestWithClaudeCLI,
  isClaudeCLIAvailable,
} from './claude-cli'

dotenv.config()

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  : null

export async function generateMockWithAI(
  stateMachine: StateMachine,
  model: string,
  timeout: number = 300000,
  maxAttempts: number = 2,
): Promise<string> {
  // Claude CLI\u304c\u5229\u7528\u53ef\u80fd\u306a\u5834\u5408\u306f\u512a\u5148\u4f7f\u7528
  if (await isClaudeCLIAvailable()) {
    console.log('Using Claude CLI (Claude Code authentication)...')
    return generateMockWithClaudeCLI(stateMachine, timeout, undefined, maxAttempts)
  }

  // API\u30ad\u30fc\u304c\u3042\u308b\u5834\u5408\u306fAPI\u3092\u4f7f\u7528
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }
  // Analyze state machine features for intelligent mock generation
  const features = analyzeStateMachineFeatures(stateMachine)

  const prompt = `
You are an expert in AWS Step Functions. Generate a comprehensive mock configuration file in YAML format.

🚨 CRITICAL: Lambda Integration Rules (READ THIS FIRST) 🚨
===============================================================
AWS Step Functions has TWO Lambda integration patterns. You MUST identify which one is used:

1. ✅ OPTIMIZED INTEGRATION (arn:aws:states:::lambda:invoke) - MOST COMMON (99% of cases)
   
   MAPPING RULE: If the state has Parameters.Payload, the mock MUST use input.Payload:
   
   State Machine:                    Mock Condition:
   "Parameters": {                   when:
     "Payload": {           →           input:
       "userId.$": "$.userId"             Payload:  # <-- REQUIRED!
     }                                      userId: "test-user"
   }
   
   - Conditional mock input: { input: { Payload: {...} } }
   - Mock response: { Payload: {...}, StatusCode: ${HTTP_STATUS_OK}, ExecutedVersion: "${LAMBDA_VERSION_LATEST}" }

2. ⚠️ DIRECT ARN (arn:aws:lambda:region:account:function:name) - RARE
   - Conditional mock input: { input: {...} }  (no Payload wrapper)
   - Mock response: {...}  (no Payload wrapper)

${
  features.variables
    ? `IMPORTANT: This state machine uses Variables/Assign fields:
${features.variableDetails}
Ensure mocks support testing variable flow and accumulation.
`
    : ''
}

State Machine Definition:
${JSON.stringify(stateMachine, null, 2)}

${
  features.variables
    ? `
Variables Testing Requirements:
1. Create mocks that allow testing variable initialization in Assign fields
2. Support testing variable updates (e.g., counters, accumulations)
3. Enable testing of variable references using $variableName syntax
4. Mock responses should work with variable calculations
5. Variables in JSONPath: $variableName, States.MathAdd($var, 1)
6. Variables in JSONata: $variableName, {% $variableName + 1 %}
`
    : ''
}

📋 COMPLETE Lambda Mock Examples (COPY THESE PATTERNS):
===============================================================

Example 1: Fixed Mock for Lambda (OPTIMIZED integration):
---------------------------------------------------------
  - state: "GetUserInfo"
    type: "fixed"
    response:
      ExecutedVersion: "${LAMBDA_VERSION_LATEST}"
      Payload:  # ← REQUIRED for arn:aws:states:::lambda:invoke
        userId: "user123"
        name: "John Doe"
        status: "active"
      StatusCode: ${HTTP_STATUS_OK}

Example 2: Conditional Mock for Lambda (OPTIMIZED integration):
---------------------------------------------------------------
  - state: "ProcessOrder"
    type: "conditional"
    conditions:
      - when:
          input:  # ← ALWAYS use 'input' wrapper
            Payload:  # ← REQUIRED for Lambda input matching
              orderType: "premium"
              amount: 1000
        response:
          ExecutedVersion: "${LAMBDA_VERSION_LATEST}"
          Payload:  # ← REQUIRED for Lambda response
            processed: true
            discount: 0.2
            message: "Premium order processed"
          StatusCode: ${HTTP_STATUS_OK}
      - when:
          input:
            Payload:  # ← Another condition with Payload
              orderType: "standard"
        response:
          ExecutedVersion: "${LAMBDA_VERSION_LATEST}"
          Payload:
            processed: true
            discount: 0.1
            message: "Standard order processed"
          StatusCode: ${HTTP_STATUS_OK}
      - default:
        response:
          ExecutedVersion: "${LAMBDA_VERSION_LATEST}"
          Payload:
            processed: false
            error: "Unknown order type"
          StatusCode: ${HTTP_STATUS_OK}

Example 3: Stateful Mock for Lambda (retry scenarios):
-------------------------------------------------------
  - state: "RetryableTask"
    type: "stateful"
    responses:
      - # First call fails
        FunctionError: "Unhandled"
        Payload:
          errorType: "TemporaryError"
          errorMessage: "Service temporarily unavailable"
        StatusCode: 500
      - # Second call succeeds
        ExecutedVersion: "${LAMBDA_VERSION_LATEST}"
        Payload:
          success: true
          data: "Processed after retry"
        StatusCode: ${HTTP_STATUS_OK}

Example 4: Direct ARN Mock (ONLY if using direct Lambda ARN):
-------------------------------------------------------------
  - state: "DirectLambdaCall"
    type: "fixed"
    response:  # ← NO Payload wrapper for direct ARN
      result: "direct response"
      value: 42

⚠️ COMMON MISTAKES TO AVOID:
===============================================================
❌ WRONG (missing Payload wrapper for Lambda):
  - state: "GetUser"
    type: "conditional"
    conditions:
      - when:
          input:  # ← Missing Payload!
            userId: "123"
        response:  # ← Missing Payload!
          name: "John"

✅ CORRECT (with Payload wrapper for Lambda):
  - state: "GetUser"
    type: "conditional"
    conditions:
      - when:
          input:
            Payload:  # ← Required!
              userId: "123"
        response:
          Payload:  # ← Required!
            name: "John"
          StatusCode: ${HTTP_STATUS_OK}
          ExecutedVersion: "${LAMBDA_VERSION_LATEST}"

Generate a mock configuration that:
1. Covers all Task states with realistic mock responses using CORRECT Lambda integration format
2. For optimized Lambda integration (arn:aws:states:::lambda:invoke):
   - Wrap responses in Payload field
   - For conditional mocks, wrap the 'when' conditions in Payload field too
3. For direct Lambda ARN, use unwrapped format
4. Includes conditional mocks with proper input structure matching
5. Adds stateful mocks for states that might be called multiple times
6. Includes error scenarios with proper FunctionError field for Lambda errors
7. Consider ResultSelector, ResultPath, and OutputPath in the ASL when formatting responses
8. For Map states, ensure ItemsPath is considered when mocking the data source

Return ONLY the YAML content without any markdown formatting or explanations.
`

  const response = await anthropic.messages.create({
    model: model || 'claude-3-sonnet-20240229',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content && content.type === 'text') {
    return content.text.trim()
  }

  throw new Error('Unexpected response from AI')
}

function analyzeStateMachineFeatures(stateMachine: StateMachine): JsonObject {
  const features: JsonObject = {
    variables: false,
    variableDetails: '',
    hasChoice: false,
    hasMap: false,
    hasParallel: false,
    hasDistributedMap: false,
    errorHandling: false,
  }

  const variableStates: string[] = []
  const variableNames = new Set<string>()

  for (const [stateName, state] of Object.entries(stateMachine.States || {})) {
    // Check for Variables/Assign
    if ('Assign' in state && state.Assign) {
      features.variables = true
      variableStates.push(stateName)
      Object.keys(state.Assign).forEach((key) => {
        const cleanKey = key.replace(/\.\$?$/, '')
        variableNames.add(cleanKey)
      })
    }

    // Check state types using type guards
    if (state.isChoice()) features.hasChoice = true
    if (state.isMap()) {
      if (state.isDistributedMap()) {
        features.hasDistributedMap = true
      } else {
        features.hasMap = true
      }
    }
    if (state.isParallel()) features.hasParallel = true

    // Check error handling
    if (('Retry' in state && state.Retry) || ('Catch' in state && state.Catch))
      features.errorHandling = true
  }

  if (features.variables) {
    features.variableDetails = `- States with Assign: ${variableStates.join(', ')}
- Variables defined: ${Array.from(variableNames).join(', ')}`
  }

  return features
}

export async function generateTestWithAI(
  stateMachine: StateMachine,
  model: string,
  timeout: number = 300000,
  mockContent?: string,
  mockPath?: string,
  aslPath?: string,
  outputPath?: string,
): Promise<string> {
  // Claude CLI\u304c\u5229\u7528\u53ef\u80fd\u306a\u5834\u5408\u306f\u512a\u5148\u4f7f\u7528
  if (await isClaudeCLIAvailable()) {
    console.log('Using Claude CLI (Claude Code authentication)...')
    return await generateTestWithClaudeCLI(
      stateMachine,
      timeout,
      mockContent,
      mockPath,
      aslPath,
      outputPath,
    )
  }

  // API\u30ad\u30fc\u304c\u3042\u308b\u5834\u5408\u306fAPI\u3092\u4f7f\u7528
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }
  // Analyze state machine features for intelligent test generation
  const features = analyzeStateMachineFeatures(stateMachine)

  const prompt = `
You are an expert in AWS Step Functions testing. Generate comprehensive test cases in YAML format.

${
  features.variables
    ? `CRITICAL: This state machine uses Variables/Assign fields:
${features.variableDetails}

You MUST include stateExpectations to test variable values at each state.
`
    : ''
}

State Machine Definition:
${JSON.stringify(stateMachine, null, 2)}

${
  features.variables
    ? `
Variables Testing Requirements:
1. Include stateExpectations section in EVERY test case
2. Test variable initialization values after Assign
3. Test variable updates and calculations
4. Verify $variableName references work correctly (NOT $$.Variables)
5. Test variable persistence across states
6. Variables are referenced as $variableName in JSONPath
7. Calculations use States.MathAdd($var, 1) or JSONata {% $var + 1 %}

Example stateExpectations format:
stateExpectations:
  - state: "StateName"
    variables:
      variableName: expectedValue
      counter: 1
      status: "initialized"
`
    : ''
}

Generate test cases that:
1. Cover all possible execution paths
2. Test edge cases and error conditions
3. Validate state transitions
4. Check input/output transformations

Return the test cases in YAML format with clear descriptions and expected outcomes.
Return ONLY the YAML content without any markdown formatting or explanations.
`

  const response = await anthropic.messages.create({
    model: model || 'claude-3-sonnet-20240229',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content && content.type === 'text') {
    return content.text.trim()
  }

  throw new Error('Unexpected response from AI')
}
