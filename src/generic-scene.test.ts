import * as THREE from "three";
import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { VisualLesson } from "../electron/visual-lesson";
import type { SceneSpec } from "../electron/scene-spec";
import { GenericScene, applyAssemblyProgress, makeGenericScene, makeSubjectScene, orbitCameraDistance, projectGenericAnchors } from "./generic-scene";

const lesson: VisualLesson = {
  version: 1, title: "Camera signal path", placement: { x: 0, y: 0, width: 1, height: 1 },
  parts: [
    { id: "lens", label: "Lens", explanation: "Focuses light", x: .2, y: .3 },
    { id: "sensor", label: "Sensor", explanation: "Converts light", x: .5, y: .5 },
    { id: "processor", label: "Processor", explanation: "Handles pixels", x: .8, y: .6 },
  ],
  connections: [
    { from: "lens", to: "sensor", label: "focuses onto" },
    { from: "sensor", to: "processor", label: "sends pixels" },
  ],
};

it("builds a bounded conceptual 3D mechanism with a distinct node and directed path per part and connection", () => {
  const { root, anchors } = makeGenericScene(lesson);
  expect(root.name).toContain("Conceptual");
  expect(Object.keys(anchors)).toEqual(["lens", "sensor", "processor"]);
  expect(root.children.filter((object) => object.name.includes("→"))).toHaveLength(2);
  const bounds = new THREE.Box3().setFromObject(root);
  expect(bounds.max.x - bounds.min.x).toBeLessThan(8);
  expect(bounds.max.y - bounds.min.y).toBeLessThan(8);
  expect(bounds.max.z - bounds.min.z).toBeGreaterThan(.5);
});

it("keeps projected part anchors on screen as the camera orbits", () => {
  const { root, anchors } = makeGenericScene(lesson);
  const camera = new THREE.PerspectiveCamera(38, 1.6, .1, 100);
  for (const x of [-3, 0, 3]) {
    camera.position.set(x, 2, 9);
    camera.lookAt(0, 0, 0);
    const projected = projectGenericAnchors(anchors, root, camera);
    expect(Object.keys(projected)).toHaveLength(3);
    for (const point of Object.values(projected)) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  }
});

it("keeps a wide subject fully framed while orbiting through diagonal views", () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-5, -1, -1), new THREE.Vector3(5, 1, 1));
  const camera = new THREE.PerspectiveCamera(38, 1.25, .1, 100);
  const distance = orbitCameraDistance(bounds, camera.fov, camera.aspect);
  for (const azimuth of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    camera.position.set(Math.sin(azimuth) * distance, distance * .15, Math.cos(azimuth) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    for (const corner of [
      [-5, -1, -1], [-5, -1, 1], [-5, 1, -1], [-5, 1, 1],
      [5, -1, -1], [5, -1, 1], [5, 1, -1], [5, 1, 1],
    ]) {
      const projected = new THREE.Vector3(corner[0], corner[1], corner[2]).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  }
});

it("renders subject geometry from the model spec and keeps labels tied to its real part anchors", () => {
  const spec: SceneSpec = {
    version: 1, subject: "Camera", fidelity: "conceptual",
    primitives: [
      { partId: "lens", kind: "cylinder", position: [-1, 0, 0], scale: [.7, .4, .7], rotation: [Math.PI / 2, 0, 0], color: "#777777" },
      { partId: "sensor", kind: "extrusion", position: [0, 0, 0], scale: [.8, .7, .2], rotation: [0, 0, 0], color: "#336699", outline: [[-.5, -.4], [.5, -.4], [.4, .4], [-.4, .4]] },
      { partId: "processor", kind: "capsule", position: [1, 0, 0], scale: [.5, .5, .2], rotation: [0, 0, 0], color: "#cc8844" },
    ],
    anchors: [
      { partId: "lens", position: [-1, 0, .25] },
      { partId: "sensor", position: [0, 0, .2] },
      { partId: "processor", position: [1, 0, .2] },
    ],
  };
  const { root, anchors } = makeSubjectScene(spec, lesson.connections);
  expect(root.children.filter((object) => object instanceof THREE.Mesh && object.name === "lens")).toHaveLength(1);
  expect((root.children.find((object) => object.name === "sensor") as THREE.Mesh).geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
  const capsule = root.children.find((object) => object.name === "processor") as THREE.Mesh;
  expect(capsule.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
  const capsuleSize = new THREE.Box3().setFromObject(capsule).getSize(new THREE.Vector3());
  expect(capsuleSize.x).toBeCloseTo(.5, 1);
  expect(capsuleSize.y).toBeCloseTo(.5, 1);
  expect(capsuleSize.z).toBeCloseTo(.2, 1);
  expect(root.children.filter((object) => object.name.includes("→"))).toHaveLength(2);
  expect(anchors.lens.x).toBe(-1);
  const camera = new THREE.PerspectiveCamera(38, 1.6, .1, 100);
  camera.position.set(2, 2, 8); camera.lookAt(0, 0, 0);
  const front = projectGenericAnchors(anchors, root, camera);
  camera.position.set(-2, 2, 8); camera.lookAt(0, 0, 0);
  const otherSide = projectGenericAnchors(anchors, root, camera);
  expect(Object.keys(front)).toEqual(["lens", "sensor", "processor"]);
  expect(front.lens.x).not.toBe(otherSide.lens.x);
});

it("moves a phone display into place step by step while preserving its final anchor and a translucent housing", () => {
  const spec: SceneSpec = {
    version: 1, subject: "Phone", fidelity: "conceptual",
    primitives: [
      { partId: "body", kind: "box", position: [0, 0, 0], scale: [2, 3, .4], rotation: [0, 0, 0], color: "#445566", opacity: .4 },
      { partId: "display", kind: "box", position: [0, .4, .3], scale: [1.5, 1.8, .1], rotation: [0, 0, 0], color: "#aaccdd" },
    ],
    anchors: [{ partId: "body", position: [0, 0, 0] }, { partId: "display", position: [0, .4, .3] }],
    assembly: [{ partId: "display", from: [0, 0, 2], instruction: "Lower the display into the housing." }],
  };
  const model = makeSubjectScene(spec, [{ from: "body", to: "display", label: "holds" }]);
  const display = model.partMeshes.display[0];
  applyAssemblyProgress(model, 0);
  expect(display.position.z).toBeCloseTo(2.3);
  expect(model.anchors.display.z).toBeCloseTo(2.3);
  expect(model.connectionObjects.every((object) => !object.visible)).toBe(true);
  applyAssemblyProgress(model, .5);
  expect(display.position.z).toBeCloseTo(1.3);
  applyAssemblyProgress(model, 1);
  expect(display.position.z).toBeCloseTo(.3);
  expect(model.anchors.display.z).toBeCloseTo(.3);
  expect(model.connectionObjects.every((object) => object.visible)).toBe(true);
  expect((model.partMeshes.body[0].material as THREE.MeshStandardMaterial).opacity).toBe(.4);
});

it("reports a missing WebGL context for the host to display its 2D fallback", () => {
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const unavailable = vi.fn();
  render(React.createElement(GenericScene, { lesson, onAnchors: vi.fn(), onUnavailable: unavailable }));
  expect(unavailable).toHaveBeenCalledOnce();
  context.mockRestore();
});
