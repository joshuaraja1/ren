import { expect, it } from "vitest";
import { imageBox } from "./image-geometry";

it("maps points into the visible contained image, including letterboxing", () => {
  const box = imageBox(800, 400, 1024, 1024);
  expect(box.width).toBeCloseTo(.43);
  expect(box.height).toBeCloseTo(.86);
  expect(box.x).toBeCloseTo(.285);
  expect(box.x + box.width).toBeLessThan(.86);
});
