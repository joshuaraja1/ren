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

  it("rejects missing, unknown, or duplicate part anchors", () => {
    const scene = valid();
    expect(validateSceneSpec({ ...scene, anchors: scene.anchors.slice(0, 1) }, ["body", "display"])).toBeNull();
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
    expect(validateSceneSpec({ ...scene, anchors: [scene.anchors[0], { partId: "display", position: [5, 5, 5] }] }, ["body", "display"])).toBeNull();
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
    expect(validateSceneSpec({ ...scene, primitives: [{ ...scene.primitives[0], opacity: 0 }, scene.primitives[1]] }, ["body", "display"])).toBeNull();
    expect(validateSceneSpec({ ...scene, assembly: [{ partId: "display", from: [20, 0, 0], instruction: "Wrong" }] }, ["body", "display"])?.assembly).toBeUndefined();
  });
});
