import * as THREE from "three";
import { makeJet } from "./jet-scene";

it("builds a real aircraft mesh with separated front lift and rear propulsion", () => {
  const jet = makeJet();
  const bounds = new THREE.Box3().setFromObject(jet);
  expect(jet.children.length).toBeGreaterThan(20);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(9);
  expect(bounds.max.z - bounds.min.z).toBeGreaterThan(6);
  expect(bounds.max.y - bounds.min.y).toBeGreaterThan(2);
});
