import { expect, it } from "vitest";
import { wantsVisualCreation } from "./visual-intent.js";

it("renders only when the learner explicitly asks for a visual", () => {
  expect(wantsVisualCreation("Can you recreate that jet for me and explain it? ")).toBe(true);
  expect(wantsVisualCreation("Draw the airplane on my screen")).toBe(true);
  expect(wantsVisualCreation("Show me a 3D model of this")).toBe(true);
  expect(wantsVisualCreation("Show a diagram of how it hovers")).toBe(true);
  expect(wantsVisualCreation("Can you diagram the engine and lift fan?")).toBe(true);
  expect(wantsVisualCreation("How does this diagram work?")).toBe(false);
  expect(wantsVisualCreation("How does this jet work? ")).toBe(false);
});
