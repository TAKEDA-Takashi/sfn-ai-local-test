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

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
    })
  })

  describe('Required field validation', () => {
    it('should require version and name', () => {
      const validator = new TestSuiteValidator()
      const suite = {
        testCases: [],
      }

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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
                iterationPaths: 'invalid', // Should be an object
              },
            ],
          },
        ],
      }

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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

      expect(() => validator.validate(suite)).toThrow('Invalid test suite format')
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

      const result = validator.validate(suite)

      expect(result.warnings).toContainEqual(
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
                iterationPaths: {
                  samples: {
                    0: ['Process', 'Validate', 'Success'],
                  },
                },
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

      const result = validator.validate(suite)

      expect(result.warnings).toHaveLength(0)
    })
  })
})
