import { normalizeCursor } from "./display-geometry";

describe("multi-monitor pointer mapping", () => {
  it("normalizes a cursor on a display to the left of the primary display", () => {
    expect(normalizeCursor({ x: -960, y: 540 }, { x: -1920, y: 0, width: 1920, height: 1080 })).toEqual({ x: .5, y: .5 });
  });

  it("maps a vertically stacked display and clamps edge coordinates", () => {
    const bounds = { x: 200, y: -1200, width: 1600, height: 900 };
    expect(normalizeCursor({ x: 1000, y: -750 }, bounds)).toEqual({ x: .5, y: .5 });
    expect(normalizeCursor({ x: 1900, y: -1300 }, bounds)).toEqual({ x: 1, y: 0 });
  });
});
