import { expect, it } from "vitest";
import { continuesGuidedWorkflow, guidedHistory, hasGuidedWorkflowContext, wantsGuidedWorkflow, wantsToDelegateCurrentTask } from "./guided-workflow.js";

it("recognizes explicit guided work across domains and concise continuations", () => {
  for (const request of [
    "Walk me through making a bracket in FreeCAD",
    "Show me how to run FEA step by step",
    "Guide me through balancing this chemistry equation in the app",
    "Explain this physics experiment one step at a time",
    "Teach me how to model a wing in the CAD app",
    "Help me learn to set up this microscope software",
    "Help me design an aircraft wing in FreeCAD",
    "How do I design an aircraft in FreeCAD?",
    "How can I create a table using Excel?",
  ]) expect(wantsGuidedWorkflow(request)).toBe(true);
  expect(wantsGuidedWorkflow("How do I cook rice in a pot?")).toBe(false);
  for (const request of ["Next step", "I did that, what next?", "Continue", "Done", "I clicked the mesh button", "I can't find the sketch tool", "That didn't work", "What do I click now?", "I'm stuck"])
    expect(continuesGuidedWorkflow(request)).toBe(true);
  expect(continuesGuidedWorkflow("Next week is Thursday")).toBe(false);
  expect(hasGuidedWorkflowContext([{ role: "user", content: "Walk me through CAD in FreeCAD" }])).toBe(true);
  const recent = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `Step ${index}` }));
  expect(guidedHistory("Next step", recent, "Walk me through CAD in FreeCAD")[0].content).toBe("Walk me through CAD in FreeCAD");
  expect(wantsToDelegateCurrentTask("Can you do it for me?")).toBe(true);
  expect(guidedHistory("Do it for me", recent, "Walk me through CAD in FreeCAD")[0].content).toBe("Walk me through CAD in FreeCAD");
  expect(guidedHistory("I can't find the sketch tool", recent, "Walk me through CAD in FreeCAD")[0].content).toBe("Walk me through CAD in FreeCAD");
});
