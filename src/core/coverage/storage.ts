import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonValue, StateMachine } from '../../types/asl.js'

export interface ExecutionRecord {
  timestamp: string
  executionPath: string[]
  input?: JsonValue
  output?: JsonValue
  success: boolean
}

export interface CoverageStorage {
  stateMachineHash: string
  executions: ExecutionRecord[]
}

export class CoverageStorageManager {
  private storageDir: string

  constructor(storageDir: string = '.sfn-test/coverage') {
    this.storageDir = storageDir
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true })
    }
  }

  private getStateMachineHash(stateMachine: StateMachine): string {
    const content = JSON.stringify(stateMachine)
    return crypto.createHash('md5').update(content).digest('hex')
  }

  private getStoragePath(stateMachine: StateMachine): string {
    const hash = this.getStateMachineHash(stateMachine)
    return join(this.storageDir, `${hash}.json`)
  }

  saveExecution(
    stateMachine: StateMachine,
    executionPath: string[],
    input?: JsonValue,
    output?: JsonValue,
    success: boolean = true,
  ): void {
    const storagePath = this.getStoragePath(stateMachine)
    const hash = this.getStateMachineHash(stateMachine)

    let storage: CoverageStorage
    if (existsSync(storagePath)) {
      const content = readFileSync(storagePath, 'utf-8')
      storage = JSON.parse(content)
    } else {
      storage = {
        stateMachineHash: hash,
        executions: [],
      }
    }

    storage.executions.push({
      timestamp: new Date().toISOString(),
      executionPath,
      input,
      output,
      success,
    })

    writeFileSync(storagePath, JSON.stringify(storage, null, 2))
  }

  loadExecutions(stateMachine: StateMachine): ExecutionRecord[] {
    const storagePath = this.getStoragePath(stateMachine)

    if (!existsSync(storagePath)) {
      return []
    }

    const content = readFileSync(storagePath, 'utf-8')
    const storage: CoverageStorage = JSON.parse(content)

    return storage.executions
  }

  clearExecutions(stateMachine: StateMachine): void {
    const storagePath = this.getStoragePath(stateMachine)

    if (existsSync(storagePath)) {
      const hash = this.getStateMachineHash(stateMachine)
      const storage: CoverageStorage = {
        stateMachineHash: hash,
        executions: [],
      }
      writeFileSync(storagePath, JSON.stringify(storage, null, 2))
    }
  }
}
