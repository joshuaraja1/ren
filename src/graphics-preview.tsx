import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { VisualLesson } from "../electron/visual-lesson";
import { desktopComputerTemplate, raspberryPiCameraTemplate } from "../electron/scene-templates";
import { VisualLessonOverlay } from "./visual-lesson-overlay";
import type { Point, RenBridge } from "./contracts";
import "./overlay.css";
import "./graphics-preview.css";

const pointerListeners = new Set<(point: Point) => void>();
window.ren = {
  onOrbitPointer(listener: (point: Point) => void) {
    pointerListeners.add(listener);
    return () => { pointerListeners.delete(listener); };
  },
} as unknown as RenBridge;

const placement = { x: .025, y: .04, width: .95, height: .91 };
const piParts: VisualLesson["parts"] = [
  { id: "board", label: "Raspberry Pi 5", explanation: "Horizontal main board with two CAM/DISP connectors.", x: .42, y: .68 },
  { id: "ribbon", label: "Standard-Mini cable", explanation: "22-pin end at the Pi, 15-pin end at the camera.", x: .51, y: .48 },
  { id: "camera", label: "Camera Module 3", explanation: "Camera board beside the Pi with its lens facing upward.", x: .51, y: .22 },
];
const desktopParts: VisualLesson["parts"] = [
  { id: "case", label: "Open case", explanation: "Holds the components on mounting points.", x: .5, y: .5 },
  { id: "motherboard", label: "Motherboard", explanation: "Connects the processor, memory, and power.", x: .5, y: .42 },
  { id: "cpu", label: "Processor", explanation: "Fits into the board socket.", x: .42, y: .38 },
  { id: "ram", label: "Memory", explanation: "Fits into motherboard slots.", x: .6, y: .4 },
  { id: "power", label: "Power supply", explanation: "Mounts in the lower case bay.", x: .4, y: .75 },
];

function fixture(subject: "pi" | "desktop", animate: boolean): VisualLesson {
  const pi = subject === "pi";
  const parts = pi ? piParts : desktopParts;
  const lesson: VisualLesson = {
    version: 1, dimension: 3, layout: "centered", placement,
    title: pi ? "Raspberry Pi 5 camera connection" : "Desktop computer assembly",
    parts,
    connections: pi
      ? [{ from: "board", to: "ribbon", label: "22-pin CAM/DISP" }, { from: "ribbon", to: "camera", label: "15-pin connector" }]
      : [{ from: "case", to: "motherboard", label: "mount" }, { from: "motherboard", to: "cpu", label: "socket" }, { from: "motherboard", to: "ram", label: "slots" }, { from: "case", to: "power", label: "lower bay" }],
    playAssembly: animate,
  };
  const model = pi
    ? raspberryPiCameraTemplate(lesson, "Animate attaching the camera to a Raspberry Pi 5", true)
    : desktopComputerTemplate(lesson, "Animate desktop computer assembly", true);
  if (!model) throw new Error("A graphics preview fixture is missing its 3D model.");
  return { ...lesson, model };
}

function Preview() {
  const [subject, setSubject] = useState<"pi" | "desktop">("pi");
  const [playId, setPlayId] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const lesson = useMemo(() => fixture(subject, playId > 0), [subject, playId]);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const bounds = stage.current?.getBoundingClientRect();
      if (!bounds) return;
      const point = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
      pointerListeners.forEach((listener) => listener(point));
    };
    window.addEventListener("pointermove", onPointer);
    return () => window.removeEventListener("pointermove", onPointer);
  }, []);
  return <main className="graphics-preview">
    <header className="preview-header">
      <div><span className="eyebrow">REN GRAPHICS</span><h1>Interactive model preview</h1><p>This uses the same Three.js renderer as Ren. Move the pointer to orbit, and replay the connection steps.</p></div>
      <div className="preview-controls" aria-label="Preview controls">
        <button type="button" aria-pressed={subject === "pi"} onClick={() => { setSubject("pi"); setPlayId(0); }}>Pi camera</button>
        <button type="button" aria-pressed={subject === "desktop"} onClick={() => { setSubject("desktop"); setPlayId(0); }}>Desktop PC</button>
        <button type="button" className="replay" onClick={() => setPlayId((id) => id + 1)}>Replay assembly</button>
      </div>
    </header>
    <div className="preview-stage" ref={stage} data-testid="graphics-stage">
      <div className="preview-grid" />
      <div className="overlay-canvas" key={`${subject}-${playId}`}><VisualLessonOverlay lesson={lesson} /></div>
    </div>
    <footer>Illustrative teaching geometry. This preview does not capture your screen or call a model provider.</footer>
  </main>;
}

createRoot(document.getElementById("graphics-preview-root")!).render(<Preview />);
