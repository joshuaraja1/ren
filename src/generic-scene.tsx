import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VisualLesson } from "../electron/visual-lesson";
import type { Point } from "./contracts";

export type GenericAnchors = Record<string, Point>;

/** A conceptual mechanism graph. Its shapes describe relationships, not the subject's physical form. */
export function makeGenericScene(lesson: Pick<VisualLesson, "parts" | "connections">) {
  const root = new THREE.Group();
  root.name = "Conceptual mechanism schematic";
  const anchors: Record<string, THREE.Vector3> = {};
  const count = lesson.parts.length;
  const radius = count < 5 ? 2.2 : count < 9 ? 2.65 : 3;
  const nodeGeometry = new THREE.IcosahedronGeometry(count > 8 ? .27 : .32, 1);
  const haloGeometry = new THREE.TorusGeometry(count > 8 ? .37 : .43, .025, 8, 32);
  const colors = [0x36c7de, 0xf7be62, 0x83d0a1, 0xc29bef];
  lesson.parts.forEach((part, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    const position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * .68, Math.sin(index * 2.399) * .48);
    anchors[part.id] = position;
    const group = new THREE.Group();
    group.position.copy(position);
    group.name = part.id;
    const color = colors[index % colors.length];
    group.add(new THREE.Mesh(nodeGeometry, new THREE.MeshStandardMaterial({ color, metalness: .38, roughness: .24, emissive: color, emissiveIntensity: .13 })));
    const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .72 }));
    halo.position.z = .02;
    group.add(halo);
    root.add(group);
  });
  for (const connection of lesson.connections) {
    const start = anchors[connection.from];
    const end = anchors[connection.to];
    if (!start || !end) continue;
    const delta = end.clone().sub(start);
    const direction = delta.clone().normalize();
    const from = start.clone().addScaledVector(direction, .4);
    const to = end.clone().addScaledVector(direction, -.43);
    const curve = new THREE.QuadraticBezierCurve3(from, new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2, Math.max(from.z, to.z) + .15), to);
    const flow = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, .022, 6, false), new THREE.MeshStandardMaterial({ color: 0x91c5cb, emissive: 0x256070, emissiveIntensity: .18 }));
    flow.name = `${connection.from} → ${connection.to}: ${connection.label}`;
    root.add(flow);
    const tangent = curve.getTangent(.92).normalize();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.085, .2, 12), new THREE.MeshStandardMaterial({ color: 0xf7be62, emissive: 0x684519, emissiveIntensity: .3 }));
    arrow.position.copy(curve.getPoint(.92));
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    root.add(arrow);
  }
  return { root, anchors };
}

export function projectGenericAnchors(anchors: Record<string, THREE.Vector3>, root: THREE.Group, camera: THREE.PerspectiveCamera): GenericAnchors {
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const result: GenericAnchors = {};
  for (const [id, local] of Object.entries(anchors)) {
    const point = local.clone().applyMatrix4(root.matrixWorld).project(camera);
    if (point.z < -1 || point.z > 1) continue;
    result[id] = { x: Math.max(0, Math.min(1, (point.x + 1) / 2)), y: Math.max(0, Math.min(1, (1 - point.y) / 2)) };
  }
  return result;
}

export function GenericScene({ lesson, onAnchors, onUnavailable }: {
  lesson: VisualLesson;
  onAnchors: (anchors: GenericAnchors) => void;
  onUnavailable: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onAnchors, onUnavailable });
  callbacks.current = { onAnchors, onUnavailable };
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { callbacks.current.onUnavailable(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f5ff, 0x223d49, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-3, 6, 7);
    scene.add(light);
    const model = makeGenericScene(lesson);
    scene.add(model.root);
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    const cursor = { x: .5, y: .5 };
    let azimuth = 0;
    let elevation = .16;
    let frame = 0;
    let lastLabels = -Infinity;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const resize = () => {
      const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      schedule();
    };
    const draw = (time: number) => {
      frame = 0;
      const targetAzimuth = (cursor.x - .5) * Math.PI * 1.35;
      const targetElevation = .16 + (.5 - cursor.y) * .85;
      azimuth += (targetAzimuth - azimuth) * .1;
      elevation += (targetElevation - elevation) * .1;
      const distance = lesson.parts.length > 8 ? 11.5 : 9.4;
      camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, Math.cos(azimuth) * Math.cos(elevation) * distance);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (time - lastLabels > 40) {
        callbacks.current.onAnchors(projectGenericAnchors(model.anchors, model.root, camera));
        lastLabels = time;
      }
      if (Math.abs(targetAzimuth - azimuth) > .001 || Math.abs(targetElevation - elevation) > .001) schedule();
    };
    const updatePointer = (point: Point) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      cursor.x = Math.max(0, Math.min(1, point.x));
      cursor.y = Math.max(0, Math.min(1, point.y));
      schedule();
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener("resize", resize);
    const unsubscribe = window.ren?.onOrbitPointer(updatePointer);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe?.(); observer?.disconnect(); window.removeEventListener("resize", resize);
      model.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [lesson]);
  return <div className="jet-scene" ref={host} aria-hidden="true" />;
}
