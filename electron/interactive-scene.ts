import type { VisualLesson } from "./visual-lesson.js";

export type JetPart = "engine" | "fan" | "nozzle" | "posts" | "controls";

export function jetPartForLabel(label: string): JetPart | null {
  const value = label.toLowerCase();
  if (/lift fan/.test(value)) return "fan";
  if (/roll post|wing outlet/.test(value)) return "posts";
  if (/nozzle|exhaust/.test(value)) return "nozzle";
  if (/engine|powerplant/.test(value)) return "engine";
  if (/flight control/.test(value)) return "controls";
  return null;
}

/** Only offer orbit controls for subjects backed by actual 3D geometry. */
export function interactiveSceneFor(lesson: VisualLesson): "f35b-hover" | null {
  const text = `${lesson.title} ${lesson.parts.map((part) => part.label).join(" ")}`.toLowerCase();
  const aircraft = /\bf[\s-]?35\s*b\b/.test(text);
  return aircraft && /\b(hover|vertical lift|lift fan)\b/.test(text) && lesson.parts.every((part) => jetPartForLabel(part.label)) ? "f35b-hover" : null;
}

export function answerForInteractiveScene(answer: string, lesson: VisualLesson): string {
  if (!interactiveSceneFor(lesson)) return answer;
  const withoutContradiction = answer
    .replace(/\bI can explain[^.!?]*, but I (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .replace(/\bI (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .trim();
  return `${withoutContradiction} Move your cursor to rotate the 3D model.`.trim();
}
