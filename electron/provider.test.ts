import { describe, expect, it } from "vitest";
import { validateAnnotations } from "./provider.js";

describe("annotation validation", () => {
  it("clamps coordinates and rejects unknown commands", () => {
    const result = validateAnnotations([
      { id: "arrow", type: "arrow", from: { x: -3, y: 2 }, to: { x: .5, y: .5 } },
      { id: "unsafe", type: "click", at: { x: .5, y: .5 } },
    ]);

    expect(result).toEqual([{ id: "arrow", type: "arrow", from: { x: 0, y: 1 }, to: { x: .5, y: .5 }, label: undefined, color: undefined }]);
  });
});

