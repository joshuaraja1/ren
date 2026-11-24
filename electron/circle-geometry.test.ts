import { addCirclePoint, finishCircle } from "./circle-geometry";

const display = { x: -1920, y: -200, width: 1920, height: 1080 };

describe("circle-to-focus geometry", () => {
  it("recognizes a rough circle on a display left of the primary", () => {
    const points: { x: number; y: number }[] = [];
    for (let index = 0; index <= 30; index += 1) {
      const angle = index / 30 * Math.PI * 2;
      addCirclePoint(points, { x: -1000 + Math.cos(angle) * 130, y: 250 + Math.sin(angle) * 95 });
    }
    const focus = finishCircle(points, display);
    expect(focus).not.toBeNull();
    expect(focus!.bounds.x).toBeGreaterThan(0.3);
    expect(focus!.bounds.x).toBeLessThan(0.5);
    expect(focus!.bounds.y).toBeGreaterThan(0.2);
    expect(focus!.points.at(-1)).toEqual(focus!.points[0]);
  });

  it("rejects a short stroke and an open scribble", () => {
    expect(finishCircle([{ x: -1000, y: 250 }], display)).toBeNull();
    const line = Array.from({ length: 20 }, (_, index) => ({ x: -1000 + index * 8, y: 250 + index * 2 }));
    expect(finishCircle(line, display)).toBeNull();
  });
});
