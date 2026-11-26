import { wantsVisualCreation } from "./visual-intent.js";

const explicitScreen = /\b(?:screen|screenshot|display|cursor|pointer|window|webpage|browser tab|photo|picture|image|video|visible|on[- ]screen|this app|this page|overlay)\b/i;
const referencedVisual = /\b(?:this|that|these|those)\s+(?:part|diagram|chart|graph|button|menu|icon|object|region|area|component|drawing)\b/i;
const pointingQuestion = /\b(?:what(?:'s| is| does)|where(?:'s| is)|which|look at|read|explain|summari[sz]e|point to|highlight|circle|mark|show me)\b.{0,65}\b(?:this|that|these|those|here|there|it)\s*[?.!]*$/i;
const spatialGuidance = /\b(?:point (?:to|at)|show me where|highlight|mark|circle|draw (?:an? )?arrow|where (?:do i|is the|are the))\b/i;

export function wantsCurrentScreen(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const clean = question.trim();
  if (wantsVisualCreation(clean) || explicitScreen.test(clean) || referencedVisual.test(clean) || pointingQuestion.test(clean)) return true;
  const priorUser = [...history].reverse().find((turn) => turn.role === "user")?.content;
  return Boolean(priorUser && (wantsVisualCreation(priorUser) || explicitScreen.test(priorUser) || referencedVisual.test(priorUser) || pointingQuestion.test(priorUser))
    && /^(?:why|how|what about|and|can you explain|tell me more|is that|does that)\b/i.test(question.trim()));
}

export function wantsSpatialGuidance(question: string) {
  return spatialGuidance.test(question);
}
