// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventEmitter } from "node:events";

type MockChild = EventEmitter & { postMessage: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> };
const mock = vi.hoisted(() => ({ children: [] as MockChild[] }));

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    app: { isPackaged: false, getAppPath: () => process.cwd() },
    utilityProcess: {
      fork: () => {
        const child = Object.assign(new EventEmitter(), { postMessage: vi.fn(), kill: vi.fn() });
        mock.children.push(child);
        queueMicrotask(() => child.emit("spawn"));
        return child;
      },
    },
  };
});

import { startSpeech } from "./speech.js";

describe("speech worker lifecycle", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("ignores an old worker exit after a timed-out worker is replaced", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const first = startSpeech(16_000);
    const firstFailure = expect(first).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.children).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await firstFailure;

    const second = startSpeech(16_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.children).toHaveLength(2);
    mock.children[0].emit("exit");
    mock.children[1].emit("message", { id: 2, result: true });
    await expect(second).resolves.toBe(true);
  });
});
