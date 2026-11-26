import type { SceneSpec } from "../electron/scene-spec";
import type { VisualLesson } from "../electron/visual-lesson";
import type { Point } from "./contracts";

function rawPoint([x, y, z]: [number, number, number]): Point {
  return { x: x + z * .38, y: -y + z * .25 };
}

/** Fit a stable isometric projection of any validated scene into the 3D stage. */
export function sceneFallbackProjection(spec: SceneSpec) {
  const points = spec.primitives.flatMap((primitive) => {
    const [x, y, z] = primitive.position;
    const [sx, sy, sz] = primitive.scale;
    return [rawPoint([x - sx / 2, y - sy / 2, z - sz / 2]), rawPoint([x + sx / 2, y + sy / 2, z + sz / 2])];
  });
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = Math.min(.72 / Math.max(.01, maxX - minX), .7 / Math.max(.01, maxY - minY));
  const project = (position: [number, number, number]): Point => {
    const point = rawPoint(position);
    return { x: .5 + (point.x - (minX + maxX) / 2) * scale, y: .5 + (point.y - (minY + maxY) / 2) * scale };
  };
  const anchors = Object.fromEntries(spec.anchors.map((anchor) => [anchor.partId, project(anchor.position)])) as Record<string, Point>;
  return { project, anchors, scale };
}

export function SceneFallback({ spec, connections }: { spec: SceneSpec; connections: VisualLesson["connections"] }) {
  const { project, anchors, scale } = sceneFallbackProjection(spec);
  return <svg className="jet-scene scene-fallback" viewBox="0 0 1000 700" role="presentation" aria-hidden="true">
    {connections.map((connection) => {
      const from = anchors[connection.from], to = anchors[connection.to];
      return from && to ? <line key={`${connection.from}-${connection.to}`} x1={from.x * 1000} y1={from.y * 700} x2={to.x * 1000} y2={to.y * 700} stroke="#73d3de" strokeWidth="3" opacity=".8" /> : null;
    })}
    {spec.primitives.map((primitive, index) => {
      const center = project(primitive.position);
      const cx = center.x * 1000, cy = center.y * 700;
      const width = Math.max(12, primitive.scale[0] * scale * 1000);
      const height = Math.max(12, primitive.scale[1] * scale * 700);
      const color = primitive.color;
      const shape = primitive.kind === "sphere" ? <circle cx={cx} cy={cy} r={Math.min(width, height) / 2} />
        : primitive.kind === "torus" ? <circle cx={cx} cy={cy} r={Math.min(width, height) / 2} fill="none" stroke={color} strokeWidth={Math.max(5, Math.min(width, height) * .23)} />
        : primitive.kind === "extrusion" && primitive.outline ? <polygon points={primitive.outline.map(([x, y]) => `${cx + x * width},${cy - y * height}`).join(" ")} />
        : primitive.kind === "cone" ? <path d={`M${cx} ${cy - height / 2} L${cx - width / 2} ${cy + height / 2} L${cx + width / 2} ${cy + height / 2} Z`} />
        : primitive.kind === "cylinder" ? <><rect x={cx - width / 2} y={cy - height / 2} width={width} height={height} rx={width * .1} /><ellipse cx={cx} cy={cy - height / 2} rx={width / 2} ry={Math.max(5, height * .12)} /></>
        : <rect x={cx - width / 2} y={cy - height / 2} width={width} height={height} rx={Math.min(10, width * .08)} />;
      return <g key={`${primitive.partId}-${index}`} fill={color} stroke="#c8e4ed" strokeWidth="2" opacity=".95">{shape}</g>;
    })}
  </svg>;
}

export function lessonVectorPositions(lesson: Pick<VisualLesson, "parts">): Record<string, Point> {
  const xs = lesson.parts.map((part) => part.x), ys = lesson.parts.map((part) => part.y);
  const crowded = Math.max(...xs) - Math.min(...xs) < .14 && Math.max(...ys) - Math.min(...ys) < .14;
  return Object.fromEntries(lesson.parts.map((part, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / lesson.parts.length;
    return [part.id, crowded
      ? { x: .5 + Math.cos(angle) * .28, y: .5 + Math.sin(angle) * .27 }
      : { x: Math.max(.12, Math.min(.88, part.x)), y: Math.max(.18, Math.min(.82, part.y)) }];
  }));
}

export function LessonVectorFallback({ lesson }: { lesson: VisualLesson }) {
  const anchors = lessonVectorPositions(lesson);
  return <svg className="visual-lesson-vector-fallback" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="presentation" aria-hidden="true">
    {lesson.connections.map((connection) => {
      const from = anchors[connection.from], to = anchors[connection.to];
      return from && to ? <g key={`${connection.from}-${connection.to}`}><line x1={from.x * 1000} y1={from.y * 1000} x2={to.x * 1000} y2={to.y * 1000} /><path d={`M${to.x * 1000} ${to.y * 1000} l-12 -8 l2 16Z`} /></g> : null;
    })}
    {lesson.parts.map((part, index) => <g key={part.id} transform={`translate(${anchors[part.id].x * 1000} ${anchors[part.id].y * 1000})`}><circle r="23" /><text textAnchor="middle" dominantBaseline="central">{index + 1}</text></g>)}
  </svg>;
}
