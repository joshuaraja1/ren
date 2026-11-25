type Point = { x: number; y: number };
type Focus = Point & { width: number; height: number };
type Turn = { role: "user" | "assistant"; content: string };

export type ValidAskRequest = {
  question: string;
  frames: string[];
  history: Turn[];
  pointer?: Point;
  focus?: Focus;
  contextToken?: string;
};

const unit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function parseAskRequest(value: unknown): ValidAskRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request");
  const raw = value as Record<string, unknown>;
  if (typeof raw.question !== "string" || !raw.question.trim() || raw.question.length > 4000) throw new Error("Invalid question");
  if (!Array.isArray(raw.frames) || raw.frames.length > 3 || raw.frames.some((frame) =>
    typeof frame !== "string" || frame.length > 12_000_000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(frame))) {
    throw new Error("Invalid screen frames");
  }
  if (!Array.isArray(raw.history) || raw.history.length > 8 || raw.history.some((turn) =>
    !turn || typeof turn !== "object" || !["user", "assistant"].includes(turn.role) || typeof turn.content !== "string" || turn.content.length > 5000)) {
    throw new Error("Invalid conversation history");
  }
  const pointer = raw.pointer && typeof raw.pointer === "object" ? raw.pointer as Record<string, unknown> : null;
  const focus = raw.focus && typeof raw.focus === "object" ? raw.focus as Record<string, unknown> : null;
  return {
    question: raw.question.trim(),
    frames: raw.frames as string[],
    history: raw.history as Turn[],
    pointer: pointer && unit(pointer.x) && unit(pointer.y) ? { x: pointer.x, y: pointer.y } : undefined,
    focus: focus && unit(focus.x) && unit(focus.y) && unit(focus.width) && unit(focus.height)
      && focus.width > 0 && focus.height > 0 && focus.x + focus.width <= 1 && focus.y + focus.height <= 1
      ? { x: focus.x, y: focus.y, width: focus.width, height: focus.height } : undefined,
    contextToken: typeof raw.contextToken === "string" && /^[0-9a-f-]{36}$/i.test(raw.contextToken) ? raw.contextToken : undefined,
  };
}
