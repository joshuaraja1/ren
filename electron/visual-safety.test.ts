import { describe, expect, it } from "vitest";
import { canPlaceSpatialVisual } from "./visual-safety.js";

describe("spatial visual safety", () => {
  it("allows static context without the input hook", () => expect(canPlaceSpatialVisual(false, false)).toBe(true));
  it("rejects a moving screen without the input hook", () => expect(canPlaceSpatialVisual(true, false)).toBe(false));
  it("allows video while interaction tracking is active", () => expect(canPlaceSpatialVisual(true, true)).toBe(true));
});
