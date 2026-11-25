import { describe, expect, it } from "vitest";
import { placeLessonCard } from "./lesson-placement";

describe("lesson card placement", () => {
  it("keeps tall explanation cards on screen near the bottom", () => {
    const place = placeLessonCard(500, 700, 170, 130, 900, 720);
    expect(700 + place.y + 130).toBeLessThanOrEqual(712);
  });
  it("flips and clamps cards near the right edge", () => {
    const place = placeLessonCard(890, 300, 170, 80, 900, 720);
    expect(place.right).toBe(true);
    expect(890 + place.x + 170).toBeLessThanOrEqual(892);
  });
});
