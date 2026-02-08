/**
 * Variables and Assign rules for mock and test generation
 */

export function getVariablesRules(): string {
  return `## Variables and Assign Rules

Variables are stored separately from state output:
- Use Assign field to set variables
- Access variables with $variableName
- Variables persist across states
- Test variables in stateExpectations.variables`
}

export function getVariablesTestGuidance(): string {
  return `## Testing Variables

When testing states with Variables:
1. Put variable expectations in stateExpectations.variables
2. Variables are separate from state output
3. Test variable persistence across states
4. Verify variable values change as expected`
}
