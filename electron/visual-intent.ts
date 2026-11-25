/** An explicit request to make a visual authorizes an image render for this answer. */
export function wantsVisualCreation(question: string) {
  return /\b(?:create|recreate|draw|render|illustrate|sketch|visuali[sz]e|generate)\b/i.test(question)
    || /\bdiagram\s+(?:the|this|how|why)\b/i.test(question)
    || /\b(?:make|show|build)\s+(?:(?:me|us)\s+)?(?:a|an|the|this)?\s*(?:3d|image|picture|diagram|model|render|drawing|visualization)\b/i.test(question);
}

/** Only an explicit request to reproduce the visible object's appearance needs its pixels. */
export function wantsReferenceRecreation(question: string) {
  return /\b(?:recreate|replicate|copy|match)\b[\s\S]{0,100}\b(?:this|that|visible|shown|screen|image|photo|picture|object)\b/i.test(question)
    || /\b(?:this|that|visible|shown|screen|image|photo|picture|object)\b[\s\S]{0,100}\b(?:exactly|faithfully|as[ -]is)\b/i.test(question);
}

/** A conservative early signal for showing the current diagram while a follow-up is answered. */
export function likelyVisualFollowUp(question: string, title: string, labels: string[]) {
  const value = question.trim().toLowerCase();
  if (!value || /\b(?:new|another|different|unrelated)\s+(?:topic|question|diagram|subject)\b/.test(value)) return false;
  if (/\b(?:diagram|drawing|render|visual|illustration|model|those parts|these parts|tell me more)\b/.test(value)) return true;
  const terms = [title, ...labels].flatMap((item) => item.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
    .filter((item) => !["the", "and", "for", "with", "how", "why"].includes(item));
  if (terms.some((item) => new RegExp(`\\b${item}\\b`).test(value))) return true;
  return /\b(?:why|how|what|where|which|explain)\b[\s\S]{0,100}\b(?:it|its|that|this|they|their|those|these)\b/.test(value)
    && !/\b(?:page|tab|screen|website|window|app|document|file)\b/.test(value);
}
