import { expect, it } from "vitest";
import { wantsReferenceRecreation, wantsVisualCreation } from "./visual-intent.js";

it("renders only when the learner explicitly asks for a visual", () => {
  expect(wantsVisualCreation("Can you recreate that jet for me and explain it? ")).toBe(true);
  expect(wantsVisualCreation("Draw the airplane on my screen")).toBe(true);
  expect(wantsVisualCreation("Show me a 3D model of this")).toBe(true);
  expect(wantsVisualCreation("Show a diagram of how it hovers")).toBe(true);
  expect(wantsVisualCreation("Can you diagram the engine and lift fan?")).toBe(true);
  expect(wantsVisualCreation("How does this diagram work?")).toBe(false);
  expect(wantsVisualCreation("How does this jet work? ")).toBe(false);
});

it("uses visible pixels only for appearance recreation, not a new explanatory diagram", () => {
  expect(wantsReferenceRecreation("Draw a diagram explaining this jet in your own way")).toBe(false);
  expect(wantsReferenceRecreation("Show me how this diagram works")).toBe(false);
  expect(wantsReferenceRecreation("Recreate this visible phone exactly")).toBe(true);
});
