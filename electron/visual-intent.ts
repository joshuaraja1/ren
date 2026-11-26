/** An explicit request to make a visual authorizes an image render for this answer. */
export function wantsVisualCreation(question: string) {
  return /\b(?:create|recreate|draw|render|illustrate|sketch|visuali[sz]e|generate)\b/i.test(question)
    || /\b(?:model|diagram)\s+(?:me\s+)?(?:the|this|that|a|an)\s+[a-z]/i.test(question)
    || /\b(?:2d|3d|two[ -]dimensional|three[ -]dimensional)\s+(?:model|diagram|render|illustration|cutaway)\s+of\b/i.test(question)
    || /\bdiagram\s+(?:the|this|how|why)\b/i.test(question)
    || /\b(?:make|show|build)\s+(?:(?:me|us)\s+)?(?:a|an|the|this)?\s*(?:3d|image|picture|diagram|model|render|drawing|visualization)\b/i.test(question)
    || /\b(?:build(?:\s+out)?|make|give)\b[^.!?]{0,35}\b(?:2d|3d)\s+(?:diagram|model)\b/i.test(question)
    || /\b(?:show|build|make|give)\b[^.!?]{0,80}\b(?:in\s+3d|as\s+a\s+3d\s+(?:model|diagram))\b/i.test(question)
    || /\b(?:make|turn|convert|show)\b[\s\S]{0,45}\b(?:it|that|this|same|current|existing)\b[\s\S]{0,45}\b(?:3d|three[ -]dimensional|rotatable)\b/i.test(question);
}

/** A request to change the current lesson's view, without naming a new subject. */
export function wantsPriorVisualIn3D(question: string): boolean {
  const value = question.trim();
  if (!value || requestedVisualDimension(value) !== 3 || /\b(?:new|another|different|unrelated)\s+(?:topic|subject|object|diagram|model)\b/i.test(value)) return false;
  if (/\b(?:this|that)\s+(?!diagram\b|drawing\b|model\b|one\b|same\b)(?:[\w-]+\s+){1,4}(?:in\s+)?3d\b/i.test(value)) return false;
  const anaphoric = /\b(?:make|turn|convert|show|build|give)\s+(?:me\s+)?(?:it|that|this)\s+(?:(?:into|as|in)\s+)?(?:a\s+)?(?:rotatable\s+)?(?:3d|three[ -]dimensional)\b/i.test(value)
    || /\b(?:same|current|previous|existing)\s+(?:thing|diagram|drawing|model)\s+(?:in|as|into)\s+(?:a\s+)?(?:3d|three[ -]dimensional|rotatable)\b/i.test(value)
    || /\b(?:the|this|that)\s+(?:diagram|drawing|model)\b[\s\S]{0,30}\b(?:3d|three[ -]dimensional|rotatable)\b/i.test(value)
    || /\b(?:3d|three[ -]dimensional|rotatable)\s+(?:version|view|model|diagram)\s+of\s+(?:it|that|this)(?=\s*[?.,!]?\s*$)/i.test(value)
    || /\b(?:can|could)\s+(?:i|we)\s+(?:rotate|spin|orbit)\s+(?:it|that|this|the diagram|the model)\b/i.test(value);
  if (anaphoric) return true;
  return /\b3d\s+diagram\b[^.!?]{0,80}\b(?:parts|components)\b/i.test(value)
    && !/\b(?:diagram|model|parts|components)\s+(?:of|for|about)\s+(?:a|an|the|this|that)?\s*[\w-]+/i.test(value);
}

/** Diagram requests default to 2D; explicit 3D view requests opt into 3D. */
export function requestedVisualDimension(question: string): 2 | 3 {
  if (/\b(?:2d|two[ -]dimensional)\b|\bflat\s+(?:diagram|drawing|schematic|model|illustration)\b/i.test(question)) return 2;
  if (/\b(?:3d|three[ -]dimensional)\s+(?:model|render|diagram|view|illustration|drawing|scene|version|cutaway)\b|\b(?:model|render|diagram|view|illustration|drawing|scene|cutaway)\s+(?:in\s+)?3d\b|\b(?:draw|make|show|render|generate|build|create|model)\b[\s\S]{0,35}\b3d\b(?!\s+printer\b)|\b(?:rotat(?:e|able|ing)|orbit|spin|turn (?:it|the model) around|move (?:it|the model) around|inspect (?:it|the model) from all sides)\b/i.test(question)) return 3;
  return 2;
}

/** Only an explicit request to reproduce the visible object's appearance needs its pixels. */
export function wantsReferenceRecreation(question: string) {
  return /\b(?:recreate|replicate|copy|match)\b[\s\S]{0,100}\b(?:this|that|visible|shown|screen|image|photo|picture|object)\b/i.test(question)
    || /\b(?:draw|make|show|build)\b[\s\S]{0,80}\b(?:3d|exploded|model|render)\b[\s\S]{0,80}\b(?:this|that|visible|shown)\s+(?:phone|jet|plane|turbine|device|object|machine|engine|item|part)\b/i.test(question)
    || /\b(?:draw|make|show|build|turn|convert)\b[\s\S]{0,80}\b(?:this|that|visible|shown)\s+(?:phone|jet|plane|turbine|device|object|machine|engine|item|part)\b[\s\S]{0,60}\b(?:3d|model|exploded|diagram|render|into|as)\b/i.test(question)
    || /\b(?:turn|convert)\s+this\s+(?:phone|jet|plane|turbine|device|object|machine|engine|item|part)\s+into\s+(?:a\s+)?(?:diagram|model)\b/i.test(question)
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
