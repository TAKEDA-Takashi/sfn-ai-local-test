import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'
import {
  ASL_FILE_EXTENSION,
  DEFAULT_CONFIG_FILE,
  DEFAULT_COVERAGE_DIR,
  DEFAULT_EXTRACTED_DIR,
  DEFAULT_MOCKS_DIR,
  DEFAULT_TEST_DATA_DIR,
  DEFAULT_TEST_SUITES_DIR,
  METADATA_FILE_EXTENSION,
  MOCK_FILE_EXTENSION,
  TEST_FILE_EXTENSION,
} from '../constants/defaults'
import type { JsonObject } from '../types/asl'
import { isJsonObject } from '../types/type-guards'
import { resolveCloudFormationIntrinsics } from '../utils/cloudformation-resolver'

export interface StateMachineConfig {
  name: string
  source: {
    type: 'cdk' | 'asl'
    path: string
    stateMachineName?: string // CDKの場合のみ必要
  }
}

export interface ProjectConfig {
  version: string
  paths?: {
    mocks?: string
    testSuites?: string
    testData?: string
    extracted?: string
    coverage?: string
  }
  stateMachines: StateMachineConfig[]
}

const DEFAULT_PATHS = {
  mocks: DEFAULT_MOCKS_DIR,
  testSuites: DEFAULT_TEST_SUITES_DIR,
  testData: DEFAULT_TEST_DATA_DIR,
  extracted: DEFAULT_EXTRACTED_DIR,
  coverage: DEFAULT_COVERAGE_DIR,
}

function validateProjectConfig(config: unknown): ProjectConfig {
  if (!isJsonObject(config)) {
    throw new Error('Invalid configuration file format')
  }

  // Validate version
  const version = typeof config.version === 'string' ? config.version : '1.0'

  // Validate paths
  let paths = DEFAULT_PATHS
  if (config.paths) {
    if (!isJsonObject(config.paths)) {
      throw new Error('Invalid paths configuration')
    }
    paths = { ...DEFAULT_PATHS, ...(config.paths as Record<string, string>) }
  }

  // Validate stateMachines
  const stateMachines: StateMachineConfig[] = []
  if (config.stateMachines) {
    if (!Array.isArray(config.stateMachines)) {
      throw new Error('stateMachines must be an array')
    }

    for (const machine of config.stateMachines) {
      if (!isJsonObject(machine)) {
        throw new Error('Invalid state machine configuration')
      }

      const name = machine.name
      const source = machine.source

      if (typeof name !== 'string') {
        throw new Error('State machine name must be a string')
      }

      if (!isJsonObject(source)) {
        throw new Error('State machine source must be an object')
      }

      const type = source.type
      const path = source.path
      const stateMachineName = source.stateMachineName

      if (type !== 'cdk' && type !== 'asl') {
        throw new Error('State machine source type must be "cdk" or "asl"')
      }

      if (typeof path !== 'string') {
        throw new Error('State machine source path must be a string')
      }

      if (stateMachineName !== undefined && typeof stateMachineName !== 'string') {
        throw new Error('State machine name in source must be a string if provided')
      }

      stateMachines.push({
        name,
        source: {
          type,
          path,
          stateMachineName,
        },
      })
    }
  }

  return {
    version,
    paths,
    stateMachines,
  }
}

export function loadProjectConfig(
  configPath: string = DEFAULT_CONFIG_FILE,
  required: boolean = true,
): ProjectConfig | null {
  if (!existsSync(configPath)) {
    if (required) {
      throw new Error(`Configuration file not found: ${configPath}`)
    }
    return null
  }

  const content = readFileSync(configPath, 'utf-8')
  const rawConfig = load(content)

  // Validate and transform the raw YAML data into typed ProjectConfig
  return validateProjectConfig(rawConfig)
}

export function findStateMachine(config: ProjectConfig, name: string): StateMachineConfig | null {
  if (!(config.stateMachines && Array.isArray(config.stateMachines))) {
    return null
  }
  return config.stateMachines.find((sm) => sm.name === name) || null
}

export function resolveStateMachinePath(stateMachine: StateMachineConfig): string {
  if (stateMachine.source.type === 'asl') {
    return resolve(stateMachine.source.path)
  }

  // CDKの場合
  return resolve(stateMachine.source.path)
}

export function loadStateMachineDefinition(stateMachine: StateMachineConfig): JsonObject {
  const path = resolveStateMachinePath(stateMachine)

  if (!existsSync(path)) {
    throw new Error(`State machine source file not found: ${path}`)
  }

  if (stateMachine.source.type === 'asl') {
    const content = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(content)
    if (!isJsonObject(parsed)) {
      throw new Error('Invalid ASL file format')
    }
    return parsed
  }

  // CDKの場合、キャッシュされたASLファイルをチェック
  if (stateMachine.source.type === 'cdk') {
    const config = loadProjectConfig()
    const extractedPath = join(
      config?.paths?.extracted || DEFAULT_EXTRACTED_DIR,
      `${stateMachine.name}${ASL_FILE_EXTENSION}`,
    )
    const metadataPath = join(
      config?.paths?.extracted || DEFAULT_EXTRACTED_DIR,
      `${stateMachine.name}${METADATA_FILE_EXTENSION}`,
    )

    // キャッシュの有効性をチェック
    if (existsSync(extractedPath) && existsSync(metadataPath)) {
      const sourceStats = statSync(path)
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))
      if (!isJsonObject(metadata)) {
        throw new Error('Invalid metadata file format')
      }

      // ソースファイルが変更されていなければキャッシュを使用
      if (
        metadata.sourceModifiedTime &&
        (typeof metadata.sourceModifiedTime === 'string' ||
          typeof metadata.sourceModifiedTime === 'number') &&
        new Date(metadata.sourceModifiedTime).getTime() >= sourceStats.mtime.getTime()
      ) {
        console.log(`📋 Using cached ASL for ${stateMachine.name}`)
        const content = readFileSync(extractedPath, 'utf-8')
        const parsed = JSON.parse(content)
        if (!isJsonObject(parsed)) {
          throw new Error('Invalid cached ASL file format')
        }
        return parsed
      }
    }

    // キャッシュがないか古い場合は抽出して保存
    console.log(`🔄 Extracting ASL from CDK template for ${stateMachine.name}...`)

    const content = readFileSync(path, 'utf-8')
    const data = JSON.parse(content)
    if (!isJsonObject(data)) {
      throw new Error('Invalid CloudFormation template format')
    }

    if (!stateMachine.source.stateMachineName) {
      throw new Error('stateMachineName is required for CDK source')
    }

    const resources = data.Resources
    if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
      throw new Error('Resources not found or invalid in CloudFormation template')
    }

    const resource = resources[stateMachine.source.stateMachineName]
    if (!resource) {
      throw new Error(
        `State machine ${stateMachine.source.stateMachineName} not found in CloudFormation template`,
      )
    }

    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      throw new Error(`Invalid resource for ${stateMachine.source.stateMachineName}`)
    }

    if (resource.Type !== 'AWS::StepFunctions::StateMachine') {
      throw new Error(
        `Resource ${stateMachine.source.stateMachineName} is not a Step Functions state machine`,
      )
    }

    const properties = resource.Properties
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      throw new Error(`Invalid Properties for ${stateMachine.source.stateMachineName}`)
    }

    const definitionRaw = properties.Definition || properties.DefinitionString
    if (!definitionRaw) {
      throw new Error(
        `State machine definition not found for ${stateMachine.source.stateMachineName}`,
      )
    }

    // CloudFormation組み込み関数を解決
    const parameters =
      data.Parameters && typeof data.Parameters === 'object' && !Array.isArray(data.Parameters)
        ? data.Parameters
        : {}

    const resolvedDefinition = resolveCloudFormationIntrinsics(definitionRaw, resources, parameters)

    // DefinitionStringの場合はJSONをパース
    let definition: JsonObject
    if (typeof resolvedDefinition === 'string') {
      const parsed = JSON.parse(resolvedDefinition)
      if (!isJsonObject(parsed)) {
        throw new Error(
          `Invalid state machine definition format for ${stateMachine.source.stateMachineName}`,
        )
      }
      definition = parsed
    } else if (isJsonObject(resolvedDefinition)) {
      definition = resolvedDefinition
    } else {
      throw new Error(
        `Invalid state machine definition for ${stateMachine.source.stateMachineName}`,
      )
    }

    // 抽出結果を保存
    saveExtractedASL(stateMachine, definition, path)

    return definition
  }

  throw new Error(`Unknown source type: ${stateMachine.source.type}`)
}

function saveExtractedASL(
  stateMachine: StateMachineConfig,
  definition: JsonObject,
  sourcePath: string,
): void {
  const config = loadProjectConfig()
  const extractedDir = config?.paths?.extracted || DEFAULT_EXTRACTED_DIR
  const extractedPath = join(extractedDir, `${stateMachine.name}${ASL_FILE_EXTENSION}`)
  const metadataPath = join(extractedDir, `${stateMachine.name}${METADATA_FILE_EXTENSION}`)

  // ディレクトリ作成
  if (!existsSync(extractedDir)) {
    mkdirSync(extractedDir, { recursive: true })
  }

  // ASL定義を保存
  writeFileSync(extractedPath, JSON.stringify(definition, null, 2), 'utf-8')

  // メタデータを保存
  const metadata = {
    name: stateMachine.name,
    source: stateMachine.source,
    extractedAt: new Date().toISOString(),
    sourceModifiedTime: statSync(sourcePath).mtime.toISOString(),
    stateCount: Object.keys(definition.States || {}).length,
  }
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
}

export function resolveMockPath(config: ProjectConfig, stateMachineName: string): string {
  const mocksDir = config.paths?.mocks || DEFAULT_PATHS.mocks
  return join(mocksDir, `${stateMachineName}${MOCK_FILE_EXTENSION}`)
}

export function resolveTestSuitePath(config: ProjectConfig, stateMachineName: string): string {
  const testSuitesDir = config.paths?.testSuites || DEFAULT_PATHS.testSuites
  return join(testSuitesDir, `${stateMachineName}${TEST_FILE_EXTENSION}`)
}
