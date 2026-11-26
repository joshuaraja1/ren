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
  });

  it("only requests spatial guidance for direct pointing requests", () => {
    expect(wantsSpatialGuidance("Where is the Apple menu? Point to it.")).toBe(true);
    expect(wantsSpatialGuidance("What does this error mean?")).toBe(false);
  });
});
