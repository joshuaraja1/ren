import { describe, expect, it } from "vitest";
import { validateVisualLesson } from "./visual-lesson.js";

const valid = () => ({
  version: 1,
  title: "How a wing creates lift",
  assumption: "A conventional fixed-wing aircraft",
  parts: [
    { id: "wing", label: "Wing", explanation: "Redirects airflow downward.", x: 0.3, y: 0.4 },
    { id: "airflow", label: "Airflow", explanation: "Moves around the airfoil.", x: 0.7, y: 0.4 },
  ],
  connections: [{ from: "airflow", to: "wing", label: "flows around" }],
});

describe("visual lesson contract", () => {
  it("accepts a small connected lesson and strips unrecognized fields", () => {
    const candidate = { ...valid(), executable: "rm -rf /" };
    expect(validateVisualLesson(candidate)).toEqual(valid());
  });

  it("rejects dangling, duplicate, or self connections", () => {
    const lesson = valid();
    expect(validateVisualLesson({ ...lesson, connections: [{ from: "wing", to: "missing", label: "moves" }] })).toBeNull();
    expect(validateVisualLesson({ ...lesson, connections: [{ from: "wing", to: "wing", label: "moves" }] })).toBeNull();
    expect(validateVisualLesson({ ...lesson, parts: [lesson.parts[0], lesson.parts[0]] })).toBeNull();
    expect(validateVisualLesson({ ...lesson, parts: [...lesson.parts, { id: "tail", label: "Tail", explanation: "Stabilizes flight.", x: 0.9, y: 0.8 }] })).toBeNull();
  });

  it("rejects excessive or off-canvas geometry", () => {
    const lesson = valid();
    expect(validateVisualLesson({ ...lesson, parts: Array(13).fill(lesson.parts[0]) })).toBeNull();
    expect(validateVisualLesson({ ...lesson, parts: [{ ...lesson.parts[0], x: 1.1 }, lesson.parts[1]] })).toBeNull();
    expect(validateVisualLesson({ ...lesson, connections: [] })).toBeNull();
  });

  it("bounds text and removes controls before rendering", () => {
    const lesson = valid();
    lesson.parts[0].label = `Wing\n${"a".repeat(100)}`;
    const result = validateVisualLesson(lesson);
    expect(result?.parts[0].label.length).toBe(60);
    expect(result?.parts[0].label).not.toContain("\n");
  });
});
