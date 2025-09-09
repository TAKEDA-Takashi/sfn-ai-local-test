import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from '../../../types/asl'
import { StateFactory } from '../../../types/state-factory'
import { MockEngine } from '../../mock/engine'
import { StateMachineExecutor } from '../executor'

describe('Parallel State - Complex JSONata Real-world Scenario', () => {
  it('should execute all branches in a complex JSONata Parallel state', async () => {
    // This test simulates the kaizen-report pattern
    const mockEngine = new MockEngine({
      version: '1.0',
      mocks: [
        {
          state: 'LoadCredentials',
          type: 'fixed',
          response: {
            ExecutedVersion: '$LATEST',
            Payload: {
              status: 'success',
              credentials_loaded: true,
            },
            StatusCode: 200,
          },
        },
        {
          state: 'CheckIAMUser',
          type: 'fixed',
          response: {
            ExecutedVersion: '$LATEST',
            Payload: {
              users: [
                { username: 'user1', has_mfa: false },
                { username: 'user2', has_mfa: true },
              ],
              total_users: 2,
            },
            StatusCode: 200,
          },
        },
        {
          state: 'PutIAMResult',
          type: 'fixed',
          response: {
            ETag: 'etag-iam',
            VersionId: 'v1',
          },
        },
        {
          state: 'CheckCloudFront',
          type: 'fixed',
          response: {
            ExecutedVersion: '$LATEST',
            Payload: {
              distributions: [{ id: 'E123', logging_enabled: false }],
              total_distributions: 1,
            },
            StatusCode: 200,
          },
        },
        {
          state: 'PutCloudFrontResult',
          type: 'fixed',
          response: {
            ETag: 'etag-cf',
            VersionId: 'v1',
          },
        },
        {
          state: 'CheckELB',
          type: 'fixed',
          response: {
            ExecutedVersion: '$LATEST',
            Payload: {
              load_balancers: [{ name: 'lb-1', access_logs_enabled: false }],
              total_load_balancers: 1,
            },
            StatusCode: 200,
          },
        },
        {
          state: 'PutELBResult',
          type: 'fixed',
          response: {
            ETag: 'etag-elb',
            VersionId: 'v1',
          },
        },
      ],
    })

    // Create a simplified version of kaizen-report Parallel state
    const stateMachine = {
      StartAt: 'PrepareManifest',
      States: {
        PrepareManifest: StateFactory.createState({
          Type: 'Pass',
          QueryLanguage: 'JSONata',
          Assign: {
            manifest:
              '{% { "version": "1.0", "account_id": $states.input.account_id, "bucket": "test-bucket", "prefix": "test/" } %}',
          },
          Next: 'LoadCredentials',
        }),
        LoadCredentials: StateFactory.createState({
          Type: 'Task',
          QueryLanguage: 'JSONata',
          Resource: 'arn:aws:states:::lambda:invoke',
          Arguments: '{% {"FunctionName": "LoadCredFunc", "Payload": {"manifest": $manifest}} %}',
          Output: null,
          Next: 'InfoCollectParallel',
        }),
        InfoCollectParallel: StateFactory.createState({
          Type: 'Parallel',
          QueryLanguage: 'JSONata',
          Output: null,
          Branches: [
            {
              StartAt: 'CheckIAMUser',
              States: {
                CheckIAMUser: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Arguments:
                    '{% {"FunctionName": "CheckIAMFunc", "Payload": {"manifest": $manifest}} %}',
                  Output: '{% $states.result.Payload %}',
                  Next: 'PutIAMResult',
                }) as any,
                PutIAMResult: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::aws-sdk:s3:putObject',
                  Arguments:
                    '{% {"Body": $states.input, "Bucket": $manifest.bucket, "Key": $manifest.prefix & "iam.json"} %}',
                  End: true,
                }) as any,
              },
            },
            {
              StartAt: 'CheckCloudFront',
              States: {
                CheckCloudFront: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Arguments:
                    '{% {"FunctionName": "CheckCFFunc", "Payload": {"manifest": $manifest}} %}',
                  Output: '{% $states.result.Payload %}',
                  Next: 'PutCloudFrontResult',
                }) as any,
                PutCloudFrontResult: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::aws-sdk:s3:putObject',
                  Arguments:
                    '{% {"Body": $states.input, "Bucket": $manifest.bucket, "Key": $manifest.prefix & "cf.json"} %}',
                  End: true,
                }) as any,
              },
            },
            {
              StartAt: 'CheckELB',
              States: {
                CheckELB: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::lambda:invoke',
                  Arguments:
                    '{% {"FunctionName": "CheckELBFunc", "Payload": {"manifest": $manifest}} %}',
                  Output: '{% $states.result.Payload %}',
                  Next: 'PutELBResult',
                }) as any,
                PutELBResult: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::aws-sdk:s3:putObject',
                  Arguments:
                    '{% {"Body": $states.input, "Bucket": $manifest.bucket, "Key": $manifest.prefix & "elb.json"} %}',
                  End: true,
                }) as any,
              },
            },
          ],
          Next: 'Finish',
        }),
        Finish: StateFactory.createState({
          Type: 'Succeed',
        }),
      },
    }

    const executor = new StateMachineExecutor(stateMachine, mockEngine)
    const context: ExecutionContext = {
      input: {
        account_id: '123456789012',
        s3_prefix: 'reports/2024/',
      },
      currentState: '',
      executionPath: [],
      variables: {},
      stateExecutions: [],
      parallelExecutions: [],
    }

    const result = await executor.execute(context.input)

    // Verify the execution was successful
    expect(result.success).toBe(true)

    // Check that all states were executed
    expect(result.executionPath).toContain('PrepareManifest')
    expect(result.executionPath).toContain('LoadCredentials')
    expect(result.executionPath).toContain('InfoCollectParallel')
    expect(result.executionPath).toContain('Finish')

    // Check that all parallel branches were executed
    if (result.stateExecutions) {
      const parallelStates = result.stateExecutions.filter(
        (se) => se.parentState === 'InfoCollectParallel',
      )

      // Should have 6 states total (3 branches × 2 states each)
      expect(parallelStates).toHaveLength(6)

      // Check each branch was executed
      const branch0States = parallelStates.filter((se) => se.iterationIndex === 0)
      const branch1States = parallelStates.filter((se) => se.iterationIndex === 1)
      const branch2States = parallelStates.filter((se) => se.iterationIndex === 2)

      expect(branch0States).toHaveLength(2)
      expect(branch0States.map((s) => s.state)).toContain('CheckIAMUser')
      expect(branch0States.map((s) => s.state)).toContain('PutIAMResult')

      expect(branch1States).toHaveLength(2)
      expect(branch1States.map((s) => s.state)).toContain('CheckCloudFront')
      expect(branch1States.map((s) => s.state)).toContain('PutCloudFrontResult')

      expect(branch2States).toHaveLength(2)
      expect(branch2States.map((s) => s.state)).toContain('CheckELB')
      expect(branch2States.map((s) => s.state)).toContain('PutELBResult')
    }

    // Check parallel execution metadata
    if (result.parallelExecutions) {
      expect(result.parallelExecutions).toHaveLength(1)
      const parallelExec = result.parallelExecutions[0]
      expect(parallelExec.state).toBe('InfoCollectParallel')
      expect(parallelExec.branchCount).toBe(3)
      expect(parallelExec.branchPaths).toHaveLength(3)
      expect((parallelExec.branchPaths as any)[0]).toEqual(['CheckIAMUser', 'PutIAMResult'])
      expect((parallelExec.branchPaths as any)[1]).toEqual([
        'CheckCloudFront',
        'PutCloudFrontResult',
      ])
      expect((parallelExec.branchPaths as any)[2]).toEqual(['CheckELB', 'PutELBResult'])
    }
  })

  it('should handle variables in JSONata Parallel branches', async () => {
    const mockEngine = new MockEngine({
      version: '1.0',
      mocks: [
        {
          state: 'ProcessWithVariable',
          type: 'fixed',
          response: {
            result: 'processed',
            status: 'success',
          },
        },
      ],
    })

    const stateMachine = {
      StartAt: 'SetupVariables',
      States: {
        SetupVariables: StateFactory.createState({
          Type: 'Pass',
          QueryLanguage: 'JSONata',
          Assign: {
            sharedVar: '{% "shared-value-" & $states.input.id %}',
            config: '{% {"bucket": "test-bucket", "region": "us-east-1"} %}',
          },
          Next: 'ParallelWithVariables',
        }),
        ParallelWithVariables: StateFactory.createState({
          Type: 'Parallel',
          QueryLanguage: 'JSONata',
          Branches: [
            {
              StartAt: 'ProcessWithVariable',
              States: {
                ProcessWithVariable: StateFactory.createState({
                  Type: 'Task',
                  QueryLanguage: 'JSONata',
                  Resource: 'arn:aws:states:::aws-sdk:someservice:action',
                  Arguments: '{% {"input": $sharedVar, "bucket": $config.bucket} %}',
                  End: true,
                }) as any,
              },
            },
          ],
          End: true,
        }),
      },
    }

    const executor = new StateMachineExecutor(stateMachine, mockEngine)
    const result = await executor.execute({ id: '123' })

    expect(result.success).toBe(true)
    expect(result.executionPath).toContain('SetupVariables')
    expect(result.executionPath).toContain('ParallelWithVariables')
  })
})
