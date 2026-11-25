import { randomUUID } from "node:crypto";

export class CaptureSession {
  private currentCapture: { token: string; displayId: number; issuedAt: number; used: boolean } | null = null;
  constructor(private readonly now: () => number = Date.now, private readonly createToken: () => string = randomUUID) {}

  issue(displayId: number) {
    const token = this.createToken();
    this.currentCapture = { token, displayId, issuedAt: this.now(), used: false };
    return token;
  }

  consume(token: string) {
    const capture = this.currentCapture;
    if (!capture || capture.token !== token || capture.used || this.now() - capture.issuedAt > 90_000) throw new Error("Screen context expired. Ask again.");
    capture.used = true;
    return capture.displayId;
  }

  isCurrent(token: string) {
    const capture = this.currentCapture;
    return Boolean(capture && capture.token === token && this.now() - capture.issuedAt <= 90_000);
  }

  invalidate() { this.currentCapture = null; }
}
