import { screen } from "electron";
import { createRequire } from "node:module";
import { addCirclePoint, circlePath, finishCircle, type AbsolutePoint, type FocusRegion } from "./circle-geometry.js";

type Hooks = {
  onProgress(displayId: number, points: FocusRegion["points"]): void;
  onComplete(displayId: number, focus: FocusRegion): void;
  onCancel(): void;
  onScroll(): void;
  onInteraction?(): void;
};

const require = createRequire(import.meta.url);
let running = false;
let stopHook: (() => void) | null = null;

export function startCircleInput(hooks: Hooks) {
  if (running) return true;
  try {
    const { uIOhook, UiohookKey } = require("uiohook-napi") as typeof import("uiohook-napi");
    const modifierKeys = new Set<number>([UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Alt, UiohookKey.AltRight]);
    let active: { displayId: number; bounds: Electron.Rectangle; points: AbsolutePoint[] } | null = null;
    let lastDrawn = 0;
    const cancel = () => { if (active) { active = null; hooks.onCancel(); } };
    const finish = () => {
      if (!active) return;
      const result = finishCircle(active.points, active.bounds);
      const displayId = active.displayId;
      active = null;
      if (result) hooks.onComplete(displayId, result);
      else hooks.onCancel();
    };
    uIOhook.on("keydown", (event) => {
      hooks.onInteraction?.();
      if (event.keycode === UiohookKey.Escape) { cancel(); return; }
      if (active || !event.ctrlKey || !event.altKey) return;
      if (!modifierKeys.has(event.keycode)) return;
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      active = { displayId: display.id, bounds: display.bounds, points: [cursor] };
    });
    uIOhook.on("keyup", (event) => {
      if (modifierKeys.has(event.keycode)) finish();
    });
    uIOhook.on("mousedown", () => { hooks.onInteraction?.(); cancel(); });
    uIOhook.on("wheel", () => { cancel(); hooks.onScroll(); });
    uIOhook.on("mousemove", (event) => {
      if (!active) return;
      if (!event.ctrlKey || !event.altKey) { finish(); return; }
      const cursor = screen.getCursorScreenPoint();
      if (screen.getDisplayNearestPoint(cursor).id !== active.displayId) { cancel(); return; }
      if (!addCirclePoint(active.points, cursor)) return;
      const now = Date.now();
      if (now - lastDrawn >= 33 && active.points.length >= 3) {
        lastDrawn = now;
        hooks.onProgress(active.displayId, circlePath(active.points, active.bounds));
      }
    });
    uIOhook.start();
    stopHook = () => uIOhook.stop();
    running = true;
    return true;
  } catch {
    return false;
  }
}

export function stopCircleInput() { stopHook?.(); stopHook = null; running = false; }
