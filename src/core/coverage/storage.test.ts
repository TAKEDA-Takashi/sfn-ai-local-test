import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateMachine } from '../../types/asl.js'
import { StateFactory } from '../../types/asl.js'
import { type CoverageStorage, CoverageStorageManager, type ExecutionRecord } from './storage.js'

vi.mock('node:fs')
vi.mock('node:crypto', () => ({
  default: {
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mock-hash-123'),
    })),
  },
}))

describe('CoverageStorageManager', () => {
  const mockExistsSync = vi.mocked(existsSync)
  const mockMkdirSync = vi.mocked(mkdirSync)
  const mockReadFileSync = vi.mocked(readFileSync)
  const mockWriteFileSync = vi.mocked(writeFileSync)

  const mockStateMachine: StateMachine = StateFactory.createStateMachine({
    StartAt: 'Start',
    States: {
      Start: {
        Type: 'Task',
        Resource: 'arn:aws:lambda:us-east-1:123456789012:function:TestFunction',
        End: true,
      },
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create default storage directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      new CoverageStorageManager()

      expect(mockExistsSync).toHaveBeenCalledWith('.sfn-test/coverage')
      expect(mockMkdirSync).toHaveBeenCalledWith('.sfn-test/coverage', { recursive: true })
    })

    it('should not create directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true)

      new CoverageStorageManager()

      expect(mockExistsSync).toHaveBeenCalledWith('.sfn-test/coverage')
      expect(mockMkdirSync).not.toHaveBeenCalled()
    })

    it('should use custom storage directory', () => {
      mockExistsSync.mockReturnValue(false)
      const customDir = '/custom/coverage/path'

      new CoverageStorageManager(customDir)

      expect(mockExistsSync).toHaveBeenCalledWith(customDir)
      expect(mockMkdirSync).toHaveBeenCalledWith(customDir, { recursive: true })
    })
  })

  describe('saveExecution', () => {
    let storageManager: CoverageStorageManager

    beforeEach(() => {
      mockExistsSync.mockReturnValue(true) // Directory exists
      storageManager = new CoverageStorageManager()
    })

    it('should create new storage file when it does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false) // Storage file doesn't exist

      storageManager.saveExecution(
        mockStateMachine,
        ['Start'],
        { input: 'test' },
        { output: 'result' },
        true,
      )

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '.sfn-test/coverage/mock-hash-123.json',
        expect.stringContaining('"stateMachineHash": "mock-hash-123"'),
      )

      const writeCall = mockWriteFileSync.mock.calls[0]
      const savedData = JSON.parse(writeCall?.[1] as string) as CoverageStorage
      expect(savedData.executions).toHaveLength(1)
      expect(savedData.executions[0]?.executionPath).toEqual(['Start'])
      expect(savedData.executions[0]?.input).toEqual({ input: 'test' })
      expect(savedData.executions[0]?.output).toEqual({ output: 'result' })
      expect(savedData.executions[0]?.success).toBe(true)
    })

    it('should append to existing storage file', () => {
      const existingStorage: CoverageStorage = {
        stateMachineHash: 'mock-hash-123',
        executions: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            executionPath: ['PreviousExecution'],
            input: { previous: true },
            output: { result: 'previous' },
            success: true,
          },
        ],
      }

      mockExistsSync.mockReturnValueOnce(true) // Storage file exists
      mockReadFileSync.mockReturnValue(JSON.stringify(existingStorage))

      storageManager.saveExecution(
        mockStateMachine,
        ['NewExecution'],
        { new: 'input' },
        { new: 'output' },
        false,
      )

      const writeCall = mockWriteFileSync.mock.calls[0]
      const savedData = JSON.parse(writeCall?.[1] as string) as CoverageStorage

      expect(savedData.executions).toHaveLength(2)
      expect(savedData.executions[0]).toEqual(existingStorage.executions[0])
      expect(savedData.executions[1]?.executionPath).toEqual(['NewExecution'])
      expect(savedData.executions[1]?.success).toBe(false)
    })

    it('should handle execution without input and output', () => {
      mockExistsSync.mockReturnValueOnce(false) // Storage file doesn't exist

      storageManager.saveExecution(mockStateMachine, ['SimpleExecution'])

      const writeCall = mockWriteFileSync.mock.calls[0]
      const savedData = JSON.parse(writeCall?.[1] as string) as CoverageStorage

      expect(savedData.executions[0]?.input).toBeUndefined()
      expect(savedData.executions[0]?.output).toBeUndefined()
      expect(savedData.executions[0]?.success).toBe(true)
    })
  })

  describe('loadExecutions', () => {
    let storageManager: CoverageStorageManager

    beforeEach(() => {
      mockExistsSync.mockReturnValue(true) // Directory exists
      storageManager = new CoverageStorageManager()
    })

    it('should return empty array when storage file does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false) // Storage file doesn't exist

      const result = storageManager.loadExecutions(mockStateMachine)

      expect(result).toEqual([])
    })

    it('should load and return execution records from existing file', () => {
      const mockExecutions: ExecutionRecord[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          executionPath: ['Start', 'Process', 'End'],
          input: { test: 'data' },
          output: { result: 'success' },
          success: true,
        },
        {
          timestamp: '2023-01-02T00:00:00.000Z',
          executionPath: ['Start', 'Error'],
          input: { test: 'error' },
          output: { error: 'failed' },
          success: false,
        },
      ]

      const mockStorage: CoverageStorage = {
        stateMachineHash: 'mock-hash-123',
        executions: mockExecutions,
      }

      mockExistsSync.mockReturnValueOnce(true) // Storage file exists
      mockReadFileSync.mockReturnValue(JSON.stringify(mockStorage))

      const result = storageManager.loadExecutions(mockStateMachine)

      expect(result).toEqual(mockExecutions)
    })
  })

  describe('clearExecutions', () => {
    let storageManager: CoverageStorageManager

    beforeEach(() => {
      mockExistsSync.mockReturnValue(true) // Directory exists
      storageManager = new CoverageStorageManager()
    })

    it('should clear executions in existing storage file', () => {
      mockExistsSync.mockReturnValueOnce(true) // Storage file exists

      storageManager.clearExecutions(mockStateMachine)

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '.sfn-test/coverage/mock-hash-123.json',
        expect.stringMatching(/"executions":\s*\[\s*\]/),
      )
    })

    it('should do nothing when storage file does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false) // Storage file doesn't exist

      storageManager.clearExecutions(mockStateMachine)

      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })
  })

  describe('hash generation consistency', () => {
    it('should generate same hash for identical state machines', () => {
      mockExistsSync.mockReturnValue(true) // Directory exists
      const storageManager = new CoverageStorageManager()

      const stateMachine1: StateMachine = StateFactory.createStateMachine({
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      })

      const stateMachine2: StateMachine = StateFactory.createStateMachine({
        StartAt: 'Start',
        States: { Start: { Type: 'Pass', End: true } },
      })

      mockExistsSync.mockReturnValue(false) // Storage files don't exist

      storageManager.saveExecution(stateMachine1, ['Test1'])
      storageManager.saveExecution(stateMachine2, ['Test2'])

      expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
      expect(mockWriteFileSync.mock.calls[0]?.[0]).toBe(mockWriteFileSync.mock.calls[1]?.[0])
    })
  })

  describe('custom storage directory', () => {
    it('should use custom directory for all operations', () => {
      const customDir = '/custom/test/coverage'
      mockExistsSync.mockReturnValue(true) // Directory exists
      const storageManager = new CoverageStorageManager(customDir)

      // Test save
      mockExistsSync.mockReturnValueOnce(false) // Storage file doesn't exist
      storageManager.saveExecution(mockStateMachine, ['Test'])

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/custom/test/coverage/mock-hash-123.json',
        expect.any(String),
      )

      // Test load
      mockExistsSync.mockReturnValueOnce(true) // Storage file exists
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          stateMachineHash: 'mock-hash-123',
          executions: [],
        }),
      )

      storageManager.loadExecutions(mockStateMachine)

      expect(mockReadFileSync).toHaveBeenCalledWith(
        '/custom/test/coverage/mock-hash-123.json',
        'utf-8',
      )

      // Test clear - file exists
      mockExistsSync.mockReturnValueOnce(true) // Storage file exists
      storageManager.clearExecutions(mockStateMachine)

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/custom/test/coverage/mock-hash-123.json',
        expect.stringMatching(/"executions":\s*\[\s*\]/),
      )
    })
  })
})
