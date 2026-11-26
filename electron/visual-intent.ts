import { wantsAssemblySequence } from "./assembly-intent.js";

/** An explicit request to make a visual authorizes an image render for this answer. */
export function wantsVisualCreation(question: string) {
  return wantsAssemblySequence(question)
    || /\b(?:create|recreate|draw|render|illustrate|sketch|visuali[sz]e|generate)\b/i.test(question)
    || /\b(?:play|replay|animate)\s+(?:the\s+)?(?:assembly|assembly steps)\b/i.test(question)
    || /\b(?:show|animate|walk me through)\b[^.!?]{0,90}\b(?:assembl(?:e|y|ing)|putting .{0,25} together|connecting (?:the )?parts|plugging .{0,20} in)\b/i.test(question)
    || /\b(?:show|animate|render|draw)\b[^.!?]{0,100}\b(?:attach(?:ing)?|install(?:ing)?|mount(?:ing)?)\b[^.!?]{0,100}\b(?:to|into|onto|on|in)\b/i.test(question)
    || /\banimat(?:e|ing)\b[^.!?]{0,100}\bconnect(?:ing)?\b[^.!?]{0,100}\b(?:to|into|onto)\b/i.test(question)
    || /\b(?:show|animate|render|draw)\b[^.!?]{0,100}\bconnect(?:ing)?\b[^.!?]{0,60}\b(?:camera|module|component|part|cable|sensor|display)\b/i.test(question)
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
  if (/\b(?:play|replay|animate)\s+(?:the\s+)?(?:assembly|assembly steps)\b/i.test(value)) return true;
  if (!value || requestedVisualDimension(value) !== 3 || /\b(?:new|another|different|unrelated)\s+(?:topic|subject|object|diagram|model)\b/i.test(value)) return false;
  if (/\b(?:it|this|that|same|current|existing)\b/i.test(value) && /\b(?:assembl(?:e|y|ing)|exploded (?:view|model)|put .{0,20} together|connect (?:the )?parts)\b/i.test(value)) return true;
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

/** An anaphoric how-to should replay the current physical model as a lesson. */
export function wantsPriorAssemblyGuide(question: string): boolean {
  return /\b(?:how (?:do|can) (?:i|we) do (?:it|that|this)|show (?:me )?how to do (?:it|that|this)|walk (?:me )?through (?:it|that|this)|show (?:me )?the (?:assembly )?steps)\b/i.test(question);
}

/** Diagram requests default to 2D; explicit 3D view requests opt into 3D. */
export function requestedVisualDimension(question: string): 2 | 3 {
  if (/\b(?:play|replay|animate)\s+(?:the\s+)?(?:assembly|assembly steps)\b/i.test(question)) return 3;
  if (/\b(?:2d|two[ -]dimensional)\b|\bflat\s+(?:diagram|drawing|schematic|model|illustration)\b/i.test(question)) return 2;
  if (wantsAssemblySequence(question)) return 3;
  if (/\b(?:show|walk me through)\b[^.!?]{0,100}\battach\b[^.!?]{0,70}\bcamera\b[^.!?]{0,100}\b(?:raspberry\s*pi|pi\s*5)\b/i.test(question)
    || /\b(?:show|walk me through)\b[^.!?]{0,100}\b(?:raspberry\s*pi|pi\s*5)\b[^.!?]{0,100}\battach\b[^.!?]{0,70}\bcamera\b/i.test(question)) return 3;
  if (/\b(?:exploded (?:view|model)|animate\b[^.!?]{0,80}\b(?:assembl(?:e|y|ing)|attach(?:ing)?|install(?:ing)?|connect(?:ing)?)|show\b[^.!?]{0,50}\b(?:parts? (?:moving|connecting)|assembl(?:e|y|ing)))\b/i.test(question)) return 3;
  if (/\b(?:3d|three[ -]dimensional)\s+(?:model|render|diagram|view|illustration|drawing|scene|version|cutaway)\b|\b(?:model|render|diagram|view|illustration|drawing|scene|cutaway)\s+(?:in\s+)?3d\b|\b(?:draw|make|show|render|generate|build|create|model)\b[\s\S]{0,35}\b3d\b(?!\s+printer\b)|\b(?:rotat(?:e|able|ing)|orbit|spin|turn (?:it|the model) around|move (?:it|the model) around|inspect (?:it|the model) from all sides|exploded (?:view|model))\b/i.test(question)) return 3;
  return 2;
}

/** Only an explicit request to reproduce the visible object's appearance needs its pixels. */
export function wantsReferenceRecreation(question: string) {
  // A visual request about a deictic on-screen object should use the located
  // object crop even when the learner did not say "recreate" or "exactly".
  if (wantsVisualCreation(question) && !/\b(?:in your own way|inspired by)\b/i.test(question)
    && /\b(?:this|that|visible|shown|on[- ]screen|in (?:the|this) (?:image|photo|screenshot))\b/i.test(question)) return true;
  if (/\b(?:show|draw|build|make|animate|model|render|generate)\b[^.!?]{0,120}\b(?:this|that|visible|shown)\s+[\w-]+(?:\s+[\w-]+){0,4}\b[^.!?]{0,70}\b(?:3d|model|render|exploded|attach|install|connect)\b/i.test(question)
    && !/\b(?:in your own way|inspired by)\b/i.test(question)) return true;
  if (/\b(?:show|draw|build|make|animate|model|render|generate)\b[^.!?]{0,120}\b(?:3d|model|render|exploded|attach|install|connect)\b[^.!?]{0,90}\b(?:this|that|visible|shown)\s+[\w-]+(?:\s+[\w-]+){0,4}\b/i.test(question)
    && !/\b(?:in your own way|inspired by)\b/i.test(question)) return true;
  if (/\b(?:show|draw|build|make|animate|model|render|generate)\b[^.!?]{0,120}\b(?:on|in)\s+(?:my|the)\s+screen\b/i.test(question)) return true;
  return /\b(?:recreate|replicate|copy|match)\b[\s\S]{0,100}\b(?:this|that|visible|shown|screen|image|photo|picture|object)\b/i.test(question)
    || /\b(?:turn|convert)\s+(?:this|that|the visible)\s+[\w-]+(?:\s+[\w-]+){0,4}\s+into\s+(?:a\s+)?(?:diagram|model)\b/i.test(question)
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
