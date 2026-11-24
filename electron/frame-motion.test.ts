import { describe, expect, it } from "vitest";
import { hasMeaningfulMotion } from "./frame-motion.js";

const frame = (pixels: number) => new Uint8Array(pixels * 4);

describe("screen motion selection", () => {
  it("keeps static screens to one full frame", () => {
    expect(hasMeaningfulMotion(frame(400), frame(400))).toBe(false);
  });

  it("ignores a small blinking cursor but keeps a changing video region", () => {
    const before = frame(400);
    const cursor = frame(400);
    for (let index = 0; index < 8; index += 1) cursor.fill(255, index * 4, index * 4 + 3);
    expect(hasMeaningfulMotion(before, cursor)).toBe(false);

    const video = frame(400);
    for (let index = 0; index < 100; index += 1) video.fill(255, index * 4, index * 4 + 3);
    expect(hasMeaningfulMotion(before, video)).toBe(true);
  });

  it("does not compare incompatible thumbnails", () => {
    expect(hasMeaningfulMotion(frame(400), frame(399))).toBe(false);
  });
});
