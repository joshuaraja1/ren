import { answerForInteractiveScene, interactiveSceneFor, tagRequestedInteractiveScene } from "./interactive-scene.js";
import type { VisualLesson } from "./visual-lesson.js";

const lesson: VisualLesson = {
  version: 1, layout: "centered", title: "F-35B hover thrust balance",
  placement: { x: .1, y: .1, width: .8, height: .8 },
  parts: [
    { id: "fan", label: "Lift fan", explanation: "Pushes air down.", x: .3, y: .5 },
    { id: "engine", label: "Engine", explanation: "Drives the fan.", x: .7, y: .5 },
  ],
  connections: [{ from: "engine", to: "fan", label: "drives" }],
};

it("never assumes an aircraft model from its title or a flat request", () => {
  expect(interactiveSceneFor(lesson)).toBeNull();
  expect(interactiveSceneFor(tagRequestedInteractiveScene(lesson, "Draw an F-35B hover model"))).toBeNull();
  expect(interactiveSceneFor(tagRequestedInteractiveScene({ ...lesson, scene: "f35b-hover" }, "Draw a flat 2D F-35B hover schematic"))).toBeNull();
});

it("uses subject-derived geometry for any 3D object and preserves conceptual graphs", () => {
  const model: NonNullable<VisualLesson["model"]> = {
    version: 1, subject: "Phone", fidelity: "conceptual",
    primitives: [
      { partId: "fan", kind: "box", position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0], color: "#334455" },
      { partId: "engine", kind: "sphere", position: [1, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0], color: "#334455" },
    ],
    anchors: [{ partId: "fan", position: [0, 0, 0] }, { partId: "engine", position: [1, 0, 0] }],
  };
  const phone = { ...lesson, title: "Phone components", model };
  expect(interactiveSceneFor(phone)).toBe("subject-3d");
  expect(answerForInteractiveScene("Here are the parts.", phone)).toContain("Move your cursor to rotate the 3D model.");
  const graph = tagRequestedInteractiveScene({ ...lesson, title: "How a phone works" }, "Make an interactive 3D relationship graph I can rotate");
  expect(interactiveSceneFor(graph)).toBe("conceptual-3d");
  expect(interactiveSceneFor(tagRequestedInteractiveScene(lesson, "Draw a 3D relationship graph of the immune response"))).toBe("conceptual-3d");
  expect(answerForInteractiveScene("I can't rotate this.", graph)).toContain("conceptual 3D schematic");
});
