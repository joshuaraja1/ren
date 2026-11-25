import type { VisualLesson } from "./visual-lesson.js";

/** Give requested illustrations a predictable stage instead of a model-picked corner. */
export function centerRequestedLesson(lesson: VisualLesson, displayWidth: number, displayHeight: number): VisualLesson {
  const width = Math.min(displayWidth * .9, 1600) / displayWidth;
  const height = Math.min(displayHeight * .82, 860) / displayHeight;
  const heightLimit = displayHeight < 600 ? 2 : displayHeight < 750 ? 3 : displayHeight < 1000 ? 4 : 5;
  const widthLimit = displayWidth < 900 ? 2 : displayWidth < 1360 ? 3 : 5;
  const maxParts = Math.min(heightLimit, widthLimit);
  const selected = new Set<string>();
  const queue = [lesson.parts[0].id];
  while (queue.length && selected.size < maxParts) {
    const id = queue.shift()!;
    if (selected.has(id)) continue;
    selected.add(id);
    for (const connection of lesson.connections) {
      if (connection.from === id && !selected.has(connection.to)) queue.push(connection.to);
      if (connection.to === id && !selected.has(connection.from)) queue.push(connection.from);
    }
  }
  const parts = lesson.parts.filter((part) => selected.has(part.id)).map((part) => ({
    ...part,
    label: part.label.slice(0, displayWidth < 1200 ? 28 : 36).trim(),
    explanation: part.explanation.slice(0, displayWidth < 1200 ? 64 : 78).trim(),
  }));
  const connections = lesson.connections.filter(({ from, to }) => selected.has(from) && selected.has(to));
  return { ...lesson, layout: "centered", placement: { x: (1 - width) / 2, y: (1 - height) / 2, width, height }, parts, connections };
}
