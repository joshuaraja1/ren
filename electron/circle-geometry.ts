import type { Rectangle } from "electron";

export type AbsolutePoint = { x: number; y: number };
export type NormalizedPoint = { x: number; y: number };
export type FocusRegion = {
  points: NormalizedPoint[];
  bounds: { x: number; y: number; width: number; height: number };
};

const distance = (a: AbsolutePoint, b: AbsolutePoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function addCirclePoint(points: AbsolutePoint[], point: AbsolutePoint) {
  if (points.length >= 180 || (points.length && distance(points.at(-1)!, point) < 4)) return false;
  points.push(point);
  return true;
}

export function circlePath(points: AbsolutePoint[], display: Rectangle): NormalizedPoint[] {
  return points.map((point) => ({
    x: clamp((point.x - display.x) / display.width),
    y: clamp((point.y - display.y) / display.height),
  }));
}

export function finishCircle(points: AbsolutePoint[], display: Rectangle): FocusRegion | null {
  if (points.length < 12) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const width = right - left, height = bottom - top;
  if (width < 36 || height < 36 || distance(points[0], points.at(-1)!) > Math.max(36, Math.min(width, height) * 0.3)) return null;
  const signedArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
  if (Math.abs(signedArea) < width * height * 0.35) return null;
  const margin = 12;
  const x = clamp((left - margin - display.x) / display.width);
  const y = clamp((top - margin - display.y) / display.height);
  const x2 = clamp((right + margin - display.x) / display.width);
  const y2 = clamp((bottom + margin - display.y) / display.height);
  return { points: circlePath([...points, points[0]], display), bounds: { x, y, width: x2 - x, height: y2 - y } };
}
