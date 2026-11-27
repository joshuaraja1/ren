/** A request to learn a task one visible step at a time. */
export function wantsGuidedWorkflow(question: string): boolean {
  return /\b(?:walk (?:me )?through|guide me through|step[ -]by[ -]step|one step at a time|show me how to)\b/i.test(question);
}

/** Short replies that continue the last guided task after the screen changes. */
export function continuesGuidedWorkflow(question: string): boolean {
  return /^(?:okay[,. ]*|ok[,. ]*|yes[,. ]*|i(?:'ve| have)? (?:done|did|finished) (?:it|that|this|the step)[,. ]*|that(?:'s| is) done[,. ]*)?(?:what(?:'s| is)? (?:the )?next(?: step)?|next(?: step)?|continue|then what|what (?:do i|should i) do next|i(?:'m| am) done|done|finished)[?.! ]*$/i.test(question.trim())
    || /^i (?:clicked|selected|opened|entered|typed|ran|saved|set)\b.{0,100}$/i.test(question.trim());
}

export function wantsToDelegateCurrentTask(question: string): boolean {
  return /^(?:(?:can|could|will|would) you\s+|please\s+)?(?:do|make|create|build|finish|run)\s+(?:it|that|this|the model|the analysis)\s+(?:for me|yourself)(?:[?.! ]*)$/i.test(question.trim());
}

export function hasGuidedWorkflowContext(history: { role: "user" | "assistant"; content: string }[]): boolean {
  return history.some((turn) => turn.role === "user" && wantsGuidedWorkflow(turn.content));
}

/** Preserve the original task when a long guided exchange exceeds chat history. */
export function guidedHistory(question: string, history: { role: "user" | "assistant"; content: string }[], originalTask: string | null) {
  if (!originalTask || !(continuesGuidedWorkflow(question) || wantsToDelegateCurrentTask(question)) || hasGuidedWorkflowContext(history)) return history;
  return [{ role: "user" as const, content: originalTask }, ...history.slice(-7)];
}
