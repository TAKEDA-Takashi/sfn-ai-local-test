import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { load } from 'js-yaml'
import {
  findStateMachine,
  loadProjectConfig,
  loadStateMachineDefinition,
} from '../../config/loader'
import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_MOCKS_DIR,
  DEFAULT_TEST_DATA_DIR,
} from '../../constants/defaults'
import { mockConfigSchema } from '../../schemas/mock-schema'
import type { TestSuite } from '../../schemas/test-schema'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import type { TestSuiteResult } from '../../types/test'
import { isJsonObject } from '../../types/type-guards'
import { extractStateMachineFromCDK } from '../../utils/cdk-extractor'
import { MockEngine } from '../mock/engine'
import { TestSuiteExecutor } from './executor'
import type { ValidationError } from './validator'
import { TestSuiteValidator } from './validator'

export class TestSuiteRunner {
  private suite: TestSuite
  private stateMachine: StateMachine
  private stateMachineName?: string
  private mockEngine?: MockEngine
  private suiteDir: string
  private executor: TestSuiteExecutor

  constructor(suitePath: string) {
    // Store the directory containing the test suite file
    this.suiteDir = dirname(suitePath)

    // Load and validate test suite
    this.suite = this.loadAndValidateTestSuite(suitePath)

    // Load state machine
    const stateMachineData = this.loadStateMachine()
    // Convert state machine to use State class instances
    if (!isJsonObject(stateMachineData.stateMachine)) {
      throw new Error('Invalid state machine definition')
    }
    this.stateMachine = StateFactory.createStateMachine(stateMachineData.stateMachine)
    this.stateMachineName = stateMachineData.stateMachineName

    // Load mock configuration
    this.mockEngine = this.loadMockConfiguration()

    // Set test data path (currently unused)
    // this.testDataPath = this.resolveTestDataPath()

    // Create executor
    this.executor = new TestSuiteExecutor(this.suite, this.stateMachine, this.mockEngine)
  }

  private loadAndValidateTestSuite(suitePath: string): TestSuite {
    const suiteContent = readFileSync(suitePath, 'utf-8')
    const suite = load(suiteContent)

    // Validate test suite
    const validator = new TestSuiteValidator()
    let validationResult: { warnings: ValidationError[]; validatedSuite: TestSuite }
    try {
      validationResult = validator.validate(suite)
    } catch (error) {
      // Format validation error (Zod parse error)
      console.error('\n❌ Test Suite Format Error:')
      console.error(`  ${error instanceof Error ? error.message : String(error)}`)
      throw new Error('Test suite format validation failed')
    }

    const warnings = validationResult.warnings || []

    // Display warnings
    if (warnings.length > 0) {
      console.warn('\n⚠️  Test Suite Validation Warnings:')
      for (const warning of warnings) {
        const warningMessage =
          typeof warning === 'string' ? warning : JSON.stringify(warning, null, 2)
        console.warn(`  ${warningMessage}`)
      }
    }

    return validationResult.validatedSuite
  }

  private loadStateMachine(): { stateMachine: unknown; stateMachineName?: string } {
    let stateMachineRef = this.suite.stateMachine

    if (!stateMachineRef) {
      // ファイル名から推測: payment.test.yaml → payment
      const filename = basename(this.suiteDir)
      const match = filename.match(/^(.+?)\.test\.(yaml|yml)$/)
      if (match?.[1]) {
        stateMachineRef = match[1]
      } else {
        throw new Error(
          'State machine reference is required in test suite or inferable from filename',
        )
      }
    }

    // Try to find in project configuration first
    let foundInConfig = false
    if (existsSync(DEFAULT_CONFIG_FILE)) {
      try {
        const config = loadProjectConfig(DEFAULT_CONFIG_FILE)
        if (!config) {
          throw new Error('Config file could not be loaded')
        }
        const stateMachineConfig = findStateMachine(config, stateMachineRef)

        if (stateMachineConfig) {
          const stateMachine = loadStateMachineDefinition(stateMachineConfig)
          foundInConfig = true
          return { stateMachine, stateMachineName: stateMachineRef }
        }
      } catch (_error) {
        // Fall through to file path handling
      }
    }

    // Handle as file path
    if (
      !foundInConfig &&
      (stateMachineRef.includes('/') ||
        stateMachineRef.includes('\\') ||
        stateMachineRef.endsWith('.json') ||
        stateMachineRef.endsWith('.yaml') ||
        stateMachineRef.endsWith('.yml'))
    ) {
      if (!(stateMachineRef.startsWith('/') || stateMachineRef.startsWith('\\'))) {
        stateMachineRef = resolve(this.suiteDir, stateMachineRef)
      }
      const stateMachineContent = readFileSync(stateMachineRef, 'utf-8')
      const parsedContent = JSON.parse(stateMachineContent)

      if (parsedContent.Resources) {
        if (!isJsonObject(parsedContent)) {
          throw new Error('Parsed content is not a valid JSON object')
        }
        const stateMachine = extractStateMachineFromCDK(parsedContent)
        return { stateMachine }
      } else {
        return { stateMachine: parsedContent }
      }
    } else if (!foundInConfig) {
      throw new Error(
        `State machine '${stateMachineRef}' not found in configuration and doesn't appear to be a file path`,
      )
    }

    throw new Error('Unable to resolve state machine')
  }

  private loadMockConfiguration(): MockEngine | undefined {
    let mockPath = this.suite.baseMock

    // Auto-resolve if no mock path specified but we have a state machine name
    if (!mockPath && this.stateMachineName) {
      mockPath = this.stateMachineName
    }

    if (mockPath) {
      const isPath =
        mockPath.includes('/') ||
        mockPath.includes('\\') ||
        mockPath.endsWith('.yaml') ||
        mockPath.endsWith('.yml')

      if (isPath) {
        if (!(mockPath.startsWith('/') || mockPath.startsWith('\\'))) {
          mockPath = resolve(this.suiteDir, mockPath)
        }
      } else {
        mockPath = this.resolveMockPath(mockPath)
      }

      if (process.env.DEBUG_OUTPUT_PATH) {
        console.log('Mock path resolved to:', mockPath)
      }

      if (existsSync(mockPath)) {
        const mockContent = readFileSync(mockPath, 'utf-8')
        const rawConfig = load(mockContent)
        const mockConfig = mockConfigSchema.parse(rawConfig)

        // Load project config to get test data path
        const config = existsSync(DEFAULT_CONFIG_FILE) ? loadProjectConfig() : null
        const testDataPath = config?.paths?.testData || DEFAULT_TEST_DATA_DIR

        const mockEngine = new MockEngine(mockConfig, { basePath: testDataPath })

        if (process.env.DEBUG_OUTPUT_PATH) {
          console.log('Mock engine created with', mockConfig.mocks?.length || 0, 'mocks')
          console.log('Mock engine basePath set to:', testDataPath)
        }

        return mockEngine
      } else if (process.env.DEBUG_OUTPUT_PATH) {
        console.log('Mock file not found at:', mockPath)
      }
    } else if (process.env.DEBUG_OUTPUT_PATH) {
      console.log('No mock path specified')
    }

    return undefined
  }

  // Removed unused _resolveTestDataPath method to eliminate TypeScript warnings

  private resolveMockPath(mockPath: string): string {
    if (
      mockPath.includes('/') ||
      mockPath.includes('\\') ||
      mockPath.endsWith('.yaml') ||
      mockPath.endsWith('.yml')
    ) {
      return mockPath
    }

    let resolvedPath = mockPath

    if (existsSync(DEFAULT_CONFIG_FILE)) {
      try {
        const config = loadProjectConfig(DEFAULT_CONFIG_FILE)
        const mocksDir = config?.paths?.mocks || DEFAULT_MOCKS_DIR

        // Try different mock file naming conventions
        const mockPaths = [
          resolve(mocksDir, `${mockPath}.mock.yaml`),
          resolve(mocksDir, `${mockPath}.mock.yml`),
          resolve(mocksDir, `${mockPath}.yaml`),
          resolve(mocksDir, `${mockPath}.yml`),
        ]

        for (const path of mockPaths) {
          if (existsSync(path)) {
            resolvedPath = path
            break
          }
        }

        // If not found, try default directory
        if (resolvedPath === mockPath) {
          const defaultPaths = [
            resolve(DEFAULT_MOCKS_DIR, `${mockPath}.mock.yaml`),
            resolve(DEFAULT_MOCKS_DIR, `${mockPath}.yaml`),
          ]

          for (const path of defaultPaths) {
            if (existsSync(path)) {
              resolvedPath = path
              break
            }
          }
        }
      } catch (_error) {
        resolvedPath = resolve(DEFAULT_MOCKS_DIR, `${mockPath}.yaml`)
      }
    } else {
      resolvedPath = resolve(DEFAULT_MOCKS_DIR, `${mockPath}.yaml`)
    }

    return resolvedPath
  }

  runSuite(
    enableCoverage = false,
    options?: { verbose?: boolean; quiet?: boolean },
  ): Promise<TestSuiteResult> {
    return this.executor.runSuite(enableCoverage, options)
  }

  // Expose convertMockOverrides for testing (private method access)
  get testExecutor() {
    return this.executor
  }
}
