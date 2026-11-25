import type { VisualLesson } from "./visual-lesson.js";

/** Only offer orbit controls for subjects backed by actual 3D geometry. */
export function interactiveSceneFor(lesson: VisualLesson): "f35b-hover" | null {
  const text = `${lesson.title} ${lesson.parts.map((part) => part.label).join(" ")}`.toLowerCase();
  const aircraft = /\bf[\s-]?35\s*b\b/.test(text) || (/\b(jet|aircraft)\b/.test(text) && /lift fan/.test(text));
  return aircraft && /\b(hover|vertical lift|lift fan)\b/.test(text) ? "f35b-hover" : null;
}

export function answerForInteractiveScene(answer: string, lesson: VisualLesson): string {
  if (!interactiveSceneFor(lesson)) return answer;
  const withoutContradiction = answer
    .replace(/\bI can explain[^.!?]*, but I (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .replace(/\bI (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .trim();
  return `${withoutContradiction} Move your cursor to rotate the 3D model.`.trim();
}
