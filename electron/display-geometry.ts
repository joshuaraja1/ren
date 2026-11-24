export type Bounds = { x: number; y: number; width: number; height: number };
export type Cursor = { x: number; y: number };

export function normalizeCursor(cursor: Cursor, bounds: Bounds) {
  return {
    x: Math.min(1, Math.max(0, (cursor.x - bounds.x) / bounds.width)),
    y: Math.min(1, Math.max(0, (cursor.y - bounds.y) / bounds.height)),
  };
}
