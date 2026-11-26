import { describe, expect, it } from "vitest";
import { validateSceneSpec } from "./scene-spec.js";

const valid = () => ({
  version: 1, subject: "Classic cell phone", executable: "delete files",
  primitives: [
    { partId: "body", kind: "box", position: [0, 0, 0], scale: [2, 4, .4], rotation: [0, 0, 0], color: "#16499a" },
    { partId: "display", kind: "box", position: [0, .8, .3], scale: [1.4, 1.1, .08], rotation: [0, 0, 0], color: "#9db9b3" },
  ],
  anchors: [
    { partId: "body", position: [0, -1, .3] },
    { partId: "display", position: [0, .8, .4] },
  ],
});

describe("subject 3D scene contract", () => {
  it("accepts bounded primitives and anchors while stripping arbitrary fields", () => {
    const result = validateSceneSpec(valid(), ["body", "display"]);
    expect(result).toMatchObject({ version: 1, subject: "Classic cell phone", fidelity: "conceptual" });
    expect(result).not.toHaveProperty("executable");
    expect(result?.primitives).toHaveLength(2);
  });

  it("defaults omitted rotation and missing labels to the represented geometry", () => {
    const scene = valid();
    const result = validateSceneSpec({ ...scene,
      primitives: [Object.fromEntries(Object.entries(scene.primitives[0]).filter(([key]) => key !== "rotation")), scene.primitives[1]],
      anchors: [],
    }, ["body", "display"]);
    expect(result?.primitives[0].rotation).toEqual([0, 0, 0]);
    expect(result?.anchors).toEqual([
      { partId: "body", position: [0, 0, 0] },
      { partId: "display", position: [0, .8, .3] },
    ]);
  });

  it("repairs missing anchors from geometry but rejects unknown or duplicate anchors", () => {
    const scene = valid();
    expect(validateSceneSpec({ ...scene, anchors: scene.anchors.slice(0, 1) }, ["body", "display"])?.anchors)
      .toContainEqual({ partId: "display", position: [0, .8, .3] });
    expect(validateSceneSpec({ ...scene, anchors: [scene.anchors[0], scene.anchors[0]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [scene.primitives[0], { ...scene.primitives[1], partId: "unknown" }] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [scene.primitives[0]] }, ["body", "display"])).toBeNull();
  });

  it("rejects unbounded transforms, invalid colors, and excess geometry", () => {
    const scene = valid();
    expect(validateSceneSpec({ ...scene, primitives: [{ ...scene.primitives[0], position: [Infinity, 0, 0] }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [{ ...scene.primitives[0], scale: [0, 1, 1] }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [{ ...scene.primitives[0], color: "red" }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [...scene.primitives, ...Array(39).fill(scene.primitives[0])] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, anchors: [scene.anchors[0], { partId: "display", position: [5, 5, 5] }] }, ["body", "display"])?.anchors[1].position).toEqual([0, .8, .3]);
    expect(validateSceneSpec({ ...scene, anchors: [scene.anchors[0], { partId: "display", position: [0, 2.3, .3] }] }, ["body", "display"])?.anchors[1].position).toEqual([0, .8, .3]);
    expect(validateSceneSpec({ ...scene, primitives: [{ ...scene.primitives[0], position: [0, 0, 0] }, { ...scene.primitives[1], position: [0, 0, 0] }] }, ["body", "display"])).toBeNull();
  });

  it("accepts a bounded shaped silhouette but rejects degenerate or oversized outlines", () => {
    const scene = valid();
    const shaped = { ...scene.primitives[0], kind: "extrusion", outline: [[-.5, -.4], [.5, -.4], [.4, .4], [-.4, .4]] };
    const accepted = validateSceneSpec({ ...scene, primitives: [shaped, scene.primitives[1]] }, ["body", "display"]);
    expect(accepted?.primitives[0]).toMatchObject({ kind: "extrusion", outline: shaped.outline });
    expect(validateSceneSpec({ ...scene, primitives: [{ ...shaped, outline: [[0, 0], [.1, 0], [.2, 0]] }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [{ ...shaped, outline: [[-1, 0], [0, 0], [0, .5]] }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, primitives: [{ ...shaped, outline: [[-.5, -.5], [.5, .5], [.5, -.5], [-.5, .5]] }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
  });

  it("keeps a bounded assembly sequence and translucent housing without accepting arbitrary commands", () => {
    const scene = valid();
    const result = validateSceneSpec({ ...scene,
      primitives: [{ ...scene.primitives[0], opacity: .32 }, scene.primitives[1]],
      assembly: [{ partId: "display", from: [0, 0, 2], instruction: "Lower the display into the housing.", command: "run this" }],
    }, ["body", "display"]);
    expect(result?.primitives[0].opacity).toBe(.32);
    expect(result?.assembly).toEqual([{ partId: "display", from: [0, 0, 2], instruction: "Lower the display into the housing." }]);
    expect(result?.assembly?.[0]).not.toHaveProperty("command");
    const longInstruction = "Open the socket latch, seat the ribbon cable with its contacts toward the board, and close the latch. Then power on and test the camera before fastening the case.";
    expect(validateSceneSpec({ ...scene, assembly: [{ partId: "display", from: [0, 0, 2], instruction: longInstruction }] }, ["body", "display"])?.assembly?.[0].instruction).toBe(longInstruction);
    expect(validateSceneSpec({ ...scene, primitives: [{ ...scene.primitives[0], opacity: 0 }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, assembly: [{ partId: "display", from: [20, 0, 0], instruction: "Wrong" }] }, ["body", "display"])?.assembly).toBeUndefined();
  });
});
