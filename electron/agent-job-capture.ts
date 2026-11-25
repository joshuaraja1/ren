import type { CaptureSession } from "./capture-session.js";

/** Resolve a renderer's opaque capture token to frames kept only in the main process. */
export function consumeAgentJobCapture(
  input: unknown,
  capture: { token: string; frames: string[] } | null,
  session: CaptureSession,
): { task: string; frames: string[] } {
  const value = input as { task?: unknown; contextToken?: unknown } | null;
  if (!value || typeof value.task !== "string" || typeof value.contextToken !== "string" ||
    !capture || capture.token !== value.contextToken || !session.isCurrent(value.contextToken)) {
    throw new Error("Screen context expired. Ask again.");
  }
  session.consume(value.contextToken);
  return { task: value.task, frames: capture.frames };
}
