import { describe, expect, it } from 'vitest'
import type { StateMachine } from '../../types/asl'
import { StateFactory } from '../../types/state-factory'
import { CoverageTracker } from './tracker'

describe('CoverageTracker', () => {
  describe('constructor', () => {
    it('should initialize with empty coverage data', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)
      const coverage = tracker.getCoverage()

      expect(coverage.states.total).toBe(1)
      expect(coverage.states.covered).toBe(0)
      expect(coverage.branches.total).toBe(0)
      expect(coverage.branches.covered).toBe(0)
    })

    it('should count branches for Choice states', () => {
      const stateMachine: StateMachine = {
        StartAt: 'ChoiceState',
        States: StateFactory.createStates({
          ChoiceState: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.value',
                NumericEquals: 1,
                Next: 'State1',
              },
              {
                Variable: '$.value',
                NumericEquals: 2,
                Next: 'State2',
              },
            ],
            Default: 'DefaultState',
          },
          State1: { Type: 'Pass', End: true },
          State2: { Type: 'Pass', End: true },
          DefaultState: { Type: 'Pass', End: true },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)
      const coverage = tracker.getCoverage()

      expect(coverage.states.total).toBe(4)
      expect(coverage.branches.total).toBe(3) // 2 choices + 1 default
    })
  })

  describe('trackExecution', () => {
    it('should track executed states', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            Next: 'State2',
          },
          State2: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)
      tracker.trackExecution(['State1', 'State2'])

      const coverage = tracker.getCoverage()

      expect(coverage.states.covered).toBe(2)
      expect(coverage.states.percentage).toBe(100)
      expect(coverage.states.uncovered).toEqual([])
    })

    it('should track partial execution', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            Next: 'State2',
          },
          State2: {
            Type: 'Pass',
            Next: 'State3',
          },
          State3: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)
      tracker.trackExecution(['State1', 'State2'])

      const coverage = tracker.getCoverage()

      expect(coverage.states.covered).toBe(2)
      expect(coverage.states.percentage).toBe(66.67)
      expect(coverage.states.uncovered).toEqual(['State3'])
    })

    it('should track Choice branches', () => {
      const stateMachine: StateMachine = {
        StartAt: 'ChoiceState',
        States: StateFactory.createStates({
          ChoiceState: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.value',
                NumericEquals: 1,
                Next: 'State1',
              },
              {
                Variable: '$.value',
                NumericEquals: 2,
                Next: 'State2',
              },
            ],
            Default: 'DefaultState',
          },
          State1: { Type: 'Pass', End: true },
          State2: { Type: 'Pass', End: true },
          DefaultState: { Type: 'Pass', End: true },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)

      // Track one branch
      tracker.trackExecution(['ChoiceState', 'State1'])

      let coverage = tracker.getCoverage()
      expect(coverage.branches.covered).toBe(1)
      expect(coverage.branches.percentage).toBe(33.33)

      // Track another branch
      tracker.trackExecution(['ChoiceState', 'State2'])

      coverage = tracker.getCoverage()
      expect(coverage.branches.covered).toBe(2)
      expect(coverage.branches.percentage).toBe(66.67)

      // Track default branch
      tracker.trackExecution(['ChoiceState', 'DefaultState'])

      coverage = tracker.getCoverage()
      expect(coverage.branches.covered).toBe(3)
      expect(coverage.branches.percentage).toBe(100)
    })
  })

  describe('getCoverage', () => {
    it('should return correct coverage report', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            Next: 'State2',
          },
          State2: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)
      tracker.trackExecution(['State1'])

      const coverage = tracker.getCoverage()

      expect(coverage).toMatchObject({
        states: {
          total: 2,
          covered: 1,
          percentage: 50,
          uncovered: ['State2'],
        },
        branches: {
          total: 0,
          covered: 0,
          percentage: 100, // No branches = 100%
          uncovered: [],
        },
        paths: {
          total: 1,
          unique: 1,
        },
      })
    })

    it('should track unique paths correctly', () => {
      const stateMachine: StateMachine = {
        StartAt: 'State1',
        States: StateFactory.createStates({
          State1: {
            Type: 'Pass',
            Next: 'State2',
          },
          State2: {
            Type: 'Pass',
            End: true,
          },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)

      // Track same path multiple times
      tracker.trackExecution(['State1', 'State2'])
      tracker.trackExecution(['State1', 'State2'])
      tracker.trackExecution(['State1'])

      const coverage = tracker.getCoverage()

      expect(coverage.paths.total).toBe(3)
      expect(coverage.paths.unique).toBe(2) // Only 2 unique paths
    })
  })

  describe('uncovered branches', () => {
    it('should identify uncovered Choice branches', () => {
      const stateMachine: StateMachine = {
        StartAt: 'ChoiceState',
        States: StateFactory.createStates({
          ChoiceState: {
            Type: 'Choice',
            Choices: [
              {
                Variable: '$.value',
                NumericEquals: 1,
                Next: 'State1',
              },
              {
                Variable: '$.value',
                NumericEquals: 2,
                Next: 'State2',
              },
            ],
            Default: 'DefaultState',
          },
          State1: { Type: 'Pass', End: true },
          State2: { Type: 'Pass', End: true },
          DefaultState: { Type: 'Pass', End: true },
        }),
      }

      const tracker = new CoverageTracker(stateMachine)
      tracker.trackExecution(['ChoiceState', 'State1'])

      const coverage = tracker.getCoverage()

      expect(coverage.branches.uncovered).toContain('ChoiceState->State2')
      expect(coverage.branches.uncovered).toContain('ChoiceState->DefaultState')
      expect(coverage.branches.uncovered).not.toContain('ChoiceState->State1')
    })
  })
})
