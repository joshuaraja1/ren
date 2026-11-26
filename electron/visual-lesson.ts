import { validateSceneSpec, type SceneSpec } from "./scene-spec.js";

export type VisualPart = {
  id: string;
  label: string;
  explanation: string;
  x: number;
  y: number;
};

export type VisualConnection = {
  from: string;
  to: string;
  label: string;
};

export type VisualLesson = {
  version: 1;
  dimension?: 2 | 3;
  /** Renderer-only: reveal the lesson after its requested image is complete. */
  pendingIllustration?: boolean;
  layout?: "centered";
  scene?: "f35b-hover" | "conceptual-3d";
  model?: SceneSpec;
  title: string;
  assumption?: string;
  placement: { x: number; y: number; width: number; height: number };
  parts: VisualPart[];
  connections: VisualConnection[];
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const clean = (value: unknown, limit: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit).trim() : "";
const coordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** Reject malformed model output and keep only bounded, connected teaching geometry. */
export function validateVisualLesson(value: unknown): VisualLesson | null {
  const raw = record(value);
  if (!raw) return null;
  const title = clean(raw.title, 100);
  const placement = record(raw.placement);
  if (raw.version !== 1 || !title || !Array.isArray(raw.parts) || raw.parts.length < 2 || raw.parts.length > 12
    || !Array.isArray(raw.connections) || raw.connections.length < 1 || raw.connections.length > 20
    || !placement || !coordinate(placement.x) || !coordinate(placement.y)
    || !coordinate(placement.width) || !coordinate(placement.height)
    || placement.width < 0.1 || placement.height < 0.1
    || placement.x + placement.width > 1 || placement.y + placement.height > 1) return null;

  const parts: VisualPart[] = [];
  const ids = new Set<string>();
  for (const item of raw.parts) {
    const part = record(item);
    if (!part) return null;
    const id = clean(part.id, 32);
    const label = clean(part.label, 60);
    const explanation = clean(part.explanation, 220);
    if (!/^[a-z][a-z0-9_-]*$/i.test(id) || ids.has(id) || !label || !explanation
      || !coordinate(part.x) || !coordinate(part.y)) return null;
    ids.add(id);
    parts.push({ id, label, explanation, x: part.x, y: part.y });
  }

  const connections: VisualConnection[] = [];
  const edges = new Set<string>();
  for (const item of raw.connections) {
    const connection = record(item);
    if (!connection) return null;
    const from = clean(connection.from, 32);
    const to = clean(connection.to, 32);
    const label = clean(connection.label, 70);
    const edge = `${from}\u0000${to}`;
    if (!ids.has(from) || !ids.has(to) || from === to || edges.has(edge) || !label) return null;
    edges.add(edge);
    connections.push({ from, to, label });
  }

  const reached = new Set([parts[0].id]);
  let size = 0;
  while (size !== reached.size) {
    size = reached.size;
    for (const { from, to } of connections) {
      if (reached.has(from)) reached.add(to);
      if (reached.has(to)) reached.add(from);
    }
  }
  if (reached.size !== parts.length) return null;

  const model = raw.model ? validateSceneSpec(raw.model, ids) : null;

  return {
    version: 1, ...(raw.dimension === 2 || raw.dimension === 3 ? { dimension: raw.dimension } : {}),
    title, assumption: clean(raw.assumption, 180) || undefined,
    placement: { x: placement.x, y: placement.y, width: placement.width, height: placement.height },
    parts, connections,
    ...(model ? { model } : {}),
  };
}
