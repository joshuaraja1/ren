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

export function tagRequestedInteractiveScene(lesson: VisualLesson, question: string): VisualLesson {
  const requested = /\bf[\s-]?35\s*b\b/i.test(question) && /\b(hover|vertical|lift)\b/i.test(question);
  return requested && lesson.parts.every((part) => jetPartForLabel(part.label)) ? { ...lesson, scene: "f35b-hover" } : lesson;
}

/** Only offer orbit controls for subjects backed by actual 3D geometry. */
export function interactiveSceneFor(lesson: VisualLesson): "f35b-hover" | null {
  const text = `${lesson.title} ${lesson.parts.map((part) => part.label).join(" ")}`.toLowerCase();
  const namedAircraft = /\bf[\s-]?35\s*b\b/.test(text) && /\b(hover|vertical lift|lift fan)\b/.test(text);
  return (lesson.scene === "f35b-hover" || namedAircraft) && lesson.parts.every((part) => jetPartForLabel(part.label)) ? "f35b-hover" : null;
}

export function answerForInteractiveScene(answer: string, lesson: VisualLesson): string {
  if (!interactiveSceneFor(lesson)) return answer;
  const withoutContradiction = answer
    .replace(/\bI can explain[^.!?]*, but I (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .replace(/\bI (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .trim();
  return `${withoutContradiction} Move your cursor to rotate the 3D model.`.trim();
}
