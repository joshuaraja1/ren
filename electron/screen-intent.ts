import { wantsVisualCreation } from "./visual-intent.js";
import { continuesGuidedWorkflow, hasGuidedWorkflowContext, wantsGuidedWorkflow, wantsToDelegateCurrentTask } from "./guided-workflow.js";
import { wantsComputerExecution } from "./computer-intent.js";

const explicitScreen = /\b(?:screen|screenshot|display|cursor|pointer|window|webpage|browser tab|visible|on[- ]screen|this app|this page|this software|this program|in (?:the|this) (?:app|software|program)|overlay)\b/i;
const referencedVisual = /\b(?:this|that|these|those|the)\s+(?:[\w-]+\s+){0,2}(?:part|diagram|chart|graph|button|control|menu|tab|toolbar|panel|tool|icon|object|region|area|component|drawing|model|video|clip|stream|game|animation|article|page|document|pdf|spreadsheet|worksheet|paragraph|formula|table|slide|frame|scene|equation|code|text|website|dashboard|map|canvas|timeline|photo|picture|image)\b/i;
const visibleActivity = /\b(?:i(?:'m| am)|we(?:'re| are))\s+(?:watching|reading|viewing|looking at|working on|editing|drawing)\b|\bwhat am i looking at\b/i;
const pointingQuestion = /\b(?:what(?:'s| is| does)|where(?:'s| is)|which|look at|read|explain|summari[sz]e|point to|highlight|circle|mark|show me)\b.{0,65}\b(?:this|that|these|those|here|there|it)\s*[?.!]*$/i;
const spatialGuidance = /\b(?:point (?:to|at)|show me where|highlight|mark|circle|draw (?:an? )?arrow|where (?:do i|is the|are the))\b|\bhelp me find\b[^.!?]{0,80}\b(?:button|control|menu|tab|toolbar|panel|tool|icon)\b/i;
const guidedScreenSteps = /\b(?:show me how|walk me through|guide me through)\b[^.!?]{0,140}\b(?:on (?:my|the) screen|in (?:the|this) (?:app|software|program))\b/i;

/** A request that cannot be grounded in the current display without an image. */
export function referencesVisibleScreen(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const clean = question.trim();
  const directReference = (value: string) => explicitScreen.test(value) || referencedVisual.test(value) || visibleActivity.test(value) || pointingQuestion.test(value);
  if (directReference(clean)) return true;
  const priorUser = [...history].reverse().find((turn) => turn.role === "user")?.content;
  return Boolean(priorUser && directReference(priorUser)
    && /^(?:why|how|what(?:'s| is| about| changed)|where|which|and|can you explain|tell me more|is that|does that)\b/i.test(clean));
}

export function wantsCurrentScreen(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const clean = question.trim();
  if ((continuesGuidedWorkflow(clean) || wantsToDelegateCurrentTask(clean)) && hasGuidedWorkflowContext(history)) return true;
  if (wantsComputerExecution(clean, history)) return true;
  if (wantsGuidedWorkflow(clean)) return true;
  if (wantsVisualCreation(clean) || referencesVisibleScreen(clean, history)) return true;
  const priorUser = [...history].reverse().find((turn) => turn.role === "user")?.content;
  return Boolean(priorUser && wantsVisualCreation(priorUser)
    && /^(?:why|how|what about|and|can you explain|tell me more|is that|does that)\b/i.test(clean));
}

/** A fresh capture takes precedence over phrase-based routing. */
export function shouldUseCurrentScreen(question: string, history: { role: "user" | "assistant"; content: string }[], capturedToken: string | undefined, requestToken: string | undefined) {
  return Boolean(capturedToken && requestToken && capturedToken === requestToken) || wantsCurrentScreen(question, history);
}

export function wantsSpatialGuidance(question: string) {
  return spatialGuidance.test(question) || guidedScreenSteps.test(question) || continuesGuidedWorkflow(question) || wantsGuidedWorkflow(question);
}
