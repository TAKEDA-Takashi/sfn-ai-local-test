import { exec } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { DEFAULT_AI_TIMEOUT_MS } from '../../constants/defaults'
import type { StateMachine } from '../../types/asl'

const execAsync = promisify(exec)

/**
 * Claude CLIを使用してモック設定を生成
 * Claude Codeの認証を利用するため、APIキーは不要
 */
export async function generateMockWithClaudeCLI(
  stateMachine: StateMachine,
  timeout: number = DEFAULT_AI_TIMEOUT_MS,
  _aslFilePath?: string, // Prefixed with _ to indicate intentionally unused
  maxAttempts: number = 2, // Default to 2 attempts for better accuracy
): Promise<string> {
  // Import builders dynamically to avoid circular dependencies
  const { PromptBuilder } = await import('../generation/prompt-builder')
  const { StateMachineValidator } = await import('../validation/state-machine-validator')
  const { GenerationRetryManager } = await import('../generation/generation-retry-manager')

  // If maxAttempts is 1, use the original logic
  if (maxAttempts === 1) {
    const promptBuilder = new PromptBuilder()
    const prompt = promptBuilder.buildMockPrompt(stateMachine)

    // Logging moved to runClaudeCLI to avoid duplication

    const result = await runClaudeCLI(prompt, timeout)

    // Validate and auto-fix
    const validator = new StateMachineValidator()
    const issues = validator.validateMockContent(result, stateMachine)
    if (issues.length > 0) {
      console.log('🔍 Validation issues found:')
      console.log(validator.formatReport(issues))
    }

    return validator.autoFix(result, 'mock', stateMachine)
  }

  // Use generation cycle for multiple attempts
  console.log(`🔄 Using generation cycle with max ${maxAttempts} attempts`)

  const validator = new StateMachineValidator()
  const promptBuilder = new PromptBuilder()

  // Create a generator function that uses feedback
  const generator = (feedbackPrompt: string) => {
    let prompt = promptBuilder.buildMockPrompt(stateMachine)

    // Inject feedback if provided
    if (feedbackPrompt) {
      // Find the position after the state machine definition to inject feedback
      const stateDefEnd = prompt.indexOf('Generate a mock configuration')
      if (stateDefEnd > -1) {
        prompt = prompt.slice(0, stateDefEnd) + feedbackPrompt + prompt.slice(stateDefEnd)
      } else {
        // Fallback: prepend feedback
        prompt = feedbackPrompt + prompt
      }
    }

    return runClaudeCLI(prompt, timeout)
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
    if (result.issues.length > 0) {
      const warnings = result.issues.filter((i) => i.level === 'warning')
      if (warnings.length > 0) {
        console.log(`⚠️ ${warnings.length} warning(s) remain but are acceptable`)
      }
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

  return result.content
}

/**
 * Claude CLIを使用してテストケースを生成
 * Claude Codeの認証を利用するため、APIキーは不要
 */
export async function generateTestWithClaudeCLI(
  stateMachine: StateMachine,
  timeout: number = DEFAULT_AI_TIMEOUT_MS,
  mockContent?: string,
  mockPath?: string,
  aslPath?: string,
  outputPath?: string,
  verbose = false,
): Promise<string> {
  // Import builders dynamically to avoid circular dependencies
  const { PromptBuilder } = await import('../generation/prompt-builder')
  const { StateMachineValidator } = await import('../validation/state-machine-validator')

  console.log('🚀 Using prompt builder for test generation')
  const promptBuilder = new PromptBuilder()
  const prompt = promptBuilder.buildTestPrompt(stateMachine, mockContent, verbose)

  // Logging moved to runClaudeCLI to avoid duplication

  const result = await runClaudeCLI(prompt, timeout)

  // Validate and auto-fix
  const validator = new StateMachineValidator()
  const issues = validator.validateTestContent(result, stateMachine)
  if (issues.length > 0) {
    console.log('🔍 Validation issues found:')
    console.log(validator.formatReport(issues))
  }

  const fixed = validator.autoFix(result, 'test', stateMachine)
  const corrected = await correctFilePaths(fixed, aslPath, mockPath, outputPath)
  return corrected
}

/**
 * テスト生成結果のファイルパスを修正
 * Exported for testing purposes
 */
export async function correctFilePaths(
  content: string,
  aslPath?: string,
  mockPath?: string,
  outputPath?: string, // Now used for relative path calculations
): Promise<string> {
  let corrected = content

  // Update YAML field with the given value
  const updateYamlField = (yaml: string, fieldName: string, value: string): string => {
    const fieldRegex = new RegExp(`^${fieldName}:\\s*"?[^"\\n]*"?`, 'm')
    if (fieldRegex.test(yaml)) {
      return yaml.replace(fieldRegex, `${fieldName}: "${value}"`)
    } else {
      // Add field if it doesn't exist
      const nameMatch = yaml.match(/^name:\s*"[^"]*"/m)
      if (nameMatch) {
        const insertPos = yaml.indexOf(nameMatch[0]) + nameMatch[0].length
        return `${yaml.slice(0, insertPos)}\n${fieldName}: "${value}"${yaml.slice(insertPos)}`
      }
    }
    return yaml
  }

  // Calculate relative path from output directory to target file
  const calculateRelativePath = (targetPath: string, outputPath: string): string => {
    // If no outputPath provided, use simple filename
    if (!outputPath) {
      return `./${basename(targetPath)}`
    }

    // Calculate relative path from output directory to target file
    const outputDir = dirname(outputPath)
    const relativePath = relative(outputDir, targetPath)

    // Ensure path starts with './' or '../'
    if (relativePath.startsWith('..')) {
      return relativePath // Already starts with '../'
    }

    if (relativePath.startsWith('.')) {
      return relativePath // Already starts with './'
    }

    // For same-directory or subdirectory paths, add './'
    return `./${relativePath}`
  }

  // Check for name-based configuration - if available, use names instead of paths
  if (aslPath) {
    const aslFilename = aslPath.split('/').pop() || aslPath
    const nameWithoutExt = aslFilename.replace(/\.(asl\.)?json$/, '')

    // Try to detect if this is a name-based setup vs path-based
    if (await hasNameBasedConfig(nameWithoutExt)) {
      corrected = updateYamlField(corrected, 'stateMachine', nameWithoutExt)
    } else {
      const relativePath = outputPath
        ? calculateRelativePath(aslPath, outputPath)
        : `./${aslFilename}`
      corrected = updateYamlField(corrected, 'stateMachine', relativePath)
    }
  }

  if (mockPath) {
    const mockFilename = mockPath.split('/').pop() || mockPath
    const nameWithoutExt = mockFilename.replace(/\.mock\.yaml$/, '')

    if (await hasNameBasedConfig(nameWithoutExt)) {
      corrected = updateYamlField(corrected, 'baseMock', nameWithoutExt)
    } else {
      const relativePath = outputPath
        ? calculateRelativePath(mockPath, outputPath)
        : `./${mockFilename}`
      corrected = updateYamlField(corrected, 'baseMock', relativePath)
    }
  }

  return corrected
}

/**
 * Claude CLIを実行
 */
async function runClaudeCLI(
  prompt: string,
  timeout: number = DEFAULT_AI_TIMEOUT_MS,
): Promise<string> {
  // Save prompt to temp file to avoid shell escaping issues
  const tmpFile = join(tmpdir(), `claude-prompt-${Date.now()}.txt`)
  const promptSizeKB = Buffer.byteLength(prompt) / 1024

  console.log(`🕒 Using timeout: ${timeout}ms (${Math.round(timeout / 1000)}s)`)
  console.log(`📝 Prompt size: ${promptSizeKB.toFixed(1)}KB`)

  try {
    // Use claude with --print and --output-format for non-interactive mode
    // Add explicit instruction to avoid file creation prompts
    const modifiedPrompt = `${prompt}\n\nIMPORTANT: Do not ask to create files. Return only the YAML content directly.`
    writeFileSync(tmpFile, modifiedPrompt)

    const { stdout, stderr } = await execAsync(
      `claude --print --output-format text < "${tmpFile}"`,
      {
        env: { ...process.env },
        maxBuffer: 1024 * 1024 * 10, // 10MB
        shell: '/bin/bash',
        timeout: timeout,
      },
    )

    if (stderr && !stderr.includes('warning')) {
      console.warn('Claude CLI stderr:', stderr)
    }

    // Clean up the output
    let yaml = stdout.trim()

    // Remove any explanatory text before YAML
    // Look for "version:" as the start of actual YAML
    const versionIndex = yaml.search(/^version:\s*["']?\d/m)
    if (versionIndex > 0) {
      // There's text before "version:", remove it
      yaml = yaml.substring(versionIndex)
    }

    // Remove markdown code blocks if present
    if (yaml.includes('```')) {
      // Extract content between ```yaml and ```
      const match = yaml.match(/```(?:yaml|yml)?\n([\s\S]*?)```/)
      if (match?.[1]) {
        yaml = match[1].trim()
      } else {
        // Remove all ``` markers
        yaml = yaml.replace(/```[a-z]*\n?/g, '').replace(/\n?```/g, '')
      }
    }

    // Remove any trailing explanation after the YAML
    // Look for common patterns that indicate end of YAML
    const endPatterns = [
      /\n\n[A-Z][\w\s]+:/, // New paragraph starting with capital letter
      /\n\nThis [\w\s]+/, // Explanatory text
      /\n\nThe [\w\s]+/, // Explanatory text
      /\n\nI've [\w\s]+/, // Assistant commentary
    ]

    for (const pattern of endPatterns) {
      const match = yaml.search(pattern)
      if (match > 0) {
        yaml = yaml.substring(0, match)
      }
    }

    return yaml.trim()
  } catch (error) {
    // Provide more detailed error information
    if (error && typeof error === 'object') {
      const errorObj = error as Record<string, unknown>
      if (errorObj.killed && errorObj.signal === 'SIGTERM') {
        throw new Error(
          `Claude CLI timed out after ${timeout}ms. Consider simplifying the state machine or increasing timeout.`,
        )
      }
      if (
        errorObj.code === 'ENOENT' ||
        (typeof errorObj.message === 'string' && errorObj.message.includes('command not found'))
      ) {
        throw new Error(
          'Claude CLI not found. Please install Claude Code or use ANTHROPIC_API_KEY for direct API access.',
        )
      }
      console.error('Claude CLI error details:', {
        code: errorObj.code,
        signal: errorObj.signal,
        killed: errorObj.killed,
        message: errorObj.message,
      })
    }
    throw error
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tmpFile)
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Claude CLIが利用可能かチェック
 */
export async function isClaudeCLIAvailable(): Promise<boolean> {
  try {
    await execAsync('which claude')
    return true
  } catch {
    return false
  }
}

/**
 * 設定ファイルが名前ベースの設定を使用しているかチェック
 * Exported for testing purposes
 */
export async function hasNameBasedConfig(stateMachineName: string): Promise<boolean> {
  try {
    const { loadProjectConfig } = await import('../../config/loader')
    const config = loadProjectConfig(undefined, false) // Don't require config file to exist

    if (!config?.stateMachines) return false

    const machine = config.stateMachines.find(
      (sm: { name: string }) => sm.name === stateMachineName,
    )
    return machine != null
  } catch (_error) {
    // For debugging: uncomment to see what went wrong
    // console.error('Error loading config:', error)
    return false
  }
}
