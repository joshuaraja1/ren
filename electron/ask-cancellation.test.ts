import { describe, expect, it } from "vitest";
import { cancelActiveAsk } from "./ask-cancellation.js";
import { CaptureSession } from "./capture-session.js";

describe("request-scoped answer cancellation", () => {
  it("aborts the matching answer and invalidates its screen context", () => {
    const session = new CaptureSession(() => 1_000, () => "first");
    const token = session.issue(1);
    session.consume(token);
    const controller = new AbortController();

    expect(cancelActiveAsk(token, { token, controller }, session)).toEqual({ cancelled: true, invalidatedCapture: true });
    expect(controller.signal.aborted).toBe(true);
    expect(session.isCurrent(token)).toBe(false);
  });

  it("aborts an old answer without invalidating the new follow-up capture", () => {
    let next = 0;
    const session = new CaptureSession(() => 1_000, () => `token-${++next}`);
    const oldToken = session.issue(1);
    session.consume(oldToken);
    const newToken = session.issue(1);
    const controller = new AbortController();

    expect(cancelActiveAsk(oldToken, { token: oldToken, controller }, session)).toEqual({ cancelled: true, invalidatedCapture: false });
    expect(controller.signal.aborted).toBe(true);
    expect(session.consume(newToken)).toBe(1);
  });

  it("does not abort a newer answer when the old cancellation arrives late", () => {
    const session = new CaptureSession(() => 1_000, () => "new-token");
    const newToken = session.issue(1);
    const controller = new AbortController();

    expect(cancelActiveAsk("old-token", { token: newToken, controller }, session)).toEqual({ cancelled: false, invalidatedCapture: false });
    expect(cancelActiveAsk(undefined, { token: newToken, controller }, session)).toEqual({ cancelled: false, invalidatedCapture: false });
    expect(controller.signal.aborted).toBe(false);
    expect(session.consume(newToken)).toBe(1);
  });
});
