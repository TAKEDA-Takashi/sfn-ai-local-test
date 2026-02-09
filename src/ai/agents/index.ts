import { Anthropic } from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import { DEFAULT_AI_MAX_TOKENS } from '../../constants/defaults'
import type { StateMachine } from '../../types/asl'
import { GenerationRetryManager } from '../generation/generation-retry-manager'
import { PromptBuilder } from '../generation/prompt-builder'
import { StateMachineValidator } from '../validation/state-machine-validator'
import {
  correctFilePaths,
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

/**
 * Anthropic API を呼び出してテキストレスポンスを取得する
 */
async function callAnthropicAPI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: DEFAULT_AI_MAX_TOKENS,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = response.content[0]
  if (content && content.type === 'text') {
    return content.text.trim()
  }

  throw new Error('Unexpected response from AI')
}

export async function generateMockWithAI(
  stateMachine: StateMachine,
  model: string,
  timeout: number = 300000,
  maxAttempts: number = 2,
): Promise<string> {
  // Prefer Claude CLI when available
  if (await isClaudeCLIAvailable()) {
    console.log('Using Claude CLI (Claude Code authentication)...')
    return generateMockWithClaudeCLI(stateMachine, timeout, undefined, maxAttempts)
  }

  // Use direct API with retry and validation
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }

  const promptBuilder = new PromptBuilder()
  const validator = new StateMachineValidator()

  if (maxAttempts <= 1) {
    const { system, user } = promptBuilder.buildStructuredMockPrompt(stateMachine)
    const result = await callAnthropicAPI(system, user, model)

    const issues = validator.validateMockContent(result, stateMachine)
    if (issues.length > 0) {
      console.log('🔍 Validation issues found:')
      console.log(validator.formatReport(issues))
    }

    return validator.autoFix(result, 'mock', stateMachine)
  }

  // Use generation cycle for multiple attempts
  console.log(`🔄 Using generation cycle with max ${maxAttempts} attempts`)

  const generator = (feedbackPrompt: string) => {
    const { system, user } = promptBuilder.buildStructuredMockPrompt(stateMachine)
    const userWithFeedback = feedbackPrompt ? `${feedbackPrompt}\n\n${user}` : user
    return callAnthropicAPI(system, userWithFeedback, model)
  }

  const retryManager = new GenerationRetryManager(generator, validator)
  const result = await retryManager.generate({
    stateMachine,
    maxAttempts,
    type: 'mock',
    timeout,
    retryOnTimeout: true,
  })

  if (result.success) {
    console.log(`✅ Generation succeeded after ${result.attempts} attempt(s)`)
    const warnings = result.issues.filter((i) => i.level === 'warning')
    if (warnings.length > 0) {
      console.log(`⚠️ ${warnings.length} warning(s) remain but are acceptable`)
    }
  } else {
    console.log(`❌ Generation failed after ${result.attempts} attempt(s)`)
    if (result.error) {
      throw new Error(result.error)
    }
    if (result.issues.length > 0) {
      console.log('🔍 Remaining validation issues:')
      console.log(validator.formatReport(result.issues))
    }
  }

  return validator.autoFix(result.content, 'mock', stateMachine)
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
  // Prefer Claude CLI when available
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

  // Use direct API with validation and auto-fix
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }

  const promptBuilder = new PromptBuilder()
  const validator = new StateMachineValidator()

  const { system, user } = promptBuilder.buildStructuredTestPrompt(stateMachine, mockContent)
  const result = await callAnthropicAPI(system, user, model)

  const issues = validator.validateTestContent(result, stateMachine)
  if (issues.length > 0) {
    console.log('🔍 Validation issues found:')
    console.log(validator.formatReport(issues))
  }

  const fixed = validator.autoFix(result, 'test', stateMachine)
  return correctFilePaths(fixed, aslPath, mockPath, outputPath)
}
