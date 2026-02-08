/**
 * Data flow guidance for mock generation and output transformation guidance for test generation
 */

import type {
  ChoiceDependency,
  MapOutputSpec,
  PassVariableFlow,
} from '../../analysis/data-flow-analyzer'
import type { getOutputTransformationDetails } from '../../analysis/output-transformation-detection'

export function getDataFlowGuidance(analysis: {
  choiceDependencies: ChoiceDependency[]
  mapOutputSpecs: MapOutputSpec[]
  passVariableFlows: PassVariableFlow[]
  consistencyIssues: string[]
  recommendations: string[]
}): string {
  const sections: string[] = []

  sections.push('## Data Flow Analysis and Mock Recommendations')
  sections.push('')

  if (analysis.consistencyIssues.length > 0) {
    sections.push('⚠️ **CRITICAL: Data flow inconsistencies detected** ⚠️')
    sections.push('')
    sections.push('The following issues must be addressed in your mocks:')
    sections.push('')

    for (const issue of analysis.consistencyIssues) {
      sections.push('### Data Flow Issue')
      sections.push(issue)
      sections.push('')
    }
  }

  // Choice dependency guidance
  if (analysis.choiceDependencies.length > 0) {
    sections.push('### Choice State Dependencies')
    sections.push('')
    sections.push('The following Choice states have specific field requirements:')
    sections.push('')

    for (const dep of analysis.choiceDependencies) {
      sections.push(`#### ${dep.choiceStateName}`)
      sections.push(`Required fields: ${dep.requiredFields.join(', ')}`)
      sections.push(`Field types: ${JSON.stringify(dep.fieldTypes)}`)
      sections.push('')

      if (dep.upstreamRequirements.length > 0) {
        sections.push('**Upstream state requirements:**')
        for (const req of dep.upstreamRequirements) {
          sections.push(`- ${req.targetStateName || 'Any upstream state'}: ${req.reason}`)
          sections.push(`  Required fields: ${req.requiredOutputFields.join(', ')}`)
        }
        sections.push('')
      }
    }
  }

  // Map output requirements
  if (analysis.mapOutputSpecs.length > 0) {
    sections.push('### Map State Output Requirements')
    sections.push('')

    for (const spec of analysis.mapOutputSpecs) {
      sections.push(`#### ${spec.stateName}`)

      if (spec.requiredFields.length > 0) {
        sections.push('**Required fields:**')
        for (const field of spec.requiredFields) {
          sections.push(`- ${field.field} (${field.type}): ${field.description}`)
        }
      }

      if (spec.dynamicFields.length > 0) {
        sections.push('**Dynamic fields:**')
        for (const field of spec.dynamicFields) {
          sections.push(`- ${field.field}: ${field.calculation}`)
        }
      }

      if (spec.conditionalLogic) {
        sections.push(`**Conditional logic:** ${spec.conditionalLogic}`)
      }

      sections.push('')
    }
  }

  // Pass variable flows
  if (analysis.passVariableFlows.length > 0) {
    sections.push('### Pass State Variable Dependencies')
    sections.push('')

    for (const flow of analysis.passVariableFlows) {
      sections.push(`#### ${flow.passStateName}`)
      sections.push(`Variables set: ${JSON.stringify(flow.variables)}`)

      if (flow.choiceCompatibility) {
        sections.push('**Downstream Choice compatibility:**')
        sections.push(
          `Compatible states: ${flow.choiceCompatibility.compatibleChoiceStates.join(', ')}`,
        )
        if (flow.choiceCompatibility.missingFields.length > 0) {
          sections.push(`Missing fields: ${flow.choiceCompatibility.missingFields.join(', ')}`)
        }
        if (flow.choiceCompatibility.recommendedChanges.length > 0) {
          sections.push(
            `Recommendations: ${flow.choiceCompatibility.recommendedChanges.join('; ')}`,
          )
        }
      }
      sections.push('')
    }
  }

  if (sections.length === 2) {
    sections.push('✅ No critical data flow issues detected. Standard mocking practices apply.')
  }

  return sections.join('\n')
}

export function getOutputTransformationGuidance(
  transformationDetails: ReturnType<typeof getOutputTransformationDetails>,
): string {
  if (transformationDetails.length === 0) {
    return ''
  }

  // Group by transformation type
  const jsonPathTransforms = transformationDetails.filter((d) =>
    ['ResultSelector', 'OutputPath', 'ResultPath'].includes(d.transformationType),
  )
  const jsonataTransforms = transformationDetails.filter((d) =>
    ['JSONataOutput', 'JSONataAssign'].includes(d.transformationType),
  )

  let guidance = `## 🔧 CRITICAL: Output Transformation Detected

# ⚠️ IMPORTANT: Test Expectation Adjustment Required ⚠️

**THIS STATE MACHINE TRANSFORMS OUTPUT DATA**
**TEST EXPECTATIONS MUST MATCH THE TRANSFORMED OUTPUT, NOT RAW TASK RESULTS**

☕ Understanding: When states use JSONPath (ResultSelector/OutputPath/ResultPath) or JSONata (Output/Assign)
to transform output, test expectations should match the TRANSFORMED result.
`

  if (jsonPathTransforms.length > 0) {
    const stateList = jsonPathTransforms
      .map((detail) => `- **${detail.stateName}** (${detail.transformationType}): ${detail.reason}`)
      .join('\n')

    guidance += `
### JSONPath Transformations

${stateList}

**Test Expectation Rules for JSONPath:**
\`\`\`yaml
stateExpectations:
  # For ResultSelector: Only expect the selected fields
  - state: "StateWithResultSelector"
    output:
      selectedField: "value"  # Only fields specified in ResultSelector

  # For OutputPath: Only expect the filtered portion
  - state: "StateWithOutputPath"
    output: "filtered_value"  # Only the portion specified by OutputPath

  # For ResultPath: Expect merged input + result
  - state: "StateWithResultPath"
    output:
      # Original input fields remain
      originalField: "value"
      # Result is merged at specified path
      resultField: "task_result"
\`\`\`
`
  }

  if (jsonataTransforms.length > 0) {
    const stateList = jsonataTransforms
      .map((detail) => `- **${detail.stateName}** (${detail.transformationType}): ${detail.reason}`)
      .join('\n')

    guidance += `
### JSONata Transformations

${stateList}

**Test Expectation Rules for JSONata:**
\`\`\`yaml
stateExpectations:
  # For JSONata Output: Expect the computed result
  - state: "StateWithJSONataOutput"
    output:
      # The result of JSONata expression evaluation
      computedField: "computed_value"

  # For JSONata Assign: Expect input + assigned values
  - state: "StateWithJSONataAssign"
    output:
      # Original input preserved
      originalField: "value"
      # Assigned values added/updated
      assignedField: "assigned_value"
\`\`\`
`
  }

  guidance += `
### ⚡ ACTION REQUIRED ⚡

1. **ANALYZE** each transformation above to understand what the output should be
2. **MATCH** test expectations to the transformed output, not the raw task response
3. **VERIFY** that transformations are correctly represented in your test expectations
4. **TEST** various input scenarios to ensure transformations work as expected

### 🔴 KEY PRINCIPLE 🔴

**Test what the state ACTUALLY outputs, not what the underlying task returns.**
Transformation changes the shape and content of the output - your tests must reflect this.
`

  return guidance
}
