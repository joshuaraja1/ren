import * as THREE from "three";
import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { JetScene, makeJet, projectedJetAnchors } from "./jet-scene";

it("builds a real aircraft mesh with separated front lift and rear propulsion", () => {
  const jet = makeJet();
  const bounds = new THREE.Box3().setFromObject(jet);
  expect(jet.children.length).toBeGreaterThan(20);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(9);
  expect(bounds.max.z - bounds.min.z).toBeGreaterThan(6);
  expect(bounds.max.y - bounds.min.y).toBeGreaterThan(2);
});

it("reports an unavailable graphics context so the lesson can show its fallback", () => {
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const unavailable = vi.fn();
  render(React.createElement(JetScene, { onAnchors: vi.fn(), onUnavailable: unavailable }));
  expect(unavailable).toHaveBeenCalledOnce();
  context.mockRestore();
});

it("hides leaders to parts blocked by the model after orbiting behind it", () => {
  const jet = makeJet();
  const camera = new THREE.PerspectiveCamera(38, 1.6, .1, 100);
  camera.position.set(-7, 5, 8);
  camera.lookAt(0, 0, 0);
  const front = projectedJetAnchors(jet, camera);
  camera.position.set(7, -5, -8);
  camera.lookAt(0, 0, 0);
  const back = projectedJetAnchors(jet, camera);
  expect(Object.keys(front).length).toBeGreaterThanOrEqual(2);
  expect(Object.keys(back).length).toBeGreaterThanOrEqual(1);
  expect(front.fan).toBeDefined();
  expect(back.fan).toBeUndefined();
});
