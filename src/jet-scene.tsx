import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Point } from "./contracts";

export type JetAnchor = "engine" | "fan" | "nozzle" | "posts" | "controls";
export type JetAnchors = Partial<Record<JetAnchor, Point>>;

function slab(points: [number, number][], thickness: number, material: THREE.Material, y: number) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => index ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: .04, bevelSize: .05, bevelSegments: 2 }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

function cylinder(radiusTop: number, radiusBottom: number, length: number, material: THREE.Material, x: number, y: number, z: number, alongX = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 24), material);
  if (alongX) mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

export function makeJet() {
  const root = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x7b8995, metalness: .65, roughness: .34, side: THREE.DoubleSide });
  const edge = new THREE.MeshStandardMaterial({ color: 0x495765, metalness: .5, roughness: .46, side: THREE.DoubleSide });
  const engine = new THREE.MeshStandardMaterial({ color: 0xafa99b, metalness: .78, roughness: .27 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x193b4c, metalness: .35, roughness: .13, transmission: .3, transparent: true, opacity: .82 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x32b8ec, emissive: 0x087ca5, emissiveIntensity: .25, metalness: .3 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xffa24a, emissive: 0xb74109, emissiveIntensity: .45, metalness: .2 });

  root.add(slab([[-5,0],[-3.25,-.43],[-1.5,-.7],[1.6,-.72],[4.35,-.45],[5,-.25],[5,.25],[4.35,.45],[1.6,.72],[-1.5,.7],[-3.25,.43]], .23, shell, .02));
  root.add(slab([[-2.2,-.45],[-.7,-1.1],[.2,-3],[1.25,-3.35],[2.05,-2.8],[1.15,-.6],[1.15,.6],[2.05,2.8],[1.25,3.35],[.2,3],[-.7,1.1],[-2.2,.45]], .13, shell, -.08));
  root.add(slab([[1.8,-.5],[3.2,-1.8],[4.25,-1.75],[3.55,-.35],[3.55,.35],[4.25,1.75],[3.2,1.8],[1.8,.5]], .12, edge, .04));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass);
  canopy.scale.set(1.12,.38,.43);
  canopy.position.set(-2.9,.38,0);
  root.add(canopy);
  for (const side of [-1,1]) {
    const fin = new THREE.Shape();
    fin.moveTo(2.1,.16); fin.lineTo(3.25,1.55); fin.lineTo(4.35,.18); fin.closePath();
    const tail = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: .13, bevelEnabled: false }), edge);
    tail.position.z = side * .8;
    tail.rotation.x = side * .18;
    root.add(tail);
  }
  // A restrained cutaway exposes one fan and one powerplant instead of invented duplicate machinery.
  root.add(cylinder(.42,.48,3.1,engine,1.65,.39,0,true));
  for (const x of [.55,1.6,2.65]) root.add(cylinder(.51,.51,.09,edge,x,.39,0,true));
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(.78,.11,12,36), engine);
  fanRing.rotation.x = -Math.PI / 2;
  fanRing.position.set(-.85,.41,0);
  root.add(fanRing);
  root.add(cylinder(.14,.14,.1,edge,-.85,.43,0));
  for (let i=0;i<10;i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.61,.035,.14), shell);
    const angle = i * Math.PI / 5;
    blade.position.set(-.85 + Math.cos(angle)*.42,.42,Math.sin(angle)*.42);
    blade.rotation.y = -angle;
    root.add(blade);
  }
  root.add(cylinder(.39,.44,.65,engine,4.15,.25,0,true));
  const nozzle = cylinder(.37,.29,.54,edge,4.62,.03,0,true);
  nozzle.rotation.z = Math.PI / 2 - .5;
  root.add(nozzle);
  for (const side of [-1,1]) {
    root.add(cylinder(.16,.18,.4,engine,.95,-.36,side*2.4));
    const flow = new THREE.Mesh(new THREE.ConeGeometry(.16,.52,16),blue);
    flow.rotation.z = Math.PI;
    flow.position.set(.95,-.79,side*2.4);
    root.add(flow);
  }
  const fanFlow = new THREE.Mesh(new THREE.ConeGeometry(.24,.75,20), blue);
  fanFlow.rotation.z = Math.PI;
  fanFlow.position.set(-.85,-.45,0);
  root.add(fanFlow);
  const jetFlow = new THREE.Mesh(new THREE.ConeGeometry(.3,.8,20), orange);
  jetFlow.rotation.z = Math.PI;
  jetFlow.position.set(4.75,-.65,0);
  root.add(jetFlow);
  return root;
}

const points: Record<JetAnchor, THREE.Vector3> = {
  engine: new THREE.Vector3(1.55,.65,.42), fan: new THREE.Vector3(-.85,.55,0),
  nozzle: new THREE.Vector3(4.75,-.65,0), posts: new THREE.Vector3(.95,-.42,2.4),
  controls: new THREE.Vector3(3.4,.7,.8),
};

/** Hide leaders for parts that the jet itself blocks at the current camera angle. */
export function projectedJetAnchors(jet: THREE.Group, camera: THREE.PerspectiveCamera): JetAnchors {
  jet.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const anchors: JetAnchors = {};
  for (const [key, value] of Object.entries(points)) {
    const position = value.clone();
    if (key === "engine") position.z = Math.sign(camera.position.z || 1) * .42;
    if (key === "posts") position.z = Math.sign(camera.position.z || 1) * 2.4;
    const direction = position.clone().sub(camera.position);
    const distance = direction.length();
    ray.set(camera.position, direction.normalize());
    const blocked = ray.intersectObject(jet, true).some((hit) => {
      const material = (hit.object as THREE.Mesh).material;
      return hit.distance < distance - .35 && !Array.isArray(material) && !material.transparent;
    });
    if (blocked) continue;
    const projected = position.project(camera);
    anchors[key as JetAnchor] = { x: .17 + (projected.x + 1) * .33, y: .13 + (1 - projected.y) * .38 };
  }
  return anchors;
}

export function JetScene({ onAnchors, onUnavailable }: { onAnchors: (anchors: JetAnchors) => void; onUnavailable: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onAnchors);
  const failure = useRef(onUnavailable);
  callback.current = onAnchors;
  failure.current = onUnavailable;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { failure.current(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xeaf6ff,0x344552,2.2));
    const light = new THREE.DirectionalLight(0xffffff,3.2);
    light.position.set(-4,8,5);
    scene.add(light);
    const jet = makeJet();
    scene.add(jet);
    const camera = new THREE.PerspectiveCamera(38,1,.1,100);
    const cursor = { x: .5, y: .5 };
    let azimuth = -.68;
    let elevation = .42;
    let frame = 0;
    let lastLabels = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const resize = () => {
      const width = Math.max(1,element.clientWidth), height = Math.max(1,element.clientHeight);
      renderer.setSize(width,height,false);
      camera.aspect = width/height;
      camera.updateProjectionMatrix();
      schedule();
    };
    const draw = (time: number) => {
      frame = 0;
      const targetAzimuth = -.68 + (cursor.x-.5)*Math.PI*2;
      const targetElevation = .42 + (.5-cursor.y)*.85;
      azimuth += (targetAzimuth-azimuth)*.085;
      elevation += (targetElevation-elevation)*.085;
      const radius = 12.8;
      camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(azimuth)*Math.cos(elevation)*radius);
      camera.lookAt(0,0,0);
      renderer.render(scene,camera);
      if (time-lastLabels > 40) {
        callback.current(projectedJetAnchors(jet,camera));
        lastLabels = time;
      }
      if (Math.abs(targetAzimuth-azimuth) > .001 || Math.abs(targetElevation-elevation) > .001) schedule();
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener("resize", resize);
    const unsubscribe = window.ren?.onOrbitPointer((point) => {
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
        cursor.x = Math.max(0,Math.min(1,point.x)); cursor.y = Math.max(0,Math.min(1,point.y));
        schedule();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe?.(); observer?.disconnect(); window.removeEventListener("resize",resize);
      jet.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <div className="jet-scene" ref={host} aria-hidden="true" />;
}
