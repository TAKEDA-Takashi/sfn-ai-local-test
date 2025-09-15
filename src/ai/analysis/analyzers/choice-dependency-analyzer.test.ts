import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { ChoiceDependencyAnalyzer } from './choice-dependency-analyzer'

describe('ChoiceDependencyAnalyzer', () => {
  describe('JSONPath mode Choice analysis', () => {
    it('should analyze Choice dependencies with string conditions', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckStatus',
        States: {
          CheckStatus: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.status',
                StringEquals: 'active',
                Next: 'ProcessActive',
              },
              {
                Variable: '$.status',
                StringEquals: 'pending',
                Next: 'ProcessPending',
              },
            ],
            Default: 'HandleOther',
          },
          ProcessActive: { Type: 'Succeed' },
          ProcessPending: { Type: 'Succeed' },
          HandleOther: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0]).toMatchObject({
        choiceStateName: 'CheckStatus',
        requiredFields: ['status'],
        fieldTypes: { status: 'string' },
        branches: expect.arrayContaining([
          expect.objectContaining({
            condition: 'status == "active"',
            nextState: 'ProcessActive',
            requiredInput: { status: 'active' },
          }),
          expect.objectContaining({
            condition: 'status == "pending"',
            nextState: 'ProcessPending',
            requiredInput: { status: 'pending' },
          }),
          expect.objectContaining({
            condition: 'Default (no conditions matched)',
            nextState: 'HandleOther',
          }),
        ]),
      })
    })

    it('should analyze numeric conditions', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckAmount',
        States: {
          CheckAmount: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.amount',
                NumericGreaterThan: 100,
                Next: 'HighAmount',
              },
              {
                Variable: '$.amount',
                NumericLessThan: 10,
                Next: 'LowAmount',
              },
            ],
            Default: 'MediumAmount',
          },
          HighAmount: { Type: 'Succeed' },
          LowAmount: { Type: 'Succeed' },
          MediumAmount: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0]).toMatchObject({
        choiceStateName: 'CheckAmount',
        requiredFields: ['amount'],
        fieldTypes: { amount: 'number' },
        branches: expect.arrayContaining([
          expect.objectContaining({
            condition: 'amount > 100',
            nextState: 'HighAmount',
            requiredInput: { amount: 101 },
          }),
          expect.objectContaining({
            condition: 'amount < 10',
            nextState: 'LowAmount',
            requiredInput: { amount: 9 },
          }),
        ]),
      })
    })

    it('should analyze boolean conditions', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckFlag',
        States: {
          CheckFlag: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.enabled',
                BooleanEquals: true,
                Next: 'Enabled',
              },
              {
                Variable: '$.enabled',
                BooleanEquals: false,
                Next: 'Disabled',
              },
            ],
            Default: 'Unknown',
          },
          Enabled: { Type: 'Succeed' },
          Disabled: { Type: 'Succeed' },
          Unknown: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0]).toMatchObject({
        choiceStateName: 'CheckFlag',
        requiredFields: ['enabled'],
        fieldTypes: { enabled: 'boolean' },
        branches: expect.arrayContaining([
          expect.objectContaining({
            condition: 'enabled == true',
            nextState: 'Enabled',
            requiredInput: { enabled: true },
          }),
          expect.objectContaining({
            condition: 'enabled == false',
            nextState: 'Disabled',
            requiredInput: { enabled: false },
          }),
        ]),
      })
    })

    it('should handle multiple Choice states', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'FirstChoice',
        States: {
          FirstChoice: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.type',
                StringEquals: 'A',
                Next: 'SecondChoice',
              },
            ],
            Default: 'End',
          },
          SecondChoice: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.count',
                NumericGreaterThan: 0,
                Next: 'Process',
              },
            ],
            Default: 'End',
          },
          Process: { Type: 'Succeed' },
          End: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(2)
      expect(dependencies[0].choiceStateName).toBe('FirstChoice')
      expect(dependencies[0].requiredFields).toEqual(['type'])
      expect(dependencies[1].choiceStateName).toBe('SecondChoice')
      expect(dependencies[1].requiredFields).toEqual(['count'])
    })
  })

  describe('JSONata mode Choice analysis', () => {
    it('should analyze JSONata Choice conditions', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckCondition',
        QueryLanguage: 'JSONata',
        States: {
          CheckCondition: {
            Type: 'Choice',
            Choices: [
              {
                Condition: '{% $notify = true %}',
                Next: 'SendNotification',
              },
              {
                Condition: '{% $count > 10 %}',
                Next: 'ProcessBatch',
              },
            ],
            Default: 'Skip',
          },
          SendNotification: { Type: 'Succeed' },
          ProcessBatch: { Type: 'Succeed' },
          Skip: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0]).toMatchObject({
        choiceStateName: 'CheckCondition',
        requiredFields: expect.arrayContaining(['notify', 'count']),
      })

      // Check branches structure more flexibly
      const branches = dependencies[0].branches
      expect(branches).toHaveLength(3) // 2 conditions + 1 default

      const notifyBranch = branches.find((b) => b.condition.includes('$notify = true'))
      expect(notifyBranch).toMatchObject({
        condition: 'JSONata: {% $notify = true %}',
        nextState: 'SendNotification',
        requiredInput: { notify: true },
      })

      const countBranch = branches.find((b) => b.condition.includes('$count > 10'))
      expect(countBranch).toMatchObject({
        condition: 'JSONata: {% $count > 10 %}',
        nextState: 'ProcessBatch',
        requiredInput: { count: 10 },
      })
    })

    it('should handle $states.input references in JSONata', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckInput',
        QueryLanguage: 'JSONata',
        States: {
          CheckInput: {
            Type: 'Choice',
            Choices: [
              {
                Condition: '{% $states.input.userId != null %}',
                Next: 'ProcessUser',
              },
              {
                Condition: '{% $states.input.items.length > 0 %}',
                Next: 'ProcessItems',
              },
            ],
            Default: 'NoData',
          },
          ProcessUser: { Type: 'Succeed' },
          ProcessItems: { Type: 'Succeed' },
          NoData: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0]).toMatchObject({
        choiceStateName: 'CheckInput',
        requiredFields: expect.arrayContaining(['userId', 'items']),
      })
    })
  })

  describe('Edge cases', () => {
    it('should handle Choice without Default', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckValue',
        States: {
          CheckValue: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.value',
                StringEquals: 'test',
                Next: 'Process',
              },
            ],
          },
          Process: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0].branches).toHaveLength(1)
      expect(dependencies[0].branches[0]).toMatchObject({
        condition: 'value == "test"',
        nextState: 'Process',
      })
    })

    it('should handle empty Choices array', () => {
      // Empty Choices array should throw an error during state machine creation
      expect(() => {
        StateFactory.createStateMachine({
          StartAt: 'EmptyChoice',
          States: {
            EmptyChoice: {
              Type: 'Choice',
              Choices: [],
              Default: 'End',
            },
            End: { Type: 'Succeed' },
          },
        })
      }).toThrow('Choice state requires non-empty Choices array')
    })

    it('should handle IsPresent and IsNull conditions', () => {
      const stateMachine: StateMachine = StateFactory.createStateMachine({
        StartAt: 'CheckPresence',
        States: {
          CheckPresence: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.optionalField',
                IsPresent: true,
                Next: 'HasField',
              },
              {
                Variable: '$.nullableField',
                IsNull: true,
                Next: 'IsNullField',
              },
            ],
            Default: 'Other',
          },
          HasField: { Type: 'Succeed' },
          IsNullField: { Type: 'Succeed' },
          Other: { Type: 'Succeed' },
        },
      })

      const analyzer = new ChoiceDependencyAnalyzer(stateMachine)
      const dependencies = analyzer.analyzeChoiceDependencies()

      expect(dependencies).toHaveLength(1)
      expect(dependencies[0].branches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            condition: 'optionalField is present',
            requiredInput: { optionalField: 'present-value' },
          }),
          expect.objectContaining({
            condition: 'nullableField is null',
            requiredInput: { nullableField: null },
          }),
        ]),
      )
    })
  })
})
