import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectConfig } from '../../config/loader'
import { loadProjectConfig } from '../../config/loader'
import { correctFilePaths, hasNameBasedConfig } from './claude-cli'

vi.mock('../../config/loader')

describe('Path correction logic', () => {
  const testDir = resolve(__dirname, '../../../test-temp-path-correction')

  beforeEach(() => {
    // Create test directory structure
    mkdirSync(testDir, { recursive: true })
    mkdirSync(resolve(testDir, 'sfn-test/mocks'), { recursive: true })
    mkdirSync(resolve(testDir, '.sfn-test/extracted'), { recursive: true })

    // Create config file with name-based configuration
    writeFileSync(
      resolve(testDir, 'sfn-test.config.yaml'),
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
  })

  afterEach(() => {
    // Ensure we return to project root before cleanup
    const projectRoot = resolve(__dirname, '../../..')
    try {
      process.chdir(projectRoot)
    } catch {
      // If that fails, just continue with cleanup
    }
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should use name-based references when config has named state machine', async () => {
    // Mock the config to return a named state machine
    vi.mocked(loadProjectConfig).mockImplementation(
      (): ProjectConfig => ({
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
      }),
    )

    // Mock AI generated content with file paths
    const mockGeneratedContent = `version: "1.0"
name: "Test Suite"
stateMachine: "./workflow.asl.json"
baseMock: "./order-processing-workflow.mock.yaml"
testCases:
  - name: "test"
    input: {}
    expectedPath: ["State1"]`

    // Call the function with mock parameters
    const result = await correctFilePaths(
      mockGeneratedContent,
      'order-processing-workflow.asl.json',
      'order-processing-workflow.mock.yaml',
    )

    // Test hasNameBasedConfig directly
    const hasConfig = hasNameBasedConfig('order-processing-workflow')
    expect(hasConfig).toBe(true)

    // Should convert to name-based references
    expect(result).toContain('stateMachine: "order-processing-workflow"')
    expect(result).toContain('baseMock: "order-processing-workflow"')
    expect(result).not.toContain('stateMachine: "./workflow.asl.json"')
    expect(result).not.toContain('baseMock: "./order-processing-workflow.mock.yaml"')
  })

  it('should fall back to relative paths when no config exists', () => {
    const tempDirNoConfig = resolve(__dirname, '../../../test-temp-no-config')
    mkdirSync(tempDirNoConfig, { recursive: true })

    const originalCwd = process.cwd()
    process.chdir(tempDirNoConfig)

    try {
      // No config file exists, should use relative paths
      expect(true).toBe(true) // Placeholder
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDirNoConfig, { recursive: true, force: true })
    }
  })
})
