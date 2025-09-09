import type { ChoiceRule, JSONataChoiceRule, JSONPathChoiceRule } from '../../../types/asl'

/**
 * JSONPathChoiceRuleかどうかの判定
 */
export function isJSONPathChoiceRule(rule: ChoiceRule): rule is JSONPathChoiceRule {
  return 'Variable' in rule || 'And' in rule || 'Or' in rule || 'Not' in rule
}

/**
 * JSONataChoiceRuleかどうかの判定
 */
export function isJSONataChoiceRule(rule: ChoiceRule): rule is JSONataChoiceRule {
  return 'Condition' in rule && !('Variable' in rule)
}
