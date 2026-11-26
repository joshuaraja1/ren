import type { CaptureSession } from "./capture-session.js";

export type ActiveAskRequest = { token: string; controller: AbortController };

export function cancelActiveAsk(
  requestedToken: unknown,
  active: ActiveAskRequest | null,
  captureSession: CaptureSession,
): { cancelled: boolean; invalidatedCapture: boolean } {
  if (typeof requestedToken !== "string" || !active || active.token !== requestedToken) {
    return { cancelled: false, invalidatedCapture: false };
  }
  active.controller.abort();
  const invalidatedCapture = captureSession.isCurrent(requestedToken);
  if (invalidatedCapture) captureSession.invalidate();
  return { cancelled: true, invalidatedCapture };
}
