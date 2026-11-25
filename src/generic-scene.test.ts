import * as THREE from "three";
import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { VisualLesson } from "../electron/visual-lesson";
import { GenericScene, makeGenericScene, projectGenericAnchors } from "./generic-scene";

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

it("reports a missing WebGL context for the host to display its 2D fallback", () => {
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const unavailable = vi.fn();
  render(React.createElement(GenericScene, { lesson, onAnchors: vi.fn(), onUnavailable: unavailable }));
  expect(unavailable).toHaveBeenCalledOnce();
  context.mockRestore();
});
