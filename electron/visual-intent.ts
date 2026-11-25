/** An explicit request to make a visual authorizes an image render for this answer. */
export function wantsVisualCreation(question: string) {
  return /\b(?:create|recreate|draw|render|illustrate|sketch|visuali[sz]e|generate)\b/i.test(question)
    || /\bdiagram\s+(?:the|this|how|why)\b/i.test(question)
    || /\b(?:make|show|build)\s+(?:(?:me|us)\s+)?(?:a|an|the|this)?\s*(?:3d|image|picture|diagram|model|render|drawing|visualization)\b/i.test(question);
}
