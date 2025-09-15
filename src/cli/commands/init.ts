import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { dump } from 'js-yaml'
import ora from 'ora'
import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_COVERAGE_DIR,
  DEFAULT_EXTRACTED_DIR,
  DEFAULT_MOCKS_DIR,
  DEFAULT_TEST_DATA_DIR,
  DEFAULT_TEST_SUITES_DIR,
} from '../../constants/defaults'
import { EXECUTION_CONTEXT_DEFAULTS } from '../../constants/execution-context'
import type { ProjectConfig, StateMachineConfig } from '../../schemas/config-schema'

interface ProjectInfo {
  type: 'cdk' | 'terraform' | 'standalone' | 'unknown'
  stateMachines: StateMachineInfo[]
  cdkTemplates?: string[]
  terraformDirs?: string[]
  aslFiles?: string[]
}

interface StateMachineInfo {
  name: string
  source: {
    type: 'cdk' | 'asl'
    path: string
    /** CDKの場合のみ必要 */
    stateMachineName?: string
  }
}

interface InitOptions {
  yes?: boolean
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 Initializing sfn-test project\n'))

  if (existsSync(DEFAULT_CONFIG_FILE.replace('./', ''))) {
    let overwrite = options.yes ?? true

    if (!options.yes) {
      const result = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'sfn-test.config.yaml already exists. Overwrite?',
          default: false,
        },
      ])
      overwrite = result.overwrite
    }

    if (!overwrite) {
      console.log(chalk.yellow('\n✖ Initialization cancelled'))
      return
    }

    if (options.yes) {
      console.log(chalk.yellow('⚠ Overwriting existing sfn-test.config.yaml'))
    }
  }

  const spinner = ora('Detecting project type...').start()
  const projectInfo = detectProject()
  spinner.stop()

  displayDetectionResult(projectInfo)

  let confirmType = options.yes ?? true

  if (!options.yes) {
    const result = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmType',
        message: 'Is this detection correct?',
        default: true,
      },
    ])
    confirmType = result.confirmType
  }

  if (!confirmType) {
    const { selectedType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedType',
        message: 'Select your project type:',
        choices: [
          { name: 'CDK (AWS Cloud Development Kit)', value: 'cdk' },
          { name: 'Terraform', value: 'terraform' },
          { name: 'Standalone ASL files', value: 'standalone' },
          { name: 'Other/Unknown', value: 'unknown' },
        ],
      },
    ])
    projectInfo.type = selectedType
  } else if (options.yes) {
    console.log(chalk.green(`✓ Using detected project type: ${projectInfo.type}`))
  }

  let createDirs = options.yes ?? true

  if (!options.yes) {
    const result = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createDirs',
        message: 'Create directory structure?',
        default: true,
      },
    ])
    createDirs = result.createDirs
  }

  if (createDirs) {
    if (options.yes) {
      console.log(chalk.green('✓ Creating directory structure'))
    }
    createDirectoryStructure()
  }

  if (
    projectInfo.type === 'cdk' &&
    projectInfo.cdkTemplates &&
    projectInfo.cdkTemplates.length > 0
  ) {
    let extractCdk = options.yes ?? true

    if (!options.yes) {
      const result = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'extractCdk',
          message: `Found ${projectInfo.cdkTemplates.length} CDK template(s). Extract state machines?`,
          default: true,
        },
      ])
      extractCdk = result.extractCdk
    }

    if (extractCdk) {
      if (options.yes) {
        console.log(
          chalk.green(`✓ Extracting from ${projectInfo.cdkTemplates.length} CDK template(s)`),
        )
      }
      extractCDKStateMachines(projectInfo)
    }
  }

  if (
    (projectInfo.type === 'terraform' || projectInfo.type === 'standalone') &&
    projectInfo.aslFiles &&
    projectInfo.aslFiles.length > 0
  ) {
    let registerAsl = options.yes ?? true

    if (!options.yes) {
      const result = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'registerAsl',
          message: `Found ${projectInfo.aslFiles.length} ASL file(s). Register them?`,
          default: true,
        },
      ])
      registerAsl = result.registerAsl
    }

    if (registerAsl) {
      if (options.yes) {
        console.log(chalk.green(`✓ Registering ${projectInfo.aslFiles.length} ASL file(s)`))
      }
      registerASLFiles(projectInfo)
    }
  }

  let createConfig = options.yes ?? true

  if (!options.yes) {
    const result = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createConfig',
        message: 'Create sfn-test.config.yaml?',
        default: true,
      },
    ])
    createConfig = result.createConfig
  }

  if (createConfig) {
    const config = generateConfig(projectInfo)
    const yamlContent = generateConfigYaml(config)
    writeFileSync(DEFAULT_CONFIG_FILE.replace('./', ''), yamlContent)
    console.log(chalk.green('  ✓ Created sfn-test.config.yaml'))
  }

  let shouldUpdate = options.yes ?? true

  if (!options.yes) {
    const result = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateGitignore',
        message: 'Update .gitignore?',
        default: true,
      },
    ])
    shouldUpdate = result.updateGitignore
  }

  if (shouldUpdate) {
    if (options.yes) {
      console.log(chalk.green('✓ Updating .gitignore'))
    }
    updateGitignore()
  }

  if (projectInfo.stateMachines.length > 0) {
    let createSamples = options.yes ?? true

    if (!options.yes) {
      const result = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'createSamples',
          message: 'Generate sample mock and test files?',
          default: true,
        },
      ])
      createSamples = result.createSamples
    }

    if (createSamples && projectInfo.stateMachines[0]) {
      if (options.yes) {
        console.log(chalk.green('✓ Generating sample mock and test files'))
      }
      generateSampleFiles(projectInfo.stateMachines[0])
    }
  }

  console.log(chalk.green.bold('\n✅ sfn-test project initialized successfully!\n'))
  displayNextSteps(projectInfo)
}

function detectProject(): ProjectInfo {
  const projectInfo: ProjectInfo = {
    type: 'unknown',
    stateMachines: [],
  }

  if (existsSync('cdk.json')) {
    projectInfo.type = 'cdk'

    if (existsSync('cdk.out')) {
      const templates = readdirSync('cdk.out').filter((f) => f.endsWith('.template.json'))

      if (templates.length > 0) {
        projectInfo.cdkTemplates = templates.map((t) => join('cdk.out', t))
      }
    }
    return projectInfo
  }

  const tfFiles = findFiles('.', (f) => f.endsWith('.tf'), 2)
  if (tfFiles.length > 0) {
    projectInfo.type = 'terraform'

    const terraformDirs = new Set<string>()
    tfFiles.forEach((f) => {
      const dir = f.substring(0, f.lastIndexOf('/'))
      if (dir) terraformDirs.add(dir)
    })
    projectInfo.terraformDirs = Array.from(terraformDirs)

    projectInfo.aslFiles = findFiles('.', (f) => f.endsWith('.asl.json'), 3)
    return projectInfo
  }

  const aslFiles = findFiles('.', (f) => f.endsWith('.asl.json'), 3)
  if (aslFiles.length > 0) {
    projectInfo.type = 'standalone'
    projectInfo.aslFiles = aslFiles
  }

  return projectInfo
}

function findFiles(
  dir: string,
  predicate: (filename: string) => boolean,
  maxDepth: number = 3,
  currentDepth: number = 0,
): string[] {
  const results: string[] = []

  if (currentDepth >= maxDepth) return results

  const sfnTestParentDir = dirname(DEFAULT_EXTRACTED_DIR).replace('./', '')
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', sfnTestParentDir]

  try {
    const entries = readdirSync(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory() && !ignoreDirs.includes(entry)) {
        results.push(...findFiles(fullPath, predicate, maxDepth, currentDepth + 1))
      } else if (stat.isFile() && predicate(entry)) {
        results.push(fullPath)
      }
    }
  } catch (_error) {
    // Continue silently on permission errors (common in test/CI environments)
  }

  return results
}

function displayDetectionResult(projectInfo: ProjectInfo): void {
  console.log(chalk.cyan('\n📊 Detection Results:'))
  console.log(chalk.gray('─'.repeat(40)))

  switch (projectInfo.type) {
    case 'cdk':
      console.log(`  Project Type: ${chalk.green('CDK')}`)
      if (projectInfo.cdkTemplates && projectInfo.cdkTemplates.length > 0) {
        console.log(`  Templates Found: ${chalk.yellow(projectInfo.cdkTemplates.length)}`)
        projectInfo.cdkTemplates.forEach((t) => {
          console.log(chalk.gray(`    - ${t}`))
        })
      } else {
        console.log(chalk.yellow('  No templates found. Run "cdk synth" first.'))
      }
      break

    case 'terraform':
      console.log(`  Project Type: ${chalk.green('Terraform')}`)
      if (projectInfo.aslFiles && projectInfo.aslFiles.length > 0) {
        console.log(`  ASL Files Found: ${chalk.yellow(projectInfo.aslFiles.length)}`)
        projectInfo.aslFiles.slice(0, 5).forEach((f) => {
          console.log(chalk.gray(`    - ${f}`))
        })
        if (projectInfo.aslFiles.length > 5) {
          console.log(chalk.gray(`    ... and ${projectInfo.aslFiles.length - 5} more`))
        }
      }
      break

    case 'standalone':
      console.log(`  Project Type: ${chalk.green('Standalone')}`)
      if (projectInfo.aslFiles && projectInfo.aslFiles.length > 0) {
        console.log(`  ASL Files Found: ${chalk.yellow(projectInfo.aslFiles.length)}`)
        projectInfo.aslFiles.slice(0, 5).forEach((f) => {
          console.log(chalk.gray(`    - ${f}`))
        })
        if (projectInfo.aslFiles.length > 5) {
          console.log(chalk.gray(`    ... and ${projectInfo.aslFiles.length - 5} more`))
        }
      }
      break

    default:
      console.log(`  Project Type: ${chalk.yellow('Unknown')}`)
      console.log(chalk.gray('  No CDK, Terraform, or ASL files detected'))
  }

  console.log(chalk.gray('─'.repeat(40)))
}

function createDirectoryStructure(): void {
  const dirs = [
    DEFAULT_MOCKS_DIR,
    DEFAULT_TEST_SUITES_DIR,
    DEFAULT_TEST_DATA_DIR,
    DEFAULT_EXTRACTED_DIR,
    DEFAULT_COVERAGE_DIR,
  ]

  console.log(chalk.cyan('\n📁 Creating directories:'))
  dirs.forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.log(chalk.green(`  ✓ Created ${dir}/`))
    } else {
      console.log(chalk.gray(`  ○ ${dir}/ already exists`))
    }
  })
}

function extractCDKStateMachines(projectInfo: ProjectInfo): void {
  if (!projectInfo.cdkTemplates) return

  console.log(chalk.cyan('\n🔍 Extracting state machines from CDK templates...'))

  for (const templatePath of projectInfo.cdkTemplates) {
    try {
      const template = JSON.parse(readFileSync(templatePath, 'utf-8'))
      const resources = template.Resources || {}

      for (const [logicalId, resource] of Object.entries(resources)) {
        if (
          resource != null &&
          typeof resource === 'object' &&
          'Type' in resource &&
          resource.Type === 'AWS::StepFunctions::StateMachine'
        ) {
          const name = logicalId.replace(/StateMachine$/, '').toLowerCase()
          projectInfo.stateMachines.push({
            name: name,
            source: {
              type: 'cdk',
              path: templatePath,
              stateMachineName: logicalId,
            },
          })
          console.log(chalk.green(`  ✓ Found ${logicalId}`))
        }
      }
    } catch (_error) {
      console.log(chalk.red(`  ✖ Failed to parse ${templatePath}`))
      // エラー詳細はverboseモードでのみ表示すべきだが、現状はログを抑制
    }
  }
}

function registerASLFiles(projectInfo: ProjectInfo): void {
  if (!projectInfo.aslFiles) return

  console.log(chalk.cyan('\n📝 Registering ASL files...'))

  for (const aslFile of projectInfo.aslFiles) {
    const name = basename(aslFile, '.asl.json').toLowerCase()
    projectInfo.stateMachines.push({
      name: name,
      source: {
        type: 'asl',
        path: aslFile,
      },
    })
    console.log(chalk.green(`  ✓ Registered ${name}`))
  }
}

function generateConfig(projectInfo: ProjectInfo): Omit<ProjectConfig, 'paths'> {
  const config: Omit<ProjectConfig, 'paths'> = {
    version: '1.0',
    stateMachines: [],
  }

  if (projectInfo.stateMachines.length > 0) {
    config.stateMachines = projectInfo.stateMachines
  } else {
    config.stateMachines = generatePlaceholderStateMachines(projectInfo.type)
  }

  return config
}

function generateConfigYaml(config: Omit<ProjectConfig, 'paths'>): string {
  let yamlContent = dump(config)

  const pathsComment = `
# Default path configuration (uncomment to customize)
# paths:
#   mocks: '${DEFAULT_MOCKS_DIR}'
#   testSuites: '${DEFAULT_TEST_SUITES_DIR}'
#   testData: '${DEFAULT_TEST_DATA_DIR}'
#   extracted: '${DEFAULT_EXTRACTED_DIR}'
#   coverage: '${DEFAULT_COVERAGE_DIR}'

# ExecutionContext configuration for test reproducibility (uncomment to customize)
# executionContext:
#   name: '${EXECUTION_CONTEXT_DEFAULTS.NAME}'              # Execution name (default: ${EXECUTION_CONTEXT_DEFAULTS.NAME})
#   startTime: '${EXECUTION_CONTEXT_DEFAULTS.START_TIME}'  # Fixed start time for tests
#   roleArn: '${EXECUTION_CONTEXT_DEFAULTS.ROLE_ARN}'
#   accountId: '${EXECUTION_CONTEXT_DEFAULTS.ACCOUNT_ID}'          # AWS account ID
#   region: '${EXECUTION_CONTEXT_DEFAULTS.REGION}'                # AWS region

`

  yamlContent = yamlContent.replace(/version: ['"]?1\.0['"]?\n/, `version: '1.0'\n${pathsComment}`)

  return yamlContent
}

function generatePlaceholderStateMachines(type: string): StateMachineConfig[] {
  switch (type) {
    case 'cdk':
      return [
        {
          name: 'example-workflow',
          source: {
            type: 'cdk',
            path: './cdk.out/MyStack.template.json',
            stateMachineName: 'MyStateMachine',
          },
        },
      ]

    case 'terraform':
      return [
        {
          name: 'example-workflow',
          source: {
            type: 'asl',
            path: './terraform/step-functions/example.asl.json',
          },
        },
      ]

    default:
      return [
        {
          name: 'example-workflow',
          source: {
            type: 'asl',
            path: './workflows/example.asl.json',
          },
        },
      ]
  }
}

function updateGitignore(): void {
  const sfnTestParentDir = dirname(DEFAULT_EXTRACTED_DIR).replace('./', '')

  const gitignoreContent = `
# sfn-test work directory
${sfnTestParentDir}/

# Environment variables
.env
`

  if (existsSync('.gitignore')) {
    const existing = readFileSync('.gitignore', 'utf-8')
    if (!existing.includes(`${sfnTestParentDir}/`)) {
      appendFileSync('.gitignore', gitignoreContent)
      console.log(chalk.green('  ✓ Updated .gitignore'))
    } else {
      console.log(chalk.gray('  ○ .gitignore already configured'))
    }
  } else {
    writeFileSync('.gitignore', gitignoreContent.trim())
    console.log(chalk.green('  ✓ Created .gitignore'))
  }
}

function generateSampleFiles(stateMachine: StateMachineInfo): void {
  const mockFile = `sfn-test/mocks/${stateMachine.name}.mock.yaml`
  const testFile = `sfn-test/test-suites/${stateMachine.name}.test.yaml`

  console.log(chalk.cyan('\n📄 Generating sample files...'))

  if (!existsSync(mockFile)) {
    const mockContent = `# Mock configuration for ${stateMachine.name}
version: "1.0"
mocks:
  - state: "ExampleTask"
    type: "fixed"
    response:
      status: "success"
      message: "Task completed"
      
  # Add more mocks as needed
  # - state: "AnotherTask"
  #   type: "conditional"
  #   conditions:
  #     - when:
  #         input:
  #           id: "test-001"
  #       response:
  #         result: "special case"
  #     - default:
  #         result: "normal case"
`
    writeFileSync(mockFile, mockContent)
    console.log(chalk.green(`  ✓ Created ${mockFile}`))
  }

  if (!existsSync(testFile)) {
    const testContent = `# Test suite for ${stateMachine.name}
version: "1.0"
name: "${stateMachine.name} Tests"
stateMachine: "${stateMachine.name}"
baseMock: "./sfn-test/mocks/${stateMachine.name}.mock.yaml"

testCases:
  - name: "Basic success path"
    description: "Verify the happy path execution"
    input:
      id: "test-001"
      data: "sample"
    expectedOutput:
      status: "success"
    expectedPath:
      - "ExampleTask"
      
  # Add more test cases
  # - name: "Error handling"
  #   input:
  #     id: "test-002"
  #     error: true
  #   expectedError:
  #     type: "States.TaskFailed"

settings:
  timeout: 10000
  verbose: false

assertions:
  outputMatching: "partial"
  pathMatching: "exact"
`
    writeFileSync(testFile, testContent)
    console.log(chalk.green(`  ✓ Created ${testFile}`))
  }
}

function displayNextSteps(projectInfo: ProjectInfo): void {
  console.log(chalk.bold('📋 Next steps:'))
  console.log(chalk.gray('─'.repeat(40)))

  if (
    projectInfo.type === 'cdk' &&
    (!projectInfo.cdkTemplates || projectInfo.cdkTemplates.length === 0)
  ) {
    console.log(chalk.cyan('  1. Run "cdk synth" to generate CloudFormation templates'))
    console.log(chalk.cyan('  2. Run "sfn-test init" again to detect state machines'))
    console.log(chalk.cyan('  3. Run "sfn-test extract" to extract state machines'))
  } else if (projectInfo.stateMachines.length > 0) {
    const firstMachine = projectInfo.stateMachines[0]?.name
    if (firstMachine) {
      console.log(chalk.cyan(`  1. Edit ./sfn-test/mocks/${firstMachine}.mock.yaml`))
      console.log(chalk.cyan(`  2. Edit ./sfn-test/test-suites/${firstMachine}.test.yaml`))
      console.log(
        chalk.cyan(
          `  3. Run "sfn-test test --suite ./sfn-test/test-suites/${firstMachine}.test.yaml"`,
        ),
      )
    }
  } else {
    console.log(chalk.cyan('  1. Add state machine definitions to sfn-test.config.yaml'))
    console.log(chalk.cyan('  2. Run "sfn-test generate mock --name <name>" to create mocks'))
    console.log(chalk.cyan('  3. Run "sfn-test generate test --name <name>" to create tests'))
  }

  console.log(chalk.gray('─'.repeat(40)))
  console.log(
    chalk.gray('\nFor more information: https://github.com/TAKEDA-Takashi/sfn-ai-local-test'),
  )
}
