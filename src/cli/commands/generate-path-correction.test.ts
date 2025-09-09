import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasNameBasedConfig } from '../../ai/agents/claude-cli'
import type { ProjectConfig } from '../../config/loader'
import { loadProjectConfig } from '../../config/loader'

vi.mock('../../config/loader')

describe('Generate command - path correction bug', () => {
  const testDir = resolve(__dirname, '../../../test-temp-path-correction')
  const configPath = resolve(testDir, 'sfn-test.config.yaml')
  const mockPath = resolve(testDir, 'sfn-test/mocks/order-processing-workflow.mock.yaml')

  beforeEach(() => {
    // Clean up any existing test directory first
    rmSync(testDir, { recursive: true, force: true })

    // Create test directory structure
    mkdirSync(testDir, { recursive: true })
    mkdirSync(resolve(testDir, 'sfn-test/mocks'), { recursive: true })
    mkdirSync(resolve(testDir, '.sfn-test/extracted'), { recursive: true })

    // Create config file with name-based configuration
    writeFileSync(
      configPath,
      `
version: '1.0'
stateMachines:
  - name: order-processing-workflow
    source:
      type: cdk
      path: ./cdk.out/OrderProcessingStack.template.json
      stateMachineName: OrderProcessingStateMachineD268D63F
`,
    )

    // Create mock file
    writeFileSync(
      mockPath,
      `
version: "1.0"
name: "order-processing-mock"
mocks:
  - state: "ValidateOrder"
    type: "fixed"
    response:
      Payload:
        orderId: "order-123"
        valid: true
      StatusCode: 200
`,
    )

    // Create extracted ASL file
    writeFileSync(
      resolve(testDir, '.sfn-test/extracted/order-processing-workflow.asl.json'),
      `
{
  "StartAt": "PrepareOrder",
  "States": {
    "PrepareOrder": {
      "Type": "Pass",
      "Next": "ValidateOrder"
    },
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "End": true
    }
  }
}`,
    )
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should generate test with name-based references when config has name-based setup', async () => {
    // Mock the config to return a named state machine
    vi.mocked(loadProjectConfig).mockImplementation(
      () =>
        ({
          version: '1.0',
          stateMachines: [
            {
              name: 'order-processing-workflow',
              source: {
                type: 'cdk',
                path: './cdk.out/OrderProcessingStack.template.json',
                stateMachineName: 'OrderProcessingStateMachineD268D63F',
              },
            },
          ],
        }) satisfies ProjectConfig,
    )

    // Mock the AI generation to return content with file paths (simulating current bug)
    const mockAIGeneration = `version: "1.0"
name: "Order Processing Test Suite"
stateMachine: "./order-processing-workflow.asl.json"
baseMock: "./order-processing-workflow.mock.yaml"
testCases:
  - name: "test case"
    input: {}
    expectedPath: ["PrepareOrder", "ValidateOrder"]`

    // Import without dynamic import
    const { correctFilePaths } = await import('../../ai/agents/claude-cli')

    const result = await correctFilePaths(
      mockAIGeneration,
      'order-processing-workflow.asl.json',
      'order-processing-workflow.mock.yaml',
    )

    // Should use name-based references, NOT file paths
    expect(result).toContain('stateMachine: "order-processing-workflow"')
    expect(result).toContain('baseMock: "order-processing-workflow"')
    expect(result).not.toContain('stateMachine: "./order-processing-workflow.asl.json"')
    expect(result).not.toContain('baseMock: "./order-processing-workflow.mock.yaml"')
  })

  it('should detect when config has name-based setup vs path-based setup', async () => {
    // Mock the config to return a named state machine
    vi.mocked(loadProjectConfig).mockImplementation(
      () =>
        ({
          version: '1.0',
          stateMachines: [
            {
              name: 'order-processing-workflow',
              source: {
                type: 'cdk',
                path: './cdk.out/OrderProcessingStack.template.json',
                stateMachineName: 'OrderProcessingStateMachineD268D63F',
              },
            },
          ],
        }) satisfies ProjectConfig,
    )

    const result = await hasNameBasedConfig('order-processing-workflow')
    expect(result).toBe(true)
  })
})
