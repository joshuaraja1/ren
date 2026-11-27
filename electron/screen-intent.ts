import { wantsVisualCreation } from "./visual-intent.js";
import { continuesGuidedWorkflow, hasGuidedWorkflowContext, wantsGuidedWorkflow, wantsToDelegateCurrentTask } from "./guided-workflow.js";
import { wantsComputerExecution } from "./computer-intent.js";

const explicitScreen = /\b(?:screen|screenshot|display|cursor|pointer|window|webpage|browser tab|photo|picture|image|video|visible|on[- ]screen|this app|this page|this software|this program|in (?:the|this) (?:(?:cad|fea|fem) )?(?:app|software|program)|overlay)\b/i;
const referencedVisual = /\b(?:this|that|these|those)\s+(?:part|diagram|chart|graph|button|menu|icon|object|region|area|component|drawing)\b/i;
const pointingQuestion = /\b(?:what(?:'s| is| does)|where(?:'s| is)|which|look at|read|explain|summari[sz]e|point to|highlight|circle|mark|show me)\b.{0,65}\b(?:this|that|these|those|here|there|it)\s*[?.!]*$/i;
const spatialGuidance = /\b(?:point (?:to|at)|show me where|highlight|mark|circle|draw (?:an? )?arrow|where (?:do i|is the|are the))\b/i;
const guidedScreenSteps = /\b(?:show me how|walk me through|guide me through)\b[^.!?]{0,140}\b(?:on (?:my|the) screen|in (?:the|this) (?:(?:cad|fea|fem) )?(?:app|software|program))\b/i;

export function wantsCurrentScreen(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const clean = question.trim();
  if ((continuesGuidedWorkflow(clean) || wantsToDelegateCurrentTask(clean)) && hasGuidedWorkflowContext(history)) return true;
  if (wantsComputerExecution(clean, history)) return true;
  if (wantsGuidedWorkflow(clean)) return true;
  if (/\b(?:cad|freecad|parametric)\b[^.!?]{0,100}\b(?:this|that|on (?:my|the) screen)\b/i.test(clean)) return true;
  if (wantsVisualCreation(clean) || explicitScreen.test(clean) || referencedVisual.test(clean) || pointingQuestion.test(clean)) return true;
  const priorUser = [...history].reverse().find((turn) => turn.role === "user")?.content;
  return Boolean(priorUser && (wantsVisualCreation(priorUser) || explicitScreen.test(priorUser) || referencedVisual.test(priorUser) || pointingQuestion.test(priorUser))
    && /^(?:why|how|what about|and|can you explain|tell me more|is that|does that)\b/i.test(question.trim()));
}

export function wantsSpatialGuidance(question: string) {
  return spatialGuidance.test(question) || guidedScreenSteps.test(question) || continuesGuidedWorkflow(question) || wantsGuidedWorkflow(question);
}
