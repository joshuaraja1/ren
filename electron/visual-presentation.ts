import type { VisualLesson } from "./visual-lesson.js";

/** Give requested illustrations a predictable stage instead of a model-picked corner. */
export function centerRequestedLesson(lesson: VisualLesson, displayWidth: number, displayHeight: number): VisualLesson {
  const width = Math.min(displayWidth * .9, 1600) / displayWidth;
  const height = Math.min(displayHeight * .82, 860) / displayHeight;
  return { ...lesson, layout: "centered", placement: { x: (1 - width) / 2, y: (1 - height) / 2, width, height } };
}
