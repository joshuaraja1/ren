import { it, expect } from "vitest";
import { CaptureSession } from "./capture-session.js";
import { consumeAgentJobCapture } from "./agent-job-capture.js";

it("hands captured frames to the job without exposing them to the renderer", () => {
  const session = new CaptureSession(() => 100, () => "capture-1");
  const token = session.issue(1);
  const capture = { token, frames: ["data:image/png;base64,dGVzdA=="] };
  expect(consumeAgentJobCapture({ task: "explain this", contextToken: token }, capture, session)).toEqual({ task: "explain this", frames: capture.frames });
  expect(() => consumeAgentJobCapture({ task: "again", contextToken: token }, capture, session)).toThrow("Screen context expired");
});

it("rejects a token that does not match the captured screen", () => {
  const session = new CaptureSession(() => 100, () => "capture-1");
  session.issue(1);
  expect(() => consumeAgentJobCapture({ task: "explain this", contextToken: "other" }, { token: "capture-1", frames: [] }, session)).toThrow("Screen context expired");
});
