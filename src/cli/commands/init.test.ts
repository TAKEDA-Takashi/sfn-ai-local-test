import * as fs from 'node:fs'
import inquirer from 'inquirer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initCommand } from './init'

// Mock modules
vi.mock('fs')
vi.mock('inquirer')
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  }),
}))

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('when config file already exists', () => {
    it('should exit if user chooses not to overwrite', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(inquirer.prompt).mockResolvedValue({ overwrite: false })

      await initCommand()

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialization cancelled'))
    })

    it('should continue if user chooses to overwrite', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        // Config file exists, directories don't
        if (path === 'sfn-test.config.yaml') return true
        return false
      })

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : questions
        if ((question as any).name === 'overwrite') return Promise.resolve({ overwrite: true })
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: true })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: false })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand()

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'sfn-test.config.yaml',
        expect.stringMatching(/version:\s*['"]1\.0['"]/),
      )
    })
  })

  describe('project type detection', () => {
    it('should detect CDK project', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === 'sfn-test.config.yaml') return false
        if (pathStr === 'cdk.json') return true
        if (pathStr === 'cdk.out') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['Stack.template.json'] as unknown as ReturnType<
        typeof fs.readdirSync
      >)
      vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          Resources: {
            MyStateMachine: {
              Type: 'AWS::StepFunctions::StateMachine',
              Properties: {
                DefinitionString: JSON.stringify({
                  StartAt: 'Start',
                  States: { Start: { Type: 'Pass', End: true } },
                }),
              },
            },
          },
        }),
      )

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : questions
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: true })
        if ((question as any).name === 'extractCdk') return Promise.resolve({ extractCdk: true })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: false })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand()

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'sfn-test.config.yaml',
        expect.stringContaining('type: cdk'),
      )
    })

    it('should detect standalone ASL files', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === 'sfn-test.config.yaml') return false
        return false
      })

      vi.mocked(fs.readdirSync).mockImplementation((_path, options?: { recursive?: boolean }) => {
        if (options?.recursive) {
          return [
            'workflows/order.asl.json',
            'workflows/payment.asl.json',
            'not-asl.json',
          ] as unknown as ReturnType<typeof fs.readdirSync>
        }
        return [] as unknown as ReturnType<typeof fs.readdirSync>
      })

      vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          StartAt: 'Start',
          States: { Start: { Type: 'Pass', End: true } },
        }),
      )

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : questions
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: true })
        if ((question as any).name === 'registerAsl') return Promise.resolve({ registerAsl: true })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: false })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand()

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'sfn-test.config.yaml',
        expect.stringContaining('type: asl'),
      )
    })
  })

  describe('directory setup', () => {
    it('should create project directories when requested', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : questions
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: true })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: false })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand()

      expect(fs.mkdirSync).toHaveBeenCalledWith('sfn-test/mocks', expect.any(Object))
      expect(fs.mkdirSync).toHaveBeenCalledWith('sfn-test/test-suites', expect.any(Object))
      expect(fs.mkdirSync).toHaveBeenCalledWith('sfn-test/test-data', expect.any(Object))
      expect(fs.mkdirSync).toHaveBeenCalledWith('.sfn-test/extracted', expect.any(Object))
      expect(fs.mkdirSync).toHaveBeenCalledWith('.sfn-test/coverage', expect.any(Object))
    })

    it('should not create directories when user declines', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : (questions as any)
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: false })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: false })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      const mkdirSpy = vi.mocked(fs.mkdirSync)

      await initCommand()

      expect(mkdirSpy).not.toHaveBeenCalled()
    })
  })

  describe('gitignore update', () => {
    it('should add entries to existing .gitignore', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === '.gitignore') return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString() === '.gitignore') {
          return 'node_modules/\n*.log'
        }
        return JSON.stringify({
          StartAt: 'Start',
          States: { Start: { Type: 'Pass', End: true } },
        })
      })

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : (questions as any)
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: false })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: true })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.appendFileSync).mockImplementation(() => {})

      await initCommand()

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '.gitignore',
        expect.stringContaining('.sfn-test/'),
      )
    })

    it('should create new .gitignore if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
        const question = Array.isArray(questions) ? questions[0] : (questions as any)
        if ((question as any).name === 'confirmType') return Promise.resolve({ confirmType: true })
        if ((question as any).name === 'createDirs') return Promise.resolve({ createDirs: false })
        if ((question as any).name === 'createConfig')
          return Promise.resolve({ createConfig: true })
        if ((question as any).name === 'updateGitignore')
          return Promise.resolve({ updateGitignore: true })
        return Promise.resolve({})
      }) as any)

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})

      await initCommand()

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '.gitignore',
        expect.stringContaining('.sfn-test/'),
      )
    })
  })

  describe('-y option (non-interactive mode)', () => {
    it('should skip all prompts and use defaults when -y is specified', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        // Config file exists to test overwrite scenario
        if (path === 'sfn-test.config.yaml') return true
        return false
      })

      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand({ yes: true })

      // inquirer.prompt should not be called when -y is specified
      expect(inquirer.prompt).not.toHaveBeenCalled()

      // Config file should be created
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'sfn-test.config.yaml',
        expect.stringMatching(/version:\s*['"]1\.0['"]/),
      )

      // Directories should be created
      expect(fs.mkdirSync).toHaveBeenCalledWith('sfn-test/mocks', expect.any(Object))
      expect(fs.mkdirSync).toHaveBeenCalledWith('sfn-test/test-suites', expect.any(Object))
    })

    it('should overwrite existing config file with -y option', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand({ yes: true })

      expect(inquirer.prompt).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠ Overwriting existing sfn-test.config.yaml'),
      )
    })

    it('should handle CDK project detection with -y option', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString()
        if (pathStr === 'sfn-test.config.yaml') return false
        if (pathStr === 'cdk.json') return true
        if (pathStr === 'cdk.out') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['Stack.template.json'] as unknown as ReturnType<
        typeof fs.readdirSync
      >)
      vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as fs.Stats)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          Resources: {
            MyStateMachine: {
              Type: 'AWS::StepFunctions::StateMachine',
              Properties: {
                DefinitionString: JSON.stringify({
                  StartAt: 'Start',
                  States: { Start: { Type: 'Pass', End: true } },
                }),
              },
            },
          },
        }),
      )
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand({ yes: true })

      expect(inquirer.prompt).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Using detected project type: cdk'),
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Extracting from 1 CDK template(s)'),
      )
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'sfn-test.config.yaml',
        expect.stringContaining('type: cdk'),
      )
    })

    it('should create all default files with -y option', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.writeFileSync).mockImplementation(() => {})
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await initCommand({ yes: true })

      expect(inquirer.prompt).not.toHaveBeenCalled()

      // Should create config
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'sfn-test.config.yaml',
        expect.stringMatching(/version:\s*['"]1\.0['"]/),
      )

      // Should create .gitignore
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '.gitignore',
        expect.stringContaining('.sfn-test/'),
      )

      // Should show non-interactive messages
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Creating directory structure'),
      )
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✓ Updating .gitignore'))
    })
  })

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error')
      })

      await expect(initCommand()).rejects.toThrow('File system error')
    })
  })
})
