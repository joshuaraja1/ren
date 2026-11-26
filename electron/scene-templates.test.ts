import { expect, it } from "vitest";
import { validateSceneSpec } from "./scene-spec.js";
import { desktopComputerTemplate } from "./scene-templates.js";
import type { VisualLesson } from "./visual-lesson.js";

const names = ["Case", "Motherboard", "CPU", "RAM", "Power supply"];
const lesson: VisualLesson = {
  version: 1, title: "Desktop computer assembly", placement: { x: .1, y: .1, width: .8, height: .8 },
  parts: names.map((label, index) => ({ id: `part${index}`, label, explanation: `${label} function`, x: .5, y: .5 })),
  connections: names.slice(1).map((_, index) => ({ from: "part0", to: `part${index + 1}`, label: "contains" })),
};

it("builds a complete open tower with real component silhouettes before showing it", () => {
  const model = desktopComputerTemplate(lesson, "Show a rotatable 3D exploded assembly of a desktop computer", true);
  expect(model).not.toBeNull();
  expect(validateSceneSpec(model, lesson.parts.map((part) => part.id))).not.toBeNull();
  expect(model?.primitives.filter((primitive) => primitive.partId === "part0")).toHaveLength(6);
  expect(model?.primitives.filter((primitive) => primitive.partId === "part3").length).toBeGreaterThan(2);
  expect(model?.primitives.every((primitive) => primitive.opacity === undefined)).toBe(true);
  expect(model?.anchors).toHaveLength(5);
  expect(model?.assembly).toHaveLength(4);
});

it("does not substitute a desktop tower for a different computer or set of parts", () => {
  expect(desktopComputerTemplate({ ...lesson, title: "Laptop computer" }, "Show a laptop", false)).toBeNull();
  expect(desktopComputerTemplate({ ...lesson, parts: lesson.parts.slice(0, 4) }, "Show a desktop computer", false)).toBeNull();
});

it("keeps an added power-cable callout on the desktop model", () => {
  const withCables: VisualLesson = { ...lesson, parts: [...lesson.parts, { id: "cables", label: "Power cables", explanation: "Carry power.", x: .5, y: .5 }] };
  const model = desktopComputerTemplate(withCables, "Show a 3D desktop computer", true);
  expect(model?.primitives.filter((part) => part.partId === "cables")).toHaveLength(3);
  expect(model?.assembly).toHaveLength(5);
  expect(validateSceneSpec(model, withCables.parts.map((part) => part.id))).not.toBeNull();
});
