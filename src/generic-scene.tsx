import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VisualLesson } from "../electron/visual-lesson";
import type { SceneSpec } from "../electron/scene-spec";
import type { Point } from "./contracts";

export type GenericAnchors = Record<string, Point>;

export type SubjectScene = ReturnType<typeof makeSubjectScene>;

/** Leave time to see the separated parts, then move each part in turn. */
export function assemblyProgressAt(elapsedMs: number, stepCount: number, reducedMotion = false): number {
  if (reducedMotion) return stepCount;
  return Math.min(stepCount, Math.max(0, (elapsedMs - 900) / 2200));
}

/** Move each part from an exploded position to its validated teaching position. */
export function applyAssemblyProgress(model: SubjectScene, progress: number) {
  const steps = model.assembly;
  if (!steps?.length) return;
  for (const [partId, meshes] of Object.entries(model.partMeshes)) {
    const index = steps.findIndex((step) => step.partId === partId);
    const step = steps[index];
    const fraction = index < 0 ? 1 : Math.max(0, Math.min(1, progress - index));
    const eased = fraction * fraction * (3 - 2 * fraction);
    const offset = step ? new THREE.Vector3(...step.from).multiplyScalar(1 - eased) : new THREE.Vector3();
    meshes.forEach((mesh, meshIndex) => mesh.position.copy(model.partPositions[partId][meshIndex]).add(offset));
    model.anchors[partId].copy(model.anchorPositions[partId]).add(offset);
  }
  const assembled = progress >= steps.length;
  model.connectionObjects.forEach((object) => { object.visible = assembled; });
}

/** Build rotatable geometry supplied by the provider. Anchors are in the same model coordinates. */
export function makeSubjectScene(spec: SceneSpec, connections: VisualLesson["connections"] = []) {
  const root = new THREE.Group();
  root.name = `Illustrative 3D model: ${spec.subject}`;
  const anchors: Record<string, THREE.Vector3> = {};
  const partMeshes: Record<string, THREE.Mesh[]> = {};
  const partPositions: Record<string, THREE.Vector3[]> = {};
  const connectionObjects: THREE.Object3D[] = [];
  for (const part of spec.primitives) {
    let geometry: THREE.BufferGeometry;
    switch (part.kind) {
      case "box": geometry = new THREE.BoxGeometry(1, 1, 1); break;
      case "sphere": geometry = new THREE.SphereGeometry(.5, 24, 16); break;
      case "cylinder": geometry = new THREE.CylinderGeometry(.5, .5, 1, 24); break;
      case "cone": geometry = new THREE.ConeGeometry(.5, 1, 24); break;
      case "torus": geometry = new THREE.TorusGeometry(.5, .14, 10, 32); break;
      case "capsule": {
        geometry = new THREE.CapsuleGeometry(.3, .4, 8, 16);
        geometry.scale(1 / .6, 1, 1 / .6);
        break;
      }
      case "extrusion": {
        const points = part.outline!;
        const shape = new THREE.Shape();
        shape.moveTo(...points[0]);
        for (const point of points.slice(1)) shape.lineTo(...point);
        shape.closePath();
        geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, steps: 1, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, curveSegments: 4 });
        geometry.translate(0, 0, -.5);
        break;
      }
      default: geometry = new THREE.BoxGeometry(1, 1, 1);
    }
    const material = new THREE.MeshStandardMaterial({ color: part.color, metalness: .28, roughness: .42, side: THREE.DoubleSide, transparent: part.opacity !== undefined && part.opacity < 1, opacity: part.opacity ?? 1, depthWrite: part.opacity === undefined || part.opacity === 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.partId;
    mesh.position.set(...part.position);
    mesh.scale.set(...part.scale);
    mesh.rotation.set(...part.rotation);
    root.add(mesh);
    (partMeshes[part.partId] ??= []).push(mesh);
    (partPositions[part.partId] ??= []).push(mesh.position.clone());
  }
  for (const anchor of spec.anchors) anchors[anchor.partId] = new THREE.Vector3(...anchor.position);
  const anchorPositions = Object.fromEntries(Object.entries(anchors).map(([id, position]) => [id, position.clone()])) as Record<string, THREE.Vector3>;
  for (const connection of connections) {
    const from = anchors[connection.from];
    const to = anchors[connection.to];
    if (!from || !to) continue;
    const direction = to.clone().sub(from);
    if (direction.length() < .05) continue;
    const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, .5).add(new THREE.Vector3(0, .2, .3)), to);
    const flow = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .018, 6, false), new THREE.MeshBasicMaterial({ color: 0x71d4e4, transparent: true, opacity: .76 }));
    flow.name = `${connection.from} → ${connection.to}: ${connection.label}`;
    root.add(flow);
    connectionObjects.push(flow);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.07, .17, 12), new THREE.MeshBasicMaterial({ color: 0xf7be62 }));
    arrow.position.copy(curve.getPoint(.87));
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(.87).normalize());
    root.add(arrow);
    connectionObjects.push(arrow);
  }
  return { root, anchors, partMeshes, partPositions, anchorPositions, connectionObjects, assembly: spec.assembly };
}

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

/** Fit the whole subject through a full cursor orbit, including diagonal views. */
export function orbitCameraDistance(bounds: THREE.Box3, verticalFovDegrees: number, aspect: number): number {
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const halfVertical = THREE.MathUtils.degToRad(verticalFovDegrees / 2);
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(.1, aspect));
  return Math.min(75, Math.max(7, radius / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.2 + 1));
}

/** Fit the current angle rather than reserving space for the widest possible orbit. */
export function cameraDistanceForView(bounds: THREE.Box3, azimuth: number, elevation: number, fov: number, aspect: number): number {
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  return cameraDistanceForPoints(corners, bounds.getCenter(new THREE.Vector3()), azimuth, elevation, fov, aspect);
}

/** Fit real mesh corners, avoiding empty corners from the union bounding box. */
export function sceneGeometryCorners(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      points.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
    }
  });
  return points;
}

export function cameraDistanceForPoints(points: THREE.Vector3[], center: THREE.Vector3, azimuth: number, elevation: number, fov: number, aspect: number): number {
  const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tangentY = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * .86;
  const tangentX = tangentY * Math.max(.1, aspect);
  let required = 4;
  for (const point of points) {
    const corner = point.clone().sub(center);
    required = Math.max(required, corner.dot(direction) + Math.abs(corner.dot(right)) / tangentX,
      corner.dot(direction) + Math.abs(corner.dot(up)) / tangentY);
  }
  return Math.min(75, required * 1.06);
}

/** Start wide enough for separated parts, then settle on the finished object. */
export function assemblyCameraFrame(startingBounds: THREE.Box3, assembledBounds: THREE.Box3, completion: number, fov: number, aspect: number) {
  const fraction = THREE.MathUtils.clamp(completion, 0, 1);
  const eased = fraction * fraction * (3 - 2 * fraction);
  return {
    center: startingBounds.getCenter(new THREE.Vector3()).lerp(assembledBounds.getCenter(new THREE.Vector3()), eased),
    distance: THREE.MathUtils.lerp(orbitCameraDistance(startingBounds, fov, aspect), orbitCameraDistance(assembledBounds, fov, aspect), eased),
  };
}

/** Use a tabletop view for any wide, thin subject with a horizontal base. */
export function hasHorizontalBase(spec: SceneSpec): boolean {
  const bounds = new THREE.Box3();
  for (const part of spec.primitives) {
    const half = new THREE.Vector3(...part.scale).multiplyScalar(.5);
    const center = new THREE.Vector3(...part.position);
    bounds.expandByPoint(center.clone().sub(half));
    bounds.expandByPoint(center.add(half));
  }
  const size = bounds.getSize(new THREE.Vector3());
  return size.y < Math.max(size.x, size.z) * .8
    && spec.primitives.some((part) => part.kind === "box" && part.scale[0] > 1 && part.scale[2] > 1
      && part.scale[1] < Math.min(part.scale[0], part.scale[2]) * .2
      && part.position[1] < bounds.min.y + size.y * .35);
}

export function GenericScene({ lesson, onAnchors, onUnavailable, onAssemblyStep }: {
  lesson: VisualLesson;
  onAnchors: (anchors: GenericAnchors) => void;
  onUnavailable: () => void;
  onAssemblyStep?: (step: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onAnchors, onUnavailable, onAssemblyStep: undefined as ((step: number) => void) | undefined });
  callbacks.current = { onAnchors, onUnavailable, onAssemblyStep };
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
    const horizontalSubject = lesson.model ? hasHorizontalBase(lesson.model) : false;
    renderer.shadowMap.enabled = horizontalSubject;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f5ff, 0x223d49, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-3, 6, 7);
    light.castShadow = horizontalSubject;
    light.shadow.mapSize.set(256, 256);
    light.shadow.radius = 6;
    light.shadow.camera.left = -6; light.shadow.camera.right = 6;
    light.shadow.camera.top = 6; light.shadow.camera.bottom = -6;
    scene.add(light);
    // Part callouts identify physical components; semantic edges are not literal cables.
    const model = lesson.model ? makeSubjectScene(lesson.model) : makeGenericScene(lesson);
    scene.add(model.root);
    let floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | undefined;
    if (horizontalSubject) {
      model.root.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
      floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: .1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = new THREE.Box3().setFromObject(model.root).min.y - .05;
      floor.receiveShadow = true;
      scene.add(floor);
    }
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    const assembledPoints = sceneGeometryCorners(model.root);
    const assembledBounds = new THREE.Box3().setFromPoints(assembledPoints);
    const startingBounds = assembledBounds.clone();
    let startingPoints = assembledPoints;
    if (lesson.playAssembly && lesson.model?.assembly?.length) {
      applyAssemblyProgress(model as SubjectScene, 0);
      startingPoints = sceneGeometryCorners(model.root);
      startingBounds.union(new THREE.Box3().setFromPoints(startingPoints));
      applyAssemblyProgress(model as SubjectScene, lesson.model.assembly.length);
    }
    const assembly = lesson.playAssembly ? lesson.model?.assembly : undefined;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let assemblyStarted = 0;
    let reportedStep = -1;
    if (lesson.model && assembly?.length) applyAssemblyProgress(model as SubjectScene, reducedMotion ? assembly.length : 0);
    const cursor = { x: .5, y: .5 };
    let azimuth = horizontalSubject ? .38 : 0;
    let elevation = horizontalSubject ? .62 : .16;
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
      let completion = 1;
      if (lesson.model && assembly?.length) {
        if (!assemblyStarted) assemblyStarted = time;
        const progress = assemblyProgressAt(time - assemblyStarted, assembly.length, reducedMotion);
        completion = progress / assembly.length;
        applyAssemblyProgress(model as SubjectScene, progress);
        const step = progress >= assembly.length ? assembly.length + 1 : Math.floor(progress) + 1;
        if (step !== reportedStep) { reportedStep = step; callbacks.current.onAssemblyStep?.(step); }
      }
      const targetAzimuth = (horizontalSubject ? .38 : 0) + (cursor.x - .5) * Math.PI * (horizontalSubject ? .95 : 1.35);
      const targetElevation = horizontalSubject
        ? Math.max(.22, Math.min(1.18, .62 + (.5 - cursor.y) * .95))
        : .16 + (.5 - cursor.y) * .85;
      azimuth += (targetAzimuth - azimuth) * .1;
      elevation += (targetElevation - elevation) * .1;
      const { center } = assemblyCameraFrame(startingBounds, assembledBounds, completion, camera.fov, camera.aspect);
      const distance = THREE.MathUtils.lerp(
        cameraDistanceForPoints(startingPoints, center, azimuth, elevation, camera.fov, camera.aspect),
        cameraDistanceForPoints(assembledPoints, center, azimuth, elevation, camera.fov, camera.aspect), completion);
      camera.position.set(center.x + Math.sin(azimuth) * Math.cos(elevation) * distance, center.y + Math.sin(elevation) * distance, center.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
      camera.lookAt(center);
      renderer.render(scene, camera);
      if (time - lastLabels > 40) {
        callbacks.current.onAnchors(projectGenericAnchors(model.anchors, model.root, camera));
        lastLabels = time;
      }
      if (Math.abs(targetAzimuth - azimuth) > .001 || Math.abs(targetElevation - elevation) > .001 || Boolean(assembly?.length && !reducedMotion && reportedStep <= assembly.length)) schedule();
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
      floor?.geometry.dispose(); floor?.material.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [lesson]);
  return <div className="jet-scene" ref={host} aria-hidden="true" />;
}
