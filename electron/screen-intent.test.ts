import { describe, expect, it } from "vitest";
import { wantsCurrentScreen, wantsSpatialGuidance } from "./screen-intent.js";

describe("screen context routing", () => {
  it("keeps ordinary voice conversation off the screen path", () => {
    expect(wantsCurrentScreen("Tell me a joke about bicycles")).toBe(false);
    expect(wantsCurrentScreen("Why did you stop responding to me?")).toBe(false);
    expect(wantsCurrentScreen("How do bicycle gears work?", [{ role: "user", content: "Tell me a joke" }])).toBe(false);
  });

  it("uses the screen for explicit references and related follow-ups", () => {
    expect(wantsCurrentScreen("What does this error on my screen mean? ")).toBe(true);
    expect(wantsCurrentScreen("What does this part do?")).toBe(true);
    expect(wantsCurrentScreen("What is this? ")).toBe(true);
    expect(wantsCurrentScreen("Why?", [{ role: "user", content: "Explain this screenshot" }, { role: "assistant", content: "It shows a warning." }])).toBe(true);
    expect(wantsCurrentScreen("Why does the fan help?", [{ role: "user", content: "Draw a diagram of the hover system" }, { role: "assistant", content: "Here is the fan." }])).toBe(true);
    expect(wantsCurrentScreen("How do I run FEA in this software?")).toBe(true);
    expect(wantsCurrentScreen("Show me how to build a bracket in this CAD app")).toBe(true);
    expect(wantsCurrentScreen("How do I run FEA in FreeCAD?")).toBe(true);
    expect(wantsCurrentScreen("How can I create a table using Excel?")).toBe(true);
    expect(wantsCurrentScreen("Walk me through making a bracket in FreeCAD")).toBe(true);
    expect(wantsCurrentScreen("I want to design a bracket; can you walk me through it step by step?")).toBe(true);
    expect(wantsCurrentScreen("Guide me through titration in this chemistry app")).toBe(true);
    expect(wantsCurrentScreen("Create a CAD model of this object")).toBe(true);
    expect(wantsCurrentScreen("Next step", [{ role: "user", content: "Walk me through CAD in FreeCAD" }, { role: "assistant", content: "Select the sketch tool." }])).toBe(true);
    expect(wantsCurrentScreen("Next step", [{ role: "user", content: "Tell me a joke" }])).toBe(false);
    expect(wantsCurrentScreen("Click the visible button for me")).toBe(true);
    expect(wantsCurrentScreen("Do it for me", [{ role: "user", content: "Walk me through meshing this part" }])).toBe(true);
    const guided = [{ role: "user" as const, content: "Teach me how to build an aircraft wing in this CAD app" }, { role: "assistant" as const, content: "First, start a new sketch on the visible plane." }];
    expect(wantsCurrentScreen("I can't find the sketch tool", guided)).toBe(true);
    expect(wantsCurrentScreen("That didn't work", guided)).toBe(true);
    expect(wantsCurrentScreen("What do I click now?", guided)).toBe(true);
    expect(wantsCurrentScreen("I'm stuck", [{ role: "user", content: "Tell me a joke" }])).toBe(false);
  });

  it("only requests spatial guidance for direct pointing requests", () => {
    expect(wantsSpatialGuidance("Where is the Apple menu? Point to it.")).toBe(true);
    expect(wantsSpatialGuidance("What does this error mean?")).toBe(false);
    expect(wantsSpatialGuidance("Show me how to run FEM analysis in this software")).toBe(true);
    expect(wantsSpatialGuidance("Walk me through meshing on my screen")).toBe(true);
    expect(wantsSpatialGuidance("Next step")).toBe(true);
  });
});
