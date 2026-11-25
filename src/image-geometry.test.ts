import { expect, it } from "vitest";
import { imageBox } from "./image-geometry";

it("maps points into the visible contained image, including letterboxing", () => {
  const box = imageBox(800, 400, 1024, 1024);
  expect(box.width).toBeCloseTo(.46);
  expect(box.height).toBeCloseTo(.92);
  expect(box.x).toBeCloseTo(.27);
  expect(box.x + box.width).toBeLessThan(.86);
});
