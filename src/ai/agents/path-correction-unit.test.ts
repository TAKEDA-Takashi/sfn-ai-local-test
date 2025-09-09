import { describe, expect, it } from 'vitest'
import { correctFilePaths } from './claude-cli'

describe('correctFilePaths function', () => {
  it('should calculate correct relative paths when output is in same directory', async () => {
    const testContent = `version: "1.0"
name: "Test Suite"
stateMachine: "./workflow.asl.json"
baseMock: "./mock.yaml"
testCases:
  - name: "test"
    input: {}`

    const result = await correctFilePaths(
      testContent,
      './workflow.asl.json',
      './mock.yaml',
      './test.yaml',
    )

    // 同じディレクトリ内では相対パスを維持
    expect(result).toContain('stateMachine: "./workflow.asl.json"')
    expect(result).toContain('baseMock: "./mock.yaml"')
  })

  it('should calculate correct relative paths when output is in subdirectory', async () => {
    const testContent = `version: "1.0"
name: "Test Suite"  
stateMachine: "./workflow.asl.json"
baseMock: "./mock.yaml"
testCases:
  - name: "test"
    input: {}`

    const result = await correctFilePaths(
      testContent,
      './workflow.asl.json',
      './mock.yaml',
      './subfolder/test.yaml',
    )

    // サブディレクトリから親ディレクトリへの相対パス
    expect(result).toContain('stateMachine: "../workflow.asl.json"')
    expect(result).toContain('baseMock: "../mock.yaml"')
  })

  it('should calculate correct relative paths when output is in parent directory', async () => {
    const testContent = `version: "1.0"
name: "Test Suite"
stateMachine: "./workflow.asl.json"
baseMock: "./mock.yaml"
testCases:
  - name: "test"
    input: {}`

    const result = await correctFilePaths(
      testContent,
      './subfolder/workflow.asl.json',
      './subfolder/mock.yaml',
      './test.yaml',
    )

    // 親ディレクトリからサブディレクトリへの相対パス
    expect(result).toContain('stateMachine: "./subfolder/workflow.asl.json"')
    expect(result).toContain('baseMock: "./subfolder/mock.yaml"')
  })

  it('should handle complex relative paths', async () => {
    const testContent = `version: "1.0"
name: "Test Suite"
stateMachine: "./workflow.asl.json"
baseMock: "./mock.yaml"
testCases:
  - name: "test"
    input: {}`

    const result = await correctFilePaths(
      testContent,
      './src/workflows/workflow.asl.json',
      './mocks/workflow.mock.yaml',
      './tests/integration/test.yaml',
    )

    // 複雑なディレクトリ構造でも正しい相対パスを計算
    expect(result).toContain('stateMachine: "../../src/workflows/workflow.asl.json"')
    expect(result).toContain('baseMock: "../../mocks/workflow.mock.yaml"')
  })

  it('should fall back to simple filenames when outputPath is not provided', async () => {
    const testContent = `version: "1.0"
name: "Test Suite"
stateMachine: "./workflow.asl.json"
baseMock: "./mock.yaml"
testCases:
  - name: "test"
    input: {}`

    const result = await correctFilePaths(
      testContent,
      './src/workflows/workflow.asl.json',
      './mocks/workflow.mock.yaml',
      // outputPath未指定のケース
    )

    // outputPathがない場合はファイル名のみを使用
    expect(result).toContain('stateMachine: "./workflow.asl.json"')
    expect(result).toContain('baseMock: "./workflow.mock.yaml"')
  })
})
