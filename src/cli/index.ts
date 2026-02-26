#!/usr/bin/env node
import chalk from 'chalk'
import { Command } from 'commander'
import {
  DEFAULT_AI_MODEL,
  DEFAULT_AI_TIMEOUT_MS,
  DEFAULT_CONFIG_FILE,
  DEFAULT_TEST_REPORTER,
} from '../constants/defaults'
import { createExtractCommand } from './commands/extract'
import { generateCommand } from './commands/generate'
import { initCommand } from './commands/init'
import { runCommand } from './commands/run'

// Package info is injected at build time by tsup
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.1.0'
const DESCRIPTION =
  typeof __DESCRIPTION__ !== 'undefined'
    ? __DESCRIPTION__
    : 'AI-powered local testing tool for AWS Step Functions'

const program = new Command()

program
  .name('sfn-test')
  .description(chalk.blue(DESCRIPTION))
  .version(VERSION)
  .option('--config <path>', 'Path to configuration file', DEFAULT_CONFIG_FILE)

program
  .command('init')
  .description('Initialize a new sfn-test project')
  .option('-y, --yes', 'Skip interactive prompts and use defaults')
  .action(initCommand)

program
  .command('generate <type>')
  .description('Generate mock or test files using AI')
  .option('-n, --name <name>', 'State machine name from configuration')
  .option('-a, --asl <path>', 'Path to ASL JSON file')
  .option('-c, --cdk <path>', 'Path to CDK synth output')
  .option('--cdk-state-machine <name>', 'Logical ID of state machine in CDK template')
  .option('-o, --output <path>', 'Output file path')
  .option('-m, --mock <path>', 'Path to mock file (for test generation)')
  .option('--ai-model <model>', 'AI model to use', process.env.AI_MODEL || DEFAULT_AI_MODEL)
  .option('--timeout <ms>', 'AI generation timeout in milliseconds', String(DEFAULT_AI_TIMEOUT_MS))
  .option('--max-attempts <number>', 'Maximum generation attempts with validation feedback', '2')
  .option(
    '--concurrency <number>',
    'Maximum concurrent AI operations for multiple state machines',
    '1',
  )
  .option('--verbose', 'Enable verbose output during generation')
  .action(generateCommand)

program
  .command('run')
  .description('Run state machine tests or test suites')
  .option('-n, --name <name>', 'State machine name from configuration')
  .option('-a, --asl <path>', 'Path to ASL JSON file')
  .option('-c, --cdk <path>', 'Path to CDK synth output')
  .option('--cdk-state-machine <name>', 'Logical ID of state machine in CDK template')
  .option('-m, --mock <path>', 'Path to mock configuration file')
  .option('-i, --input <json>', 'Input JSON for the state machine')
  .option('-s, --suite <path>', 'Path to test suite YAML file')
  .option('-r, --reporter <type>', 'Test reporter (default|json|junit)', DEFAULT_TEST_REPORTER)
  .option('-o, --output <path>', 'Output file path (for json/junit reporters)')
  .option('--bail', 'Stop on first failure')
  .option('--verbose', 'Enable verbose output')
  .option('--quiet', 'Minimal output')
  .option('--cov [format]', 'Show coverage after execution (text|json|html)')
  .action(runCommand)

program.addCommand(createExtractCommand())

program.parse()
