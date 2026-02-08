import { Anthropic } from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import type { StateMachine } from '../../types/asl'
import { PromptBuilder } from '../generation/prompt-builder'
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
async function callAnthropicAPI(prompt: string, model: string): Promise<string> {
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }

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

  // Use direct API when available
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }

  const promptBuilder = new PromptBuilder()
  const prompt = promptBuilder.buildMockPrompt(stateMachine)

  return callAnthropicAPI(prompt, model)
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

  // Use direct API when available
  if (!anthropic) {
    throw new Error(
      'Neither Claude CLI nor ANTHROPIC_API_KEY is available. Please install Claude Code or set up an API key.',
    )
  }

  const promptBuilder = new PromptBuilder()
  const prompt = promptBuilder.buildTestPrompt(stateMachine, mockContent)

  const result = await callAnthropicAPI(prompt, model)
  return correctFilePaths(result, aslPath, mockPath, outputPath)
}
