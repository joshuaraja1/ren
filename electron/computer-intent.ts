/** An explicit request for Ren to act in the visible application. */
export function wantsComputerExecution(question: string, history: { role: "user" | "assistant"; content: string }[] = []): boolean {
  if (/^(?:how|where|why|what|show me how|walk me through|guide me through)\b/i.test(question.trim())) return false;
  const visibleAction = /\b(?:click|type|drag|scroll|select|press|fill out|move the cursor)\b.{0,100}\b(?:this|that|the|for me|on (?:my|the) screen)\b/i.test(question)
    || /\bdraw\b.{0,100}\b(?:on (?:my|the) screen|in (?:this|the|my) (?:app|software|program))\b/i.test(question);
  const inApp = /\b(?:do|perform|complete|finish|set up|configure|operate|make|create|build|run)\b.{0,120}\b(?:in (?:this|the|my) (?:app|software|program)|on (?:my|the) screen)\b/i.test(question);
  const anaphoric = /^(?:(?:can|could|will|would) you\s+|please\s+)?(?:do|make|create|build|finish|run)\s+(?:it|that|this|the model|the analysis)\s+(?:for me|yourself)[?.! ]*$/i.test(question.trim());
  const embeddedDelegation = /\b(?:can|could|will|would) you\s+(?:do|make|create|build|finish|run)\s+(?:it|that|this)\s+for me\b/i.test(question);
  const followup = /^(?:(?:can|could|will|would) you\s+|please\s+)?(?:do|make|create|build|finish|run)\s+(?:it|that|this|the model|the analysis)\s+(?:for me|yourself)[?.! ]*$/i.test(question.trim())
    && history.some((turn) => turn.role === "user" && /\b(?:walk me through|guide me through|step[ -]by[ -]step|show me how to)\b/i.test(turn.content));
  return visibleAction || inApp || anaphoric || embeddedDelegation || followup;
}
