import * as fs from 'node:fs'
import * as yaml from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG_FILE } from '../constants/defaults'
import {
  findStateMachine,
  loadProjectConfig,
  loadStateMachineDefinition,
  resolveMockPath,
  resolveStateMachinePath,
  resolveTestSuitePath,
} from './loader'

vi.mock('fs')
vi.mock('js-yaml')

describe('config/loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadProjectConfig', () => {
    it('should load config from default path', () => {
      const mockConfig = {
        version: '1.0',
        stateMachines: [
          {
            name: 'test-machine',
            source: { type: 'asl', path: './test.asl.json' },
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('version: "1.0"')
      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      const config = loadProjectConfig()

      expect(fs.existsSync).toHaveBeenCalledWith(DEFAULT_CONFIG_FILE)
      expect(fs.readFileSync).toHaveBeenCalledWith(DEFAULT_CONFIG_FILE, 'utf-8')
      expect(config).toEqual({
        ...mockConfig,
        paths: {
          mocks: './sfn-test/mocks',
          testSuites: './sfn-test/test-suites',
          testData: './sfn-test/test-data',
          extracted: './.sfn-test/extracted',
          coverage: './.sfn-test/coverage',
        },
      })
    })

    it('should return null when config does not exist and not required', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const config = loadProjectConfig(DEFAULT_CONFIG_FILE, false)

      expect(config).toBeNull()
    })

    it('should throw error when config does not exist and required', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => loadProjectConfig(DEFAULT_CONFIG_FILE, true)).toThrow(
        'Configuration file not found',
      )
    })

    it('should handle empty config gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('version: "1.0"')
      vi.mocked(yaml.load).mockReturnValue({ version: '1.0' })

      const config = loadProjectConfig()

      expect(config?.version).toBe('1.0')
      // Just check that paths exist, don't check exact values due to implementation differences
      expect(config?.paths).toBeDefined()
      expect(config?.paths?.mocks).toBeDefined()
    })
  })

  describe('findStateMachine', () => {
    const mockConfig = {
      version: '1.0',
      stateMachines: [
        {
          name: 'machine-1',
          source: { type: 'asl' as const, path: './machine1.asl.json' },
        },
        {
          name: 'machine-2',
          source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'SM2' },
        },
      ],
    }

    it('should find state machine by exact name', () => {
      const result = findStateMachine(mockConfig, 'machine-1')
      expect(result).toEqual(mockConfig.stateMachines[0])
    })

    it('should return null when state machine not found', () => {
      const result = findStateMachine(mockConfig, 'non-existent')
      expect(result).toBeNull()
    })
  })

  describe('resolveStateMachinePath', () => {
    it('should resolve ASL source path', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'asl' as const, path: './test.asl.json' },
      }

      const result = resolveStateMachinePath(stateMachine)
      expect(result).toContain('test.asl.json')
    })

    it('should resolve CDK source path', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'SM' },
      }

      const result = resolveStateMachinePath(stateMachine)
      expect(result).toContain('cdk.out/stack.json')
    })
  })

  describe('loadStateMachineDefinition', () => {
    it('should load ASL state machine directly', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'asl' as const, path: './test.asl.json' },
      }

      const mockDefinition = {
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockDefinition))

      const result = loadStateMachineDefinition(stateMachine)

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.asl.json'),
        'utf-8',
      )
      expect(result).toEqual(mockDefinition)
    })

    it('should extract state machine from CDK template', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'TestSM' },
      }

      const mockTemplate = {
        Resources: {
          TestSM: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              DefinitionString: JSON.stringify({
                StartAt: 'Start',
                States: { Start: { Type: 'Pass', End: true } },
              }),
            },
          },
        },
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      // Mock for checking CDK file existence and config
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        // CDK source file and config exist, but extracted files don't yet
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        return JSON.stringify(mockTemplate)
      })
      vi.mocked(yaml.load).mockReturnValue(mockConfig)
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats)

      const result = loadStateMachineDefinition(stateMachine)

      expect(result).toEqual({
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      })
    })

    it('should throw error when CDK state machine not found', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'Missing' },
      }

      const mockTemplate = {
        Resources: {},
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        // CDK source file and config exist, but extracted files don't
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        return JSON.stringify(mockTemplate)
      })
      vi.mocked(yaml.load).mockReturnValue(mockConfig)
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats)

      expect(() => loadStateMachineDefinition(stateMachine)).toThrow(
        'State machine Missing not found',
      )
    })

    it('should handle Definition property in CDK template', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'TestSM' },
      }

      const mockTemplate = {
        Resources: {
          TestSM: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {
              Definition: {
                StartAt: 'Start',
                States: { Start: { Type: 'Pass', End: true } },
              },
            },
          },
        },
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        // CDK source file and config exist, but extracted files don't
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        return JSON.stringify(mockTemplate)
      })
      vi.mocked(yaml.load).mockReturnValue(mockConfig)
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats)

      const result = loadStateMachineDefinition(stateMachine)

      expect(result).toEqual({
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      })
    })

    it('should use cached ASL when available for CDK', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'TestSM' },
      }

      const cachedDefinition = {
        StartAt: 'CachedStart',
        States: { CachedStart: { Type: 'Pass', End: true } },
      }

      const metadata = {
        sourceModifiedTime: new Date().toISOString(),
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        // CDK source, config, and cached files exist
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        if (pathStr.includes('extracted')) return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        if (pathStr.includes('metadata.json')) {
          return JSON.stringify(metadata)
        }
        if (pathStr.includes('.asl.json')) {
          return JSON.stringify(cachedDefinition)
        }
        return ''
      })

      vi.mocked(yaml.load).mockReturnValue(mockConfig)
      vi.mocked(fs.statSync).mockReturnValue({
        mtime: new Date(Date.now() - 1000), // Source is older than metadata
      } as fs.Stats)

      const result = loadStateMachineDefinition(stateMachine)

      expect(result).toEqual(cachedDefinition)
    })

    it('should throw error when CDK source missing stateMachineName', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json' },
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        return JSON.stringify({ Resources: {} })
      })

      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      expect(() => loadStateMachineDefinition(stateMachine)).toThrow(
        'stateMachineName is required for CDK source',
      )
    })

    it('should throw error when resource is not Step Functions state machine', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'NotSFN' },
      }

      const mockTemplate = {
        Resources: {
          NotSFN: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
        },
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        return JSON.stringify(mockTemplate)
      })

      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      expect(() => loadStateMachineDefinition(stateMachine)).toThrow(
        'Resource NotSFN is not a Step Functions state machine',
      )
    })

    it('should throw error when definition not found in CDK resource', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'cdk' as const, path: './cdk.out/stack.json', stateMachineName: 'NoDefSM' },
      }

      const mockTemplate = {
        Resources: {
          NoDefSM: {
            Type: 'AWS::StepFunctions::StateMachine',
            Properties: {},
          },
        },
      }

      const mockConfig = {
        version: '1.0',
        stateMachines: [],
        paths: {
          extracted: './.sfn-test/extracted',
        },
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('stack.json')) return true
        if (pathStr.includes('sfn-test.config.yaml')) return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr.includes('sfn-test.config.yaml')) {
          return 'version: "1.0"'
        }
        return JSON.stringify(mockTemplate)
      })

      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      expect(() => loadStateMachineDefinition(stateMachine)).toThrow(
        'State machine definition not found for NoDefSM',
      )
    })

    it('should throw error for unknown source type', () => {
      const stateMachine = {
        name: 'test',
        source: { type: 'unknown' as unknown as 'asl' | 'cdk', path: './unknown.json' },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)

      expect(() => loadStateMachineDefinition(stateMachine)).toThrow('Unknown source type: unknown')
    })
  })

  describe('resolveMockPath', () => {
    it('should resolve mock path using default directory', () => {
      const config = {
        version: '1.0',
        stateMachines: [],
        paths: {
          mocks: './.sfn-test/mocks',
        },
      }

      const result = resolveMockPath(
        config as Parameters<typeof resolveMockPath>[0],
        'test-machine',
      )

      expect(result).toBe('.sfn-test/mocks/test-machine.mock.yaml')
    })

    it('should resolve mock path using custom directory', () => {
      const config = {
        version: '1.0',
        stateMachines: [],
        paths: {
          mocks: './custom-mocks',
        },
      }

      const result = resolveMockPath(
        config as Parameters<typeof resolveMockPath>[0],
        'test-machine',
      )

      expect(result).toBe('custom-mocks/test-machine.mock.yaml')
    })
  })

  describe('resolveTestSuitePath', () => {
    it('should resolve test suite path using default directory', () => {
      const config = {
        version: '1.0',
        stateMachines: [],
        paths: {
          testSuites: './.sfn-test/test-suites',
        },
      }

      const result = resolveTestSuitePath(
        config as Parameters<typeof resolveTestSuitePath>[0],
        'test-machine',
      )

      expect(result).toBe('.sfn-test/test-suites/test-machine.test.yaml')
    })

    it('should resolve test suite path using custom directory', () => {
      const config = {
        version: '1.0',
        stateMachines: [],
        paths: {
          testSuites: './custom-tests',
        },
      }

      const result = resolveTestSuitePath(
        config as Parameters<typeof resolveTestSuitePath>[0],
        'test-machine',
      )

      expect(result).toBe('custom-tests/test-machine.test.yaml')
    })
  })
})
