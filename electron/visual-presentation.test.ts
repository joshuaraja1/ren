import { expect, it } from "vitest";
import { centerRequestedLesson } from "./visual-presentation.js";
import type { VisualLesson } from "./visual-lesson.js";

const lesson: VisualLesson = {
  version: 1, title: "How hover works",
  placement: { x: .78, y: .55, width: .2, height: .3 },
  parts: [
    { id: "fan", label: "Lift fan", explanation: "Pushes air down.", x: .2, y: .3 },
    { id: "nozzle", label: "Rear nozzle", explanation: "Directs thrust.", x: .8, y: .7 },
  ],
  connections: [{ from: "fan", to: "nozzle", label: "balances" }],
};

it("centers an explicit diagram at a readable size on a large display", () => {
  const centered = centerRequestedLesson(lesson, 3456, 2234);
  expect(centered.layout).toBe("centered");
  expect(centered.placement.x + centered.placement.width / 2).toBeCloseTo(.5);
  expect(centered.placement.y + centered.placement.height / 2).toBeCloseTo(.5);
  expect(centered.placement.width * 3456).toBeCloseTo(1600);
  expect(centered.placement.height * 2234).toBeCloseTo(860);
  expect(centered.parts).toEqual(lesson.parts);
  expect(lesson.placement.x).toBe(.78);
});

it("keeps the stage centered and within a smaller desktop display", () => {
  const centered = centerRequestedLesson(lesson, 1280, 800);
  expect(centered.placement.x).toBeCloseTo(.05);
  expect(centered.placement.y).toBeCloseTo(.09);
  expect(centered.placement.width).toBeCloseTo(.9);
  expect(centered.placement.height).toBeCloseTo(.82);
  expect(centered.placement.x + centered.placement.width).toBeLessThanOrEqual(1);
  expect(centered.placement.y + centered.placement.height).toBeLessThanOrEqual(1);
});

it("fits a large connected lesson into a short display without dangling connections", () => {
  const crowded: VisualLesson = {
    ...lesson,
    parts: Array.from({ length: 12 }, (_, index) => ({
      id: `part${index}`, label: `Component ${index}`, explanation: "Explains the force and control mechanism in detail. ".repeat(4), x: .5, y: .5,
    })),
    connections: Array.from({ length: 11 }, (_, index) => ({ from: `part${index}`, to: `part${index + 1}`, label: "drives" })),
  };
  const centered = centerRequestedLesson(crowded, 1280, 700);
  expect(centered.parts).toHaveLength(4);
  expect(centered.parts.every((part) => part.explanation.length <= 120)).toBe(true);
  const retained = new Set(centered.parts.map((part) => part.id));
  expect(centered.connections).toHaveLength(3);
  expect(centered.connections.every(({ from, to }) => retained.has(from) && retained.has(to))).toBe(true);
  expect(crowded.parts).toHaveLength(12);
});

it.each([[800, 800], [800, 600]])("keeps a dense lesson legible on a narrow %i×%i display", (width, height) => {
  const crowded: VisualLesson = {
    ...lesson,
    parts: Array.from({ length: 12 }, (_, index) => ({
      id: `part${index}`,
      label: `Long component label number ${index} for a technical diagram`,
      explanation: "Explains the force and control mechanism in detail. ".repeat(4),
      x: .5, y: .5,
    })),
    connections: Array.from({ length: 11 }, (_, index) => ({ from: `part${index}`, to: `part${index + 1}`, label: "drives" })),
  };
  const centered = centerRequestedLesson(crowded, width, height);
  expect(centered.layout).toBe("centered");
  expect(centered.placement.x + centered.placement.width / 2).toBeCloseTo(.5);
  expect(centered.placement.y + centered.placement.height / 2).toBeCloseTo(.5);
  expect(centered.parts.length).toBeLessThanOrEqual(2);
  const retained = new Set(centered.parts.map((part) => part.id));
  expect(centered.connections.every(({ from, to }) => retained.has(from) && retained.has(to))).toBe(true);
});
