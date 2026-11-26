/** Bounded, subject-derived geometry for an approximate rotatable teaching model. */
export type ScenePrimitive = {
  partId: string;
  kind: "box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "extrusion";
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  /** Local XY outline for an extruded silhouette, normalized around its center. */
  outline?: [number, number][];
};

export type SceneSpec = {
  version: 1;
  subject: string;
  fidelity: "conceptual";
  primitives: ScenePrimitive[];
  anchors: { partId: string; position: [number, number, number] }[];
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const vector = (value: unknown, min: number, max: number): [number, number, number] | null =>
  Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item) && item >= min && item <= max)
    ? [value[0], value[1], value[2]] : null;

function outline(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 12) return null;
  const points: [number, number][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || item.some((number) => typeof number !== "number" || !Number.isFinite(number) || number < -.5 || number > .5)) return null;
    points.push([item[0], item[1]]);
  }
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 1; second < points.length; second++) {
      if (Math.hypot(points[first][0] - points[second][0], points[first][1] - points[second][1]) < .001) return null;
    }
  }
  const side = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 2; second < points.length; second++) {
      if (first === 0 && second === points.length - 1) continue;
      const a = points[first], b = points[(first + 1) % points.length];
      const c = points[second], d = points[(second + 1) % points.length];
      if (side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return null;
    }
  }
  const area = Math.abs(points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return sum + x * nextY - nextX * y;
  }, 0)) / 2;
  return area >= .01 ? points : null;
}

export function validateSceneSpec(value: unknown, partIds: Iterable<string>): SceneSpec | null {
  const raw = record(value);
  const ids = new Set(partIds);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.primitives) || !Array.isArray(raw.anchors)
    || raw.primitives.length < 2 || raw.primitives.length > 40 || raw.anchors.length !== ids.size
    || ids.size < 2 || ids.size > 12 || typeof raw.subject !== "string") return null;
  const subject = raw.subject.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
  if (!subject) return null;

  const primitives: ScenePrimitive[] = [];
  const represented = new Set<string>();
  for (const item of raw.primitives) {
    const primitive = record(item);
    if (!primitive || typeof primitive.partId !== "string" || !ids.has(primitive.partId)
      || !["box", "sphere", "cylinder", "cone", "torus", "capsule", "extrusion"].includes(String(primitive.kind))) return null;
    const position = vector(primitive.position, -5, 5);
    const scale = vector(primitive.scale, .02, 5);
    const rotation = vector(primitive.rotation, -Math.PI * 2, Math.PI * 2);
    if (!position || !scale || !rotation || typeof primitive.color !== "string" || !/^#[0-9a-f]{6}$/i.test(primitive.color)) return null;
    const shape = primitive.kind === "extrusion" ? outline(primitive.outline) : null;
    if (primitive.kind === "extrusion" && !shape) return null;
    represented.add(primitive.partId);
    primitives.push({ partId: primitive.partId, kind: primitive.kind as ScenePrimitive["kind"], position, scale, rotation, color: primitive.color, ...(shape ? { outline: shape } : {}) });
  }
  if (represented.size !== ids.size) return null;
  const center = primitives[0].position;
  if (!primitives.some((primitive) => Math.hypot(...primitive.position.map((value, axis) => value - center[axis])) > .05)) return null;

  const anchors: SceneSpec["anchors"] = [];
  const anchored = new Set<string>();
  for (const item of raw.anchors) {
    const anchor = record(item);
    if (!anchor || typeof anchor.partId !== "string" || !ids.has(anchor.partId) || anchored.has(anchor.partId)) return null;
    const position = vector(anchor.position, -5, 5);
    if (!position) return null;
    const nearby = primitives.some((primitive) => primitive.partId === anchor.partId
      && Math.hypot(...position.map((value, axis) => value - primitive.position[axis])) <= Math.max(...primitive.scale) / 2 + 1.5);
    if (!nearby) return null;
    anchored.add(anchor.partId);
    anchors.push({ partId: anchor.partId, position });
  }
  if (anchored.size !== ids.size) return null;
  return { version: 1, subject, fidelity: "conceptual", primitives, anchors };
}
