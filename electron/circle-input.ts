import { screen } from "electron";
import { createRequire } from "node:module";
import { addCirclePoint, circlePath, finishCircle, type AbsolutePoint, type FocusRegion } from "./circle-geometry.js";
import { TripleControlGesture } from "./keyboard-gesture.js";

type Hooks = {
  onProgress(displayId: number, points: FocusRegion["points"]): void;
  onComplete(displayId: number, focus: FocusRegion): void;
  onCancel(): void;
  onScroll(): void;
  onInteraction?(): void;
  onTripleControl?(): void;
  onSketchProgress?(displayId: number, points: FocusRegion["points"]): void;
  onSketchComplete?(displayId: number, points: FocusRegion["points"]): void;
  onSketchCancel?(): void;
};

const require = createRequire(import.meta.url);
let running = false;
let stopHook: (() => void) | null = null;

export function startCircleInput(hooks: Hooks) {
  if (running) return true;
  let removeListeners: (() => void) | null = null;
  try {
    const { uIOhook, UiohookKey } = require("uiohook-napi") as typeof import("uiohook-napi");
    const events = ["keydown", "keyup", "mousedown", "wheel", "mousemove"] as const;
    const previous = new Map(events.map((event) => [event, uIOhook.listeners(event)]));
    removeListeners = () => {
      for (const event of events) {
        for (const listener of uIOhook.listeners(event)) {
          if (!previous.get(event)?.includes(listener)) uIOhook.removeListener(event, listener as (...args: unknown[]) => void);
        }
      }
    };
    const controlKeys = new Set<number>([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
    const circleKeys = new Set<number>([...controlKeys, UiohookKey.Alt, UiohookKey.AltRight]);
    const sketchKeys = new Set<number>([UiohookKey.Meta, UiohookKey.MetaRight, UiohookKey.Alt, UiohookKey.AltRight]);
    const modifierKeys = new Set<number>([...circleKeys, ...sketchKeys, UiohookKey.Shift, UiohookKey.ShiftRight]);
    const gesture = new TripleControlGesture(controlKeys, () => hooks.onTripleControl?.());
    let active: { mode: "circle" | "sketch"; displayId: number; bounds: Electron.Rectangle; points: AbsolutePoint[] } | null = null;
    let lastDrawn = 0;
    const cancel = () => {
      if (!active) return;
      const mode = active.mode;
      active = null;
      if (mode === "circle") hooks.onCancel();
      else hooks.onSketchCancel?.();
    };
    const finish = () => {
      if (!active) return;
      const { mode, points, bounds, displayId } = active;
      const cursor = screen.getCursorScreenPoint();
      if (screen.getDisplayNearestPoint(cursor).id === displayId) addCirclePoint(points, cursor);
      active = null;
      if (mode === "circle") {
        const result = finishCircle(points, bounds);
        if (result) hooks.onComplete(displayId, result);
        else hooks.onCancel();
      } else if (points.length >= 4 && points.slice(1).reduce((length, point, index) =>
        length + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0) >= 24) {
        const closed = Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) <= 24;
        hooks.onSketchComplete?.(displayId, circlePath(closed ? [...points, points[0]] : points, bounds));
      } else hooks.onSketchCancel?.();
    };
    uIOhook.on("keydown", (event) => {
      if (!modifierKeys.has(event.keycode)) hooks.onInteraction?.();
      gesture.keyDown(event);
      if (event.keycode === UiohookKey.Escape) { cancel(); return; }
      if (active) return;
      const mode = event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && circleKeys.has(event.keycode)
        ? "circle"
        : event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey && sketchKeys.has(event.keycode)
          ? "sketch"
          : null;
      if (!mode) return;
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      active = { mode, displayId: display.id, bounds: display.bounds, points: [cursor] };
      lastDrawn = 0;
    });
    uIOhook.on("keyup", (event) => {
      gesture.keyUp(event);
      if (active?.mode === "circle" && circleKeys.has(event.keycode)) finish();
      else if (active?.mode === "sketch" && sketchKeys.has(event.keycode)) finish();
    });
    uIOhook.on("mousedown", () => { hooks.onInteraction?.(); cancel(); });
    uIOhook.on("wheel", () => { cancel(); hooks.onScroll(); });
    uIOhook.on("mousemove", () => {
      if (!active) return;
      const cursor = screen.getCursorScreenPoint();
      if (screen.getDisplayNearestPoint(cursor).id !== active.displayId) { cancel(); return; }
      if (!addCirclePoint(active.points, cursor)) return;
      const now = Date.now();
      if (now - lastDrawn >= 16 && active.points.length >= 2) {
        lastDrawn = now;
        const path = circlePath(active.points, active.bounds);
        if (active.mode === "circle") hooks.onProgress(active.displayId, path);
        else hooks.onSketchProgress?.(active.displayId, path);
      }
    });
    uIOhook.start();
    stopHook = () => { uIOhook.stop(); removeListeners?.(); };
    running = true;
    return true;
  } catch (error) {
    console.error("Ren global shortcut hook could not start:", error);
    removeListeners?.();
    return false;
  }
}

export function stopCircleInput() { stopHook?.(); stopHook = null; running = false; }
