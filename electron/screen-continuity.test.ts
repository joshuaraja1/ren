import { describe, expect, it } from "vitest";
import { isSameStableScreen } from "./screen-continuity.js";

const frame = () => new Uint8Array(100 * 4);
const paint = (image: Uint8Array, start: number, end: number, value: number) => {
  for (let i = start; i < end; i += 1) image.fill(value, i * 4, i * 4 + 3);
};

describe("screen continuity", () => {
  it("accepts a playing video when surrounding UI stays put", () => {
    const first = frame(); const second = frame(); const fresh = frame();
    paint(second, 20, 80, 120); paint(fresh, 20, 80, 220);
    expect(isSameStableScreen(first, second, fresh)).toBe(true);
  });
  it("rejects switched tabs even when the video region was moving", () => {
    const first = frame(); const second = frame(); const fresh = frame();
    paint(second, 20, 80, 120); paint(fresh, 20, 80, 220); paint(fresh, 0, 20, 180);
    expect(isSameStableScreen(first, second, fresh)).toBe(false);
  });
  it("fails closed when a full-screen video leaves too few anchors", () => {
    const first = frame(); const second = frame(); const fresh = frame();
    paint(second, 10, 100, 120); paint(fresh, 10, 100, 220);
    expect(isSameStableScreen(first, second, fresh)).toBe(false);
  });
  it("rejects incompatible bitmaps", () => expect(isSameStableScreen(frame(), frame(), new Uint8Array(8))).toBe(false));
});
