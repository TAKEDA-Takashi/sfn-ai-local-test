import { describe, expect, it } from 'vitest'
import { TestSuiteValidator } from './validator'

describe('TestSuiteValidator', () => {
  describe('Unknown key detection', () => {
    it('should detect unknown top-level keys', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCase: [], // Should be testCases
        unknownKey: 'value',
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCase',
          message: 'Unknown key "testCase". Did you mean "testCases"?',
          severity: 'error',
        }),
      )
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'unknownKey',
          message: 'Unknown key "unknownKey"',
          severity: 'error',
        }),
      )
    })

    it('should detect typos in mapExpectations', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [
          {
            name: 'test1',
            input: {},
            mapExpectations: [
              {
                state: 'MapState',
                iterationPath: [['State1']], // Should be iterationPaths
              },
            ],
          },
        ],
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0].mapExpectations[0]',
          message: 'Unknown key "iterationPath". Did you mean "iterationPaths"?',
          severity: 'error',
        }),
      )
    })

    it('should suggest corrections for similar keys', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [
          {
            name: 'test1',
            input: {},
            expectedOuput: 'result', // Typo: expectedOutput
          },
        ],
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0].expectedOuput',
          message: 'Unknown key "expectedOuput". Did you mean "expectedOutput"?',
          severity: 'error',
        }),
      )
    })
  })

  describe('Required field validation', () => {
    it('should require version and name', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        testCases: [],
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'root',
          message: 'version is required',
          severity: 'error',
        }),
      )
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'root',
          message: 'name is required',
          severity: 'error',
        }),
      )
    })

    it('should require test case name and input', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [
          {
            description: 'test without name',
          },
        ],
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0]',
          message: 'name is required',
          severity: 'error',
        }),
      )
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0]',
          message: 'input is required',
          severity: 'error',
        }),
      )
    })
  })

  describe('Structure validation', () => {
    it('should validate mapExpectations structure', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [
          {
            name: 'test1',
            input: {},
            mapExpectations: 'not-an-array', // Should be array
          },
        ],
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0].mapExpectations',
          message: 'must be an array',
          severity: 'error',
        }),
      )
    })

    it('should validate iterationPaths structure', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [
          {
            name: 'test1',
            input: {},
            mapExpectations: [
              {
                state: 'MapState',
                iterationPaths: ['State1', 'State2'], // Should be array of arrays
              },
            ],
          },
        ],
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0].mapExpectations[0].iterationPaths[0]',
          message: 'each iteration path must be an array of state names',
          severity: 'error',
        }),
      )
    })
  })

  describe('Enum validation', () => {
    it('should validate assertion enum values', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [],
        assertions: {
          outputMatching: 'fuzzy', // Invalid enum value
          pathMatching: 'regex', // Invalid enum value
        },
      }

      const result = validator.validate(suite)

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'assertions.outputMatching',
          message: "must be 'exact' or 'partial', got 'fuzzy'",
          severity: 'error',
        }),
      )
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'assertions.pathMatching',
          message: "must be 'exact', 'includes', or 'sequence', got 'regex'",
          severity: 'error',
        }),
      )
    })
  })

  describe('Warning generation', () => {
    it('should warn about missing data in itemReader mock', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'test',
        testCases: [
          {
            name: 'test1',
            input: {},
            mockOverrides: [
              {
                state: 'MapState',
                type: 'itemReader',
                // Missing both data and dataFile
              },
            ],
          },
        ],
      }

      validator.validate(suite)
      const warnings = validator.getWarnings()

      expect(warnings).toContainEqual(
        expect.objectContaining({
          path: 'testCases[0].mockOverrides[0]',
          message: 'itemReader mock should have either data or dataFile',
          severity: 'warning',
        }),
      )
    })
  })

  describe('Valid suite', () => {
    it('should accept valid test suite', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        version: '1.0',
        name: 'valid-test',
        stateMachine: './workflow.asl.json',
        baseMock: './mock.yaml',
        testCases: [
          {
            name: 'test1',
            input: { value: 1 },
            expectedOutput: { result: 2 },
            expectedPath: ['State1', 'State2'],
            mapExpectations: [
              {
                state: 'MapState',
                iterationCount: 3,
                iterationPaths: [['Process', 'Validate', 'Success']],
              },
            ],
          },
        ],
        settings: {
          verbose: false,
          timeout: 5000,
        },
        assertions: {
          outputMatching: 'partial',
          pathMatching: 'exact',
        },
      }

      validator.validate(suite)

      expect(validator.isValid()).toBe(true)
      expect(validator.getErrors()).toHaveLength(0)
      expect(validator.getWarnings()).toHaveLength(0)
    })
  })
})
