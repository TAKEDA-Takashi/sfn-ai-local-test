import type { ChoiceRule, ExecutionContext, JsonValue } from '../../../types/asl'
import type { ChoiceState } from '../../../types/state-classes'
import { BaseStateExecutor } from './base'

/**
 * Choice state executor
 * Determines next state based on condition evaluation
 */
export class ChoiceStateExecutor extends BaseStateExecutor<ChoiceState> {
  private selectedNextState?: string

  protected async executeState(input: JsonValue, context: ExecutionContext): Promise<JsonValue> {
    // StateFactory has already validated JSONata mode requirements
    if (this.mockEngine) {
      try {
        const mockResponse = await this.mockEngine.getMockResponse(context.currentState, input)
        if (mockResponse && typeof mockResponse === 'object' && 'Next' in mockResponse) {
          this.selectedNextState =
            typeof mockResponse.Next === 'string' ? mockResponse.Next : undefined
          return context.input
        }
      } catch {}
    }

    for (const choice of this.state.Choices) {
      const matched = await this.evaluateChoiceCondition(choice, input, context)

      if (matched) {
        this.selectedNextState = choice.Next
        return context.input
      }
    }

    if (this.state.Default) {
      this.selectedNextState = this.state.Default
      return context.input
    }

    throw new Error(
      `No matching choice found and no default specified for state: ${context.currentState}`,
    )
  }

  protected determineNextState(): string | undefined {
    return this.selectedNextState
  }

  private async evaluateChoiceCondition(
    choice: ChoiceRule,
    input: JsonValue,
    context: ExecutionContext,
  ): Promise<boolean> {
    // Use the ChoiceRule's own evaluate method
    if (choice.isJSONata()) {
      return await choice.evaluate(input, context)
    } else {
      return choice.evaluate(input, context)
    }
  }
}
