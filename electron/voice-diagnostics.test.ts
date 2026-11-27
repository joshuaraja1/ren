import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ directory: "" }));
vi.mock("electron", () => ({ app: { getPath: () => mock.directory } }));

import { recordVoiceStage } from "./voice-diagnostics.js";

beforeEach(() => { mock.directory = mkdtempSync(join(tmpdir(), "ren-voice-events-")); });
afterEach(() => { rmSync(mock.directory, { recursive: true, force: true }); });

it("records voice pipeline stages without storing speech or arbitrary text", () => {
  const id = "test-request-1234";
  expect(recordVoiceStage("wake_detected", id)).toBe(true);
  expect(recordVoiceStage("the user's private words", id)).toBe(false);
  expect(recordVoiceStage("answer_ready", "private words here")).toBe(false);
  expect(recordVoiceStage("answer_ready", id)).toBe(true);
  const entries = readFileSync(join(mock.directory, "voice-events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  expect(entries.map(({ stage }: { stage: string }) => stage)).toEqual(["wake_detected", "answer_ready"]);
  expect(entries.every(({ requestId }: { requestId: string }) => requestId === id)).toBe(true);
});
