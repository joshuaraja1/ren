import { afterEach, beforeEach, expect, it, vi } from "vitest";

type EventName = "keydown" | "keyup" | "mousedown" | "wheel" | "mousemove";
type KeyEvent = { keycode: number; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean };

const mock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: KeyEvent) => void>>();
  const hook = {
    listeners: (name: string) => [...(listeners.get(name) ?? [])],
    on: (name: string, listener: (event: KeyEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeListener: (name: string, listener: (event: KeyEvent) => void) => { listeners.get(name)?.delete(listener); },
    start: vi.fn(),
    stop: vi.fn(),
  };
  const keys = { Ctrl: 29, CtrlRight: 3613, Alt: 56, AltRight: 3640, Meta: 3675, MetaRight: 3676, Shift: 42, ShiftRight: 54, Escape: 1 };
  return { hook, keys, listeners, cursor: { x: 500, y: 400 } };
});

vi.mock("node:module", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:module")>(),
  createRequire: () => (id: string) => {
    if (id !== "uiohook-napi") throw new Error(`Unexpected require: ${id}`);
    return { uIOhook: mock.hook, UiohookKey: mock.keys };
  },
}));

vi.mock("electron", () => ({
  screen: {
    getCursorScreenPoint: () => mock.cursor,
    getDisplayNearestPoint: () => ({ id: 7, bounds: { x: 0, y: 0, width: 1000, height: 800 } }),
  },
}));

import { startCircleInput, stopCircleInput } from "./circle-input.js";

const event = (keycode: number, ctrlKey: boolean, altKey: boolean): KeyEvent =>
  ({ keycode, ctrlKey, altKey, metaKey: false, shiftKey: false });
const emit = (name: EventName, payload: KeyEvent) => {
  for (const listener of mock.hook.listeners(name)) listener(payload);
};
const traceCircle = () => {
  for (let index = 1; index <= 24; index++) {
    const angle = index * 2 * Math.PI / 24;
    mock.cursor = { x: 500 + Math.cos(angle) * 70, y: 400 + Math.sin(angle) * 55 };
    emit("mousemove", event(0, true, true));
  }
};

beforeEach(() => { mock.cursor = { x: 570, y: 400 }; });
afterEach(() => { stopCircleInput(); mock.listeners.clear(); vi.clearAllMocks(); });

it("toggles voice after three Control taps without treating modifiers as screen interaction", () => {
  const onTripleControl = vi.fn();
  const onInteraction = vi.fn();
  const clock = vi.spyOn(Date, "now");
  try {
    expect(startCircleInput({ onProgress: vi.fn(), onComplete: vi.fn(), onCancel: vi.fn(), onScroll: vi.fn(), onTripleControl, onInteraction })).toBe(true);
    for (let index = 0; index < 3; index++) {
      clock.mockReturnValue(100 + index * 220);
      emit("keydown", event(mock.keys.Ctrl, true, false));
      clock.mockReturnValue(160 + index * 220);
      emit("keyup", event(mock.keys.Ctrl, false, false));
    }
    expect(onTripleControl).toHaveBeenCalledOnce();
    expect(onInteraction).not.toHaveBeenCalled();
    for (let index = 0; index < 3; index++) {
      clock.mockReturnValue(900 + index * 220);
      emit("keydown", event(mock.keys.Ctrl, true, false));
      clock.mockReturnValue(960 + index * 220);
      emit("keyup", event(mock.keys.Ctrl, false, false));
    }
    expect(onTripleControl).toHaveBeenCalledTimes(2);
  } finally { clock.mockRestore(); }
});

it.each([
  ["Control then Option", [mock.keys.Ctrl, mock.keys.Alt]],
  ["Option then Control", [mock.keys.Alt, mock.keys.Ctrl]],
] as const)("completes a Control+Option circle in %s order without toggling voice", (_label, order) => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  const onTripleControl = vi.fn();
  expect(startCircleInput({ onProgress: vi.fn(), onComplete, onCancel, onScroll: vi.fn(), onTripleControl })).toBe(true);
  emit("keydown", event(order[0], order[0] === mock.keys.Ctrl, order[0] === mock.keys.Alt));
  emit("keydown", event(order[1], true, true));
  traceCircle();
  emit("keyup", event(order[1], order[1] !== mock.keys.Ctrl, order[1] !== mock.keys.Alt));
  emit("keyup", event(order[0], false, false));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(7, expect.objectContaining({
    bounds: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) }),
  }));
  expect(onCancel).not.toHaveBeenCalled();
  expect(onTripleControl).not.toHaveBeenCalled();
});

it("cancels an unfinished Control+Option circle on Escape", () => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  const onTripleControl = vi.fn();
  expect(startCircleInput({ onProgress: vi.fn(), onComplete, onCancel, onScroll: vi.fn(), onTripleControl })).toBe(true);
  emit("keydown", event(mock.keys.Ctrl, true, false));
  emit("keydown", event(mock.keys.Alt, true, true));
  traceCircle();
  emit("keydown", event(mock.keys.Escape, true, true));
  emit("keyup", event(mock.keys.Alt, true, false));
  emit("keyup", event(mock.keys.Ctrl, false, false));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(onTripleControl).not.toHaveBeenCalled();
});
