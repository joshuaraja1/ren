import type { VisualLesson } from "./visual-lesson.js";
import { requestedVisualDimension } from "./visual-intent.js";

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
  if (requestedVisualDimension(question) === 2) return { ...lesson, scene: undefined, model: undefined };
  return /\b(?:3d|three[ -]dimensional)\b/i.test(question) && /\b(?:relationship graph|conceptual network|concept map)\b/i.test(question)
    ? { ...lesson, scene: "conceptual-3d" } : lesson;
}

/** Only offer orbit controls for subjects backed by actual 3D geometry. */
export function interactiveSceneFor(lesson: VisualLesson): "f35b-hover" | "conceptual-3d" | "subject-3d" | null {
  if (lesson.model) return "subject-3d";
  if (lesson.scene === "conceptual-3d") return "conceptual-3d";
  return lesson.scene === "f35b-hover" && lesson.parts.every((part) => jetPartForLabel(part.label)) ? "f35b-hover" : null;
}

export function answerForInteractiveScene(answer: string, lesson: VisualLesson): string {
  if (!interactiveSceneFor(lesson)) return answer;
  const withoutContradiction = answer
    .replace(/\bI can explain[^.!?]*, but I (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .replace(/\bI (?:can't|cannot) rotate[^.!?]*[.!?]?/gi, "")
    .trim();
  return `${withoutContradiction} Move your cursor to rotate the ${interactiveSceneFor(lesson) === "conceptual-3d" ? "conceptual 3D schematic" : "3D model"}.`.trim();
}
