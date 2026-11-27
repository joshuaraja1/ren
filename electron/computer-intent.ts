/** An explicit request for Ren to act in the visible application. */
export function mentionsNamedTarget(question: string): boolean {
  if (/\b(?:in|using)\s+(?:plain|simple|clear|formal|casual)\b/i.test(question)) return false;
  return /\b(?:in|using)\s+(?!(?:a|an|the|my|your|this|that)\b)[a-z][\w.+-]{1,}(?:\s+[\w.+-]+){0,3}/i.test(question);
}

export function wantsComputerExecution(question: string, history: { role: "user" | "assistant"; content: string }[] = []): boolean {
  if (/^(?:how|where|why|what|show me how|walk me through|guide me through)\b/i.test(question.trim())) return false;
  const visibleAction = /\b(?:click|type|drag|scroll|select|press|fill out|move the cursor)\b.{0,100}\b(?:this|that|the|for me|on (?:my|the) screen)\b/i.test(question)
    || /\bdraw\b.{0,100}\b(?:on (?:my|the) screen|in (?:this|the|my) (?:app|software|program))\b/i.test(question);
  const actionRequest = /\b(?:do|perform|complete|finish|set up|configure|operate|make|create|build|run)\b/i.test(question);
  const softwareArtifact = /\b(?:model|sketch|chart|table|sheet|slide|presentation|drawing|design|file|document|spreadsheet|simulation|analysis|formula|image|photo|video|clip|project|form|post)\b/i.test(question);
  const inApp = actionRequest && (/\b(?:in (?:this|the|my) (?:\w+ )?(?:app|software|program)|on (?:my|the) screen)\b/i.test(question) || (softwareArtifact && mentionsNamedTarget(question)));
  const anaphoric = /^(?:(?:can|could|will|would) you\s+|please\s+)?(?:do|make|create|build|finish|run)\s+(?:it|that|this|the model|the analysis)\s+(?:for me|yourself)[?.! ]*$/i.test(question.trim());
  const embeddedDelegation = /\b(?:can|could|will|would) you\s+(?:do|make|create|build|finish|run)\s+(?:it|that|this)\s+for me\b/i.test(question);
  const followup = /^(?:(?:can|could|will|would) you\s+|please\s+)?(?:do|make|create|build|finish|run)\s+(?:it|that|this|the model|the analysis)\s+(?:for me|yourself)[?.! ]*$/i.test(question.trim())
    && history.some((turn) => turn.role === "user" && /\b(?:walk me through|guide me through|step[ -]by[ -]step|show me how to)\b/i.test(turn.content));
  return visibleAction || inApp || anaphoric || embeddedDelegation || followup;
}
