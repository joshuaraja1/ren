import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

const stages = new Set([
  "wake_detected", "dictation_started", "transcript_ready", "transcript_empty",
  "transcript_rejected", "request_sent", "answer_ready", "playback_requested",
  "playback_started", "playback_done", "followup_open", "error",
]);

/** Records only stage names and a random request ID, never speech or screen content. */
export function recordVoiceStage(stage: unknown, requestId: unknown) {
  if (typeof stage !== "string" || !stages.has(stage) || typeof requestId !== "string" || !/^[\w-]{8,64}$/.test(requestId)) return false;
  try {
    const directory = app.getPath("userData");
    mkdirSync(directory, { recursive: true });
    const file = join(directory, "voice-events.jsonl");
    if (existsSync(file) && statSync(file).size > 256_000) renameSync(file, `${file}.previous`);
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), requestId, stage })}\n`);
    return true;
  } catch {
    return false;
  }
}
