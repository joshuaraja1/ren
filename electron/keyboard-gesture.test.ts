import { describe, expect, it, vi } from "vitest";
import { TripleControlGesture } from "./keyboard-gesture.js";

const CTRL = 29;
const RIGHT_CTRL = 3613;
const controlKeys = new Set([CTRL, RIGHT_CTRL]);
const down = (keycode: number, overrides: Partial<{ altKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
  ({ keycode, altKey: false, metaKey: false, shiftKey: false, ...overrides });

describe("TripleControlGesture", () => {
  it("does not count a long Control hold as a tap", () => {
    const toggle = vi.fn();
    const gesture = new TripleControlGesture(controlKeys, toggle);
    gesture.keyDown({ keycode: CTRL, altKey: false, metaKey: false, shiftKey: false }, 100);
    gesture.keyUp({ keycode: CTRL }, 1_000);
    for (const start of [1_100, 1_250]) {
      gesture.keyDown({ keycode: CTRL, altKey: false, metaKey: false, shiftKey: false }, start);
      gesture.keyUp({ keycode: CTRL }, start + 50);
    }
    expect(toggle).not.toHaveBeenCalled();
  });
  it("toggles after three released Control taps and can toggle again", () => {
    const toggle = vi.fn();
    const gesture = new TripleControlGesture(controlKeys, toggle);
    for (const [index, key] of [CTRL, RIGHT_CTRL, CTRL].entries()) {
      gesture.keyDown(down(key), 100 + index * 200);
      gesture.keyUp({ keycode: key }, 140 + index * 200);
    }
    expect(toggle).toHaveBeenCalledTimes(1);
    for (const index of [0, 1, 2]) {
      gesture.keyDown(down(CTRL), 800 + index * 160);
      gesture.keyUp({ keycode: CTRL }, 840 + index * 160);
    }
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("ignores repeated keydowns during one hold", () => {
    const toggle = vi.fn();
    const gesture = new TripleControlGesture(controlKeys, toggle);
    gesture.keyDown(down(CTRL), 0);
    gesture.keyDown(down(CTRL), 50);
    gesture.keyDown(down(CTRL), 100);
    gesture.keyUp({ keycode: CTRL }, 150);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("resets after a slow tap or another key", () => {
    const toggle = vi.fn();
    const gesture = new TripleControlGesture(controlKeys, toggle);
    gesture.keyDown(down(CTRL), 0);
    gesture.keyUp({ keycode: CTRL }, 30);
    gesture.keyDown(down(CTRL), 800);
    gesture.keyUp({ keycode: CTRL }, 830);
    gesture.keyDown(down(65), 900);
    for (const index of [0, 1]) {
      gesture.keyDown(down(CTRL), 1000 + index * 180);
      gesture.keyUp({ keycode: CTRL }, 1040 + index * 180);
    }
    expect(toggle).not.toHaveBeenCalled();
  });

  it("does not count shortcut chords or overlapping Control keys", () => {
    const toggle = vi.fn();
    const gesture = new TripleControlGesture(controlKeys, toggle);
    gesture.keyDown(down(CTRL, { altKey: true }), 0);
    gesture.keyUp({ keycode: CTRL }, 40);
    gesture.keyDown(down(CTRL), 100);
    gesture.keyDown(down(RIGHT_CTRL), 120);
    gesture.keyUp({ keycode: CTRL }, 140);
    gesture.keyUp({ keycode: RIGHT_CTRL }, 160);
    for (const index of [0, 1]) {
      gesture.keyDown(down(CTRL), 200 + index * 180);
      gesture.keyUp({ keycode: CTRL }, 240 + index * 180);
    }
    expect(toggle).not.toHaveBeenCalled();
  });
});
