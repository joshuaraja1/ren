/** A request to demonstrate how physical parts are put together. */
export function wantsAssemblySequence(question: string): boolean {
  // Digital modeling is a workflow, not physical part assembly.
  if (/\b(?:cad|fea|fem|finite.element|mesh(?:ing)?|simulation|simulate|solver|boundary conditions?)\b/i.test(question)
    && !/\b(?:attach|install|mount|plug|wire|insert|fit|connect)(?:ed|ing)?\b[^.!?]{0,100}\b(?:camera|cable|board|device|part|component|ram|cpu|battery|wheel|motor|sensor)\b/i.test(question)) return false;
  if (/\b(?:wi-?fi|internet|network|api|database|server|account|software|package|dependencies|login|code|program|agent|workflow|website|application|resume|document|form|file|repository|repo|service)\b/i.test(question)
    && !/\b(?:hardware|cable|camera|board|device|part|component|ram|memory|monitor|cpu|gpu|processor|motherboard|keyboard|display|port|lens|battery|wheel|motor|sensor)\b/i.test(question)) return false;
  return /\b(?:assembl(?:e|y|ing)|put (?:it|them|the parts|this|that) together|connect (?:the )?parts|plug (?:it|them|the parts) in|exploded (?:view|diagram|model)|step.by.step (?:build|assembly|connection))\b/i.test(question)
    || /\b(?:attach(?:ed|ing)?|install(?:ed|ing)?|mount(?:ed|ing)?|connect(?:ed|ing)?|plug(?:ged|ging)?|wire|wiring|insert(?:ed|ing)?|fit(?:ting)?)\b[^.!?]{0,100}\b(?:to|into|onto|on|in)\b/i.test(question)
    || /\b(?:how (?:do|can|should|would) (?:i|we|you)|how to|show (?:me )?how to|walk me through)\b[^.!?]{0,100}\b(?:build|assemble|attach|install|mount|connect|plug|wire|insert|fit)\b/i.test(question)
    || /\b(?:camera|module|component|part|cable|sensor|display|board|battery|wheel|motor|connector)\s+connection\b/i.test(question);
}

/** Procedural requests play automatically; an explicit still image stays still. */
export function wantsAssemblyAnimation(question: string): boolean {
  if (/\b(?:static|still image|no animation|without animation|do not animate|don't animate)\b/i.test(question)) return false;
  return wantsAssemblySequence(question) || /\b(?:play|replay|animate)\s+(?:the\s+)?(?:assembly|assembly steps)\b/i.test(question);
}
