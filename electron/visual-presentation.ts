import type { VisualLesson } from "./visual-lesson.js";

/** Give requested illustrations a predictable stage instead of a model-picked corner. */
export function centerRequestedLesson(lesson: VisualLesson, displayWidth: number, displayHeight: number): VisualLesson {
  const physicalModel = lesson.dimension === 3 || Boolean(lesson.model);
  const width = Math.min(displayWidth * .9, physicalModel ? 900 : 1600) / displayWidth;
  const height = Math.min(displayHeight * .82, physicalModel ? 650 : 860) / displayHeight;
  return { ...lesson, layout: "centered", placement: { x: (1 - width) / 2, y: (1 - height) / 2, width, height } };
}
