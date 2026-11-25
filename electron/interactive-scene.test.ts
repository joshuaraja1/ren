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

it("uses real 3D geometry only for the supported F-35B hover subject", () => {
  expect(interactiveSceneFor(lesson)).toBe("f35b-hover");
  expect(interactiveSceneFor({ ...lesson, title: "How a phone works", parts: lesson.parts.map((part) => ({ ...part, label: "Keypad" })) })).toBeNull();
  expect(interactiveSceneFor({ ...lesson, title: "Jet hover thrust balance" })).toBeNull();
  expect(interactiveSceneFor({ ...lesson, title: "Hover thrust balance", scene: "f35b-hover" })).toBe("f35b-hover");
  expect(interactiveSceneFor(tagRequestedInteractiveScene({ ...lesson, title: "Hover thrust balance" }, "Draw an F-35B hover model"))).toBe("f35b-hover");
  expect(interactiveSceneFor({ ...lesson, parts: [...lesson.parts, { id: "inlet", label: "Air inlet", explanation: "Supplies air.", x: .2, y: .4 }] })).toBeNull();
  expect(answerForInteractiveScene("I can explain it, but I can't rotate the diagram with your cursor.", lesson)).toBe("Move your cursor to rotate the 3D model.");
});
