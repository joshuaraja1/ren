import { expect, it } from "vitest";
import { likelyVisualFollowUp, wantsReferenceRecreation, wantsVisualCreation } from "./visual-intent.js";

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

it("keeps a referenced diagram visible while a follow-up is prepared", () => {
  expect(likelyVisualFollowUp("Why does the fan help?", "Hover thrust", ["Lift fan", "Engine"])).toBe(true);
  expect(likelyVisualFollowUp("How does it stay level?", "Hover thrust", ["Lift fan"])).toBe(true);
  expect(likelyVisualFollowUp("What is this page?", "Hover thrust", ["Lift fan"])).toBe(false);
  expect(likelyVisualFollowUp("New topic: explain this document", "Hover thrust", ["Lift fan"])).toBe(false);
});
