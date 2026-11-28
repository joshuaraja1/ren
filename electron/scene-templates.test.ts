import { expect, it } from "vitest";
import { validateSceneSpec } from "./scene-spec.js";
import { desktopComputerTemplate, raspberryPiCameraTemplate } from "./scene-templates.js";
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

it("models a Pi 5 camera connection with the right cable and board-first assembly", () => {
  const piLesson: VisualLesson = {
    ...lesson, title: "Raspberry Pi 5 camera setup",
    parts: [
      { id: "pi", label: "Raspberry Pi 5 board", explanation: "Host board with CAM/DISP port", x: .5, y: .3 },
      { id: "ribbon", label: "Standard-Mini ribbon cable", explanation: "22-pin to 15-pin adapter cable", x: .5, y: .5 },
      { id: "camera", label: "Camera Module 3", explanation: "Captures the image", x: .5, y: .7 },
    ],
    connections: [{ from: "pi", to: "ribbon", label: "22-pin end" }, { from: "ribbon", to: "camera", label: "15-pin end" }],
  };
  const model = raspberryPiCameraTemplate(piLesson, "Show a 3D Pi 5 camera attachment animation", true);
  expect(model).not.toBeNull();
  expect(validateSceneSpec(model, piLesson.parts.map((part) => part.id))).toEqual(model);
  expect(model?.subject).toContain("Pi 5");
  expect(model?.primitives.filter((primitive) => primitive.partId === "pi").length).toBeGreaterThan(5);
  expect(model?.assembly?.map((step) => step.partId)).toEqual(["ribbon", "camera"]);
  expect(model?.assembly?.[0].instruction).toMatch(/Power off.*gently lift.*22-pin.*contacts away.*close/i);
  expect(model?.assembly?.[1].instruction).toMatch(/gently lift.*15-pin.*contacts toward the camera board.*rpicam-hello/i);
  const numberedLabels = { ...piLesson, parts: piLesson.parts.map((part, index) => ({ ...part, label: `${index + 1}. ${part.label}` })) };
  numberedLabels.parts[1].label = "2. Standard-Mini ribbon";
  expect(raspberryPiCameraTemplate(numberedLabels, "Animate attaching a Camera Module 3 to a Raspberry Pi 5", true)?.assembly?.map((step) => step.partId)).toEqual(["ribbon", "camera"]);
  const board = model!.primitives.find((primitive) => primitive.partId === "pi" && primitive.kind === "box")!;
  const cable = model!.primitives.find((primitive) => primitive.partId === "ribbon" && primitive.kind === "box")!;
  const camera = model!.primitives.find((primitive) => primitive.partId === "camera" && primitive.kind === "box")!;
  expect(board.scale[1]).toBeLessThan(board.scale[2]);
  expect(board.scale[1]).toBeLessThan(board.scale[0]);
  expect(cable.scale[1]).toBeLessThan(cable.scale[2]);
  expect(model!.primitives.filter((primitive) => primitive.partId === "ribbon" && primitive.kind === "box")).toHaveLength(7);
  expect(camera.scale[1]).toBeLessThan(camera.scale[2]);
  expect(camera.position[1]).toBeLessThan(.3);
  expect(cable.position[1]).toBeLessThan(.6);
  expect(camera.position[2]).toBeGreaterThan(board.position[2] + 1.5);
  expect(Math.abs(camera.position[0] - cable.position[0])).toBeLessThan(.01);
  expect(model!.primitives.find((primitive) => primitive.partId === "camera" && primitive.kind === "cylinder")?.rotation).toEqual([0, 0, 0]);
  expect(raspberryPiCameraTemplate({ ...piLesson, title: "Raspberry Pi 4 camera" }, "Pi 4 camera", true)).toBeNull();
  expect(raspberryPiCameraTemplate({ ...piLesson, parts: piLesson.parts.slice(0, 2) }, "Pi 5 camera", true)).toBeNull();
});
