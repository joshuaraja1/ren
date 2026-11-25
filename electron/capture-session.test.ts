import { describe, expect, it } from "vitest";
import { CaptureSession } from "./capture-session.js";

describe("capture-bound answer session", () => {
  it("allows one ask and rejects replay or a later capture", () => {
    let id = 0;
    const session = new CaptureSession(() => 1000, () => `token-${++id}`);
    const first = session.issue(12);
    expect(session.consume(first)).toBe(12);
    expect(() => session.consume(first)).toThrow(/expired/);
    const second = session.issue(14);
    expect(session.isCurrent(first)).toBe(false);
    expect(session.consume(second)).toBe(14);
  });

  it("invalidates pending responses after scroll or display change", () => {
    let now = 1000;
    const session = new CaptureSession(() => now, () => "token");
    const token = session.issue(1);
    session.consume(token);
    session.invalidate();
    expect(session.isCurrent(token)).toBe(false);
    const later = session.issue(2);
    now += 90_001;
    expect(() => session.consume(later)).toThrow(/expired/);
  });
});
