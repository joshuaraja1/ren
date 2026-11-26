import * as THREE from "three";
import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { VisualLesson } from "../electron/visual-lesson";
import type { SceneSpec } from "../electron/scene-spec";
import { raspberryPiCameraTemplate } from "../electron/scene-templates";
import { GenericScene, applyAssemblyProgress, assemblyCameraFrame, assemblyProgressAt, cameraDistanceForPoints, cameraDistanceForView, hasHorizontalBase, makeGenericScene, makeSubjectScene, orbitCameraDistance, projectGenericAnchors, sceneGeometryCorners } from "./generic-scene";

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

it("fits the visible angle more closely while keeping every subject corner in frame", () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-3, -.2, -1), new THREE.Vector3(3, 2, 1));
  const camera = new THREE.PerspectiveCamera(38, 1.45, .1, 100);
  for (const azimuth of [0, .45, Math.PI / 2, Math.PI]) {
    const elevation = .6;
    const center = bounds.getCenter(new THREE.Vector3());
    const distance = cameraDistanceForView(bounds, azimuth, elevation, camera.fov, camera.aspect);
    camera.position.set(center.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      center.y + Math.sin(elevation) * distance, center.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
    camera.lookAt(center); camera.updateMatrixWorld(true);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(.95);
      expect(Math.abs(point.y)).toBeLessThan(.95);
    }
  }
  expect(cameraDistanceForView(bounds, 0, .6, camera.fov, camera.aspect)).toBeLessThan(orbitCameraDistance(bounds, camera.fov, camera.aspect));
});

it("fits actual Pi geometry without reserving empty corners above the board", () => {
  const piLesson: VisualLesson = { ...lesson, title: "Raspberry Pi 5 camera setup", parts: [
    { id: "pi", label: "Raspberry Pi 5", explanation: "Host board", x: .5, y: .2 },
    { id: "cable", label: "Ribbon cable", explanation: "Adapter", x: .5, y: .5 },
    { id: "camera", label: "Camera Module 3", explanation: "Image sensor", x: .5, y: .8 },
  ] };
  const spec = raspberryPiCameraTemplate(piLesson, "Show a Pi 5 camera", false)!;
  const { root } = makeSubjectScene(spec);
  const points = sceneGeometryCorners(root);
  const bounds = new THREE.Box3().setFromPoints(points);
  const center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(38, 1.6, .1, 100);
  for (const azimuth of [-.2, .38, 1.1]) {
    const elevation = .62;
    const distance = cameraDistanceForPoints(points, center, azimuth, elevation, camera.fov, camera.aspect);
    expect(distance).toBeLessThan(cameraDistanceForView(bounds, azimuth, elevation, camera.fov, camera.aspect));
    camera.position.set(center.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      center.y + Math.sin(elevation) * distance, center.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
    camera.lookAt(center); camera.updateMatrixWorld(true);
    for (const point of points) {
      const projected = point.clone().project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  }
});

it("frames separated parts at first and closes in on the assembled subject", () => {
  const assembled = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const starting = new THREE.Box3(new THREE.Vector3(-5, -1, -1), new THREE.Vector3(1, 3, 3));
  const first = assemblyCameraFrame(starting, assembled, 0, 38, 1.4);
  const middle = assemblyCameraFrame(starting, assembled, .5, 38, 1.4);
  const final = assemblyCameraFrame(starting, assembled, 1, 38, 1.4);
  expect(first.center.equals(starting.getCenter(new THREE.Vector3()))).toBe(true);
  expect(final.center.equals(assembled.getCenter(new THREE.Vector3()))).toBe(true);
  expect(first.distance).toBeGreaterThan(middle.distance);
  expect(middle.distance).toBeGreaterThan(final.distance);
});

it("uses a tabletop camera for arbitrary flat subjects without tilting upright subjects", () => {
  const primitive = (partId: string, position: [number, number, number], scale: [number, number, number]) =>
    ({ partId, kind: "box" as const, position, scale, rotation: [0, 0, 0] as [number, number, number], color: "#336699" });
  const base: SceneSpec = { version: 1, subject: "Tablet repair", fidelity: "conceptual", primitives: [
    primitive("body", [0, 0, 0], [3, .12, 2]), primitive("screen", [0, .12, 0], [2.8, .06, 1.8]),
  ], anchors: [{ partId: "body", position: [0, 0, 0] }, { partId: "screen", position: [0, .12, 0] }] };
  expect(hasHorizontalBase(base)).toBe(true);
  expect(hasHorizontalBase({ ...base, subject: "Desktop tower", primitives: [
    primitive("body", [0, 0, 0], [3, 4, .2]), primitive("screen", [0, 2, 0], [2, .2, 1.5]),
  ] })).toBe(false);
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

it("moves the Pi camera cable before the camera and leaves the board fixed", () => {
  const piLesson: VisualLesson = {
    ...lesson, title: "Raspberry Pi 5 camera setup",
    parts: [
      { id: "pi", label: "Raspberry Pi 5", explanation: "Host board", x: .5, y: .2 },
      { id: "cable", label: "Ribbon cable", explanation: "Adapter", x: .5, y: .5 },
      { id: "camera", label: "Camera Module 3", explanation: "Image sensor", x: .5, y: .8 },
    ],
  };
  const spec = raspberryPiCameraTemplate(piLesson, "Animate a Pi 5 camera assembly", true)!;
  const model = makeSubjectScene(spec);
  const boardFinal = model.partMeshes.pi[0].position.clone();
  const cableFinal = model.partPositions.cable[0].clone();
  const cameraFinal = model.partPositions.camera[0].clone();
  applyAssemblyProgress(model, 0);
  expect(model.partMeshes.pi[0].position.equals(boardFinal)).toBe(true);
  expect(model.partMeshes.cable[0].position.y).toBeGreaterThan(cableFinal.y);
  expect(model.partMeshes.camera[0].position.y).toBeGreaterThan(cameraFinal.y);
  applyAssemblyProgress(model, 1);
  expect(model.partMeshes.cable[0].position.equals(cableFinal)).toBe(true);
  expect(model.partMeshes.camera[0].position.y).toBeGreaterThan(cameraFinal.y);
  applyAssemblyProgress(model, 2);
  expect(model.partMeshes.camera[0].position.equals(cameraFinal)).toBe(true);
  expect(model.anchors.camera.y).toBeCloseTo(spec.anchors.find((item) => item.partId === "camera")!.position[1]);
});

it("holds the exploded view before moving each part through visible assembly steps", () => {
  expect(assemblyProgressAt(800, 2)).toBe(0);
  expect(assemblyProgressAt(2000, 2)).toBeCloseTo(.5);
  expect(assemblyProgressAt(3100, 2)).toBe(1);
  expect(assemblyProgressAt(4200, 2)).toBeCloseTo(1.5);
  expect(assemblyProgressAt(5300, 2)).toBe(2);
  expect(assemblyProgressAt(0, 2, true)).toBe(2);
});

it("reports a missing WebGL context for the host to display its 2D fallback", () => {
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const unavailable = vi.fn();
  render(React.createElement(GenericScene, { lesson, onAnchors: vi.fn(), onUnavailable: unavailable }));
  expect(unavailable).toHaveBeenCalledOnce();
  context.mockRestore();
});
