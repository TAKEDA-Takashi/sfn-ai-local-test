import * as fs from 'node:fs'
import * as path from 'node:path'
import { Command } from 'commander'
import { loadProjectConfig } from '../../config/loader'
import { DEFAULT_CONFIG_FILE } from '../../constants/defaults'
import type { StateMachineExtraction } from '../../core/parser/cloudformation'
import { CloudFormationParser } from '../../core/parser/cloudformation'

export function createExtractCommand(): Command {
  const command = new Command('extract')
    .description('Extract Step Functions state machines from CDK/CloudFormation templates')
    .option('-c, --cdk <path>', 'Path to CDK synth output')
    .option('-d, --cdk-out <dir>', 'CDK output directory path (e.g., cdk.out)')
    .option('--cdk-state-machine <id>', 'Logical ID of state machine in CDK template')
    .option('-o, --output <dir>', 'Output directory for extracted files')
    .option('--name <name>', 'Extract specific state machine from config by name')
    .action(async (options) => {
      try {
        console.log('🔍 Extracting Step Functions state machines...\n')

        if (!(options.cdk || options.cdkOut) && fs.existsSync(DEFAULT_CONFIG_FILE)) {
          extractFromConfig(options)
          return
        }

        const outputDir = options.output || './.sfn-test/extracted'
        const stateMachines = await extractStateMachines(options)

        if (stateMachines.length === 0) {
          console.log('❌ No Step Functions state machines found.')
          return
        }

        console.log(`✅ Found ${stateMachines.length} state machine(s):\n`)

        for (const sm of stateMachines) {
          console.log(`📋 ${sm.stateMachineName} (${sm.logicalId})`)
          const states = sm.definition.States
          if (states && typeof states === 'object') {
            console.log(`   States: ${Object.keys(states).length}`)
          }
          console.log(`   Start: ${sm.definition.StartAt}`)
          console.log()

          await processStateMachine(sm, { ...options, output: outputDir })
        }

        console.log('🎉 Extraction completed!')
      } catch (error) {
        console.error('❌ Extraction failed:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })

  return command
}

function extractFromConfig(options: { output?: string; name?: string }): void {
  const config = loadProjectConfig()
  if (!config) {
    console.log('ℹ️  No configuration file found (sfn-test.config.yaml)')
    return
  }
  const outputDir = options.output || config.paths?.extracted || './.sfn-test/extracted'

  if (!config.stateMachines) {
    console.log('ℹ️  No state machines configured in sfn-test.config.yaml')
    return
  }

  const cdkStateMachines = config.stateMachines.filter((sm) => sm.source.type === 'cdk')

  if (cdkStateMachines.length === 0) {
    console.log('ℹ️  No CDK state machines found in config.')
    return
  }

  if (options.name) {
    const target = cdkStateMachines.find((sm) => sm.name === options.name)
    if (!target) {
      throw new Error(`State machine '${options.name}' not found or is not a CDK type`)
    }
    cdkStateMachines.length = 0
    cdkStateMachines.push(target)
  }

  const parser = new CloudFormationParser()

  for (const smConfig of cdkStateMachines) {
    console.log(`📄 Processing: ${smConfig.name}`)
    console.log(`   Template: ${smConfig.source.path}`)

    const template = CloudFormationParser.loadTemplate(smConfig.source.path)
    const extraction = parser.extractStateMachineById(
      template,
      smConfig.source.stateMachineName || '',
    )

    if (!extraction) {
      console.error(
        `❌ Failed to extract ${smConfig.source.stateMachineName} from ${smConfig.source.path}`,
      )
      continue
    }

    const outputPath = path.join(outputDir, `${smConfig.name}.asl.json`)

    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(outputPath, JSON.stringify(extraction.definition, null, 2), 'utf-8')
    console.log(`   ✅ Saved to: ${outputPath}`)

    const metadataPath = path.join(dir, `${smConfig.name}.metadata.json`)
    const metadata = {
      name: smConfig.name,
      source: smConfig.source,
      extractedAt: new Date().toISOString(),
      sourceModifiedTime: fs.statSync(smConfig.source.path).mtime.toISOString(),
      stateMachineName: extraction.stateMachineName,
      logicalId: extraction.logicalId,
      stateCount:
        extraction.definition.States && typeof extraction.definition.States === 'object'
          ? Object.keys(extraction.definition.States).length
          : 0,
    }
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  console.log('\n✨ Extraction completed!')
}

function extractStateMachines(options: {
  cdk?: string
  cdkStateMachine?: string
  cdkOut?: string
  output?: string
}): StateMachineExtraction[] {
  const parser = new CloudFormationParser()
  let stateMachines: StateMachineExtraction[] = []

  if (options.cdk) {
    console.log(`📄 Loading template: ${options.cdk}`)
    const template = CloudFormationParser.loadTemplate(options.cdk)

    if (options.cdkStateMachine) {
      const sm = parser.extractStateMachineById(template, options.cdkStateMachine)
      if (sm) {
        stateMachines.push(sm)
      } else {
        throw new Error(`State machine ${options.cdkStateMachine} not found in template`)
      }
    } else {
      stateMachines = parser.extractStateMachines(template)
    }
  } else {
    console.log(`📁 Scanning CDK output directory: ${options.cdkOut}`)

    const templatePaths = CloudFormationParser.findTemplatesInCdkOut(options.cdkOut || './cdk.out')
    console.log(`   Found ${templatePaths.length} template(s)`)

    const results = CloudFormationParser.findStateMachinesInTemplates(templatePaths)

    for (const [templatePath, sms] of results) {
      console.log(`   📄 ${path.basename(templatePath)}: ${sms.length} state machine(s)`)

      if (options.cdkStateMachine) {
        const found = sms.find((sm) => sm.logicalId === options.cdkStateMachine)
        if (found) {
          stateMachines.push(found)
        }
      } else {
        stateMachines.push(...sms)
      }
    }
  }

  return stateMachines
}

function processStateMachine(sm: StateMachineExtraction, options: { output?: string }): void {
  const outputDir = path.resolve(options.output || './.sfn-test/extracted')
  const smDir = path.join(outputDir, sm.logicalId)

  if (!fs.existsSync(smDir)) {
    fs.mkdirSync(smDir, { recursive: true })
  }

  const aslPath = path.join(smDir, `${sm.logicalId}.asl.json`)
  console.log(`💾 Saving ASL definition: ${aslPath}`)
  fs.writeFileSync(aslPath, JSON.stringify(sm.definition, null, 2), 'utf-8')

  const metadataPath = path.join(smDir, 'metadata.json')
  const metadata = {
    stateMachineName: sm.stateMachineName,
    logicalId: sm.logicalId,
    roleArn: sm.roleArn,
    extractedAt: new Date().toISOString(),
    stateCount:
      sm.definition.States && typeof sm.definition.States === 'object'
        ? Object.keys(sm.definition.States).length
        : 0,
    startAt: sm.definition.StartAt,
    states:
      sm.definition.States && typeof sm.definition.States === 'object'
        ? Object.keys(sm.definition.States)
        : [],
  }
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  console.log(`📋 Metadata saved: ${metadataPath}`)
  console.log()
  console.log(`✨ To generate mocks and tests, run:`)
  console.log(`   sfn-test generate mock --asl ${aslPath}`)
  console.log(`   sfn-test generate test --asl ${aslPath}`)
}
