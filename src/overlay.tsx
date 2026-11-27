import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Annotation, Illustration, Point } from "./contracts";
import type { VisualLesson } from "../electron/visual-lesson";
import { VisualLessonOverlay } from "./visual-lesson-overlay";
import "./overlay.css";

const pos = (point: Point) => ({ left: `${point.x * 100}%`, top: `${point.y * 100}%` });

export function Overlay() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [visualLesson, setVisualLesson] = useState<VisualLesson | null>(null);
  const [illustration, setIllustration] = useState<Illustration | null>(null);
  useEffect(() => {
    const bridge = window.ren;
    if (!bridge) return;
    const offAnnotations = bridge.onAnnotations(setAnnotations);
    const offLesson = bridge.onVisualLesson((next) => {
      // Clear the preceding lesson's image in the same React update. A new
      // pending lesson must never briefly reveal the previous subject's image.
      setIllustration(null);
      setVisualLesson(next);
    });
    const offIllustration = bridge.onIllustration(setIllustration);
    // The main process can finish a lesson before this renderer subscribes.
    // Request the current state only after every listener is installed.
    bridge.overlayReady();
    return () => { offAnnotations(); offLesson(); offIllustration(); };
  }, []);
  return (
    <div className="overlay-canvas">
      <svg className="overlay-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <defs><marker id="arrowhead" markerWidth="12" markerHeight="12" refX="9" refY="4" orient="auto"><path d="M0,0 L0,8 L10,4 z" /></marker></defs>
        {annotations.map((item, index) => {
          const color = item.color || "#e7653a";
          const style = { color, animationDelay: `${index * 100}ms` };
          if (item.type === "arrow") return <g key={item.id} style={{ color }}><line pathLength={1} style={style} x1={item.from.x * 1000} y1={item.from.y * 1000} x2={item.to.x * 1000} y2={item.to.y * 1000} markerEnd="url(#arrowhead)" /></g>;
          if (item.type === "rectangle") return <rect key={item.id} pathLength={1} x={item.at.x * 1000} y={item.at.y * 1000} width={item.width * 1000} height={item.height * 1000} rx="18" style={style} />;
          if (item.type === "ellipse") return <ellipse key={item.id} pathLength={1} cx={item.at.x * 1000} cy={item.at.y * 1000} rx={item.radiusX * 1000} ry={item.radiusY * 1000} style={style} />;
          if (item.type === "polygon") return <polygon key={item.id} pathLength={1} points={item.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")} style={style} />;
          if (item.type === "path") return <polyline key={item.id} className={item.id === "circle-focus" || item.id === "user-sketch" ? "live-ink" : undefined} pathLength={1} points={item.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")} style={style} />;
          return null;
        })}
      </svg>
      {annotations.map((item) => {
        const at = item.type === "arrow" ? item.to : item.type === "path" || item.type === "polygon" ? item.points.at(-1)! : item.at;
        const style = { ...pos(at), color: item.color || "#e7653a" };
        if (item.type === "diagram") return <div key={item.id} className="diagram-card" style={style}><strong>{item.title}</strong>{item.lines.map((line) => <span key={line}>{line}</span>)}</div>;
        if (item.type === "point") return <div key={item.id} className="point-mark" style={style}>{item.label && <span>{item.label}</span>}</div>;
        if (item.type === "text") return <div key={item.id} className="text-mark" style={style}>{item.text}</div>;
        const label = "label" in item ? item.label : undefined;
        return label ? <div key={`${item.id}-label`} className="text-mark" style={style}>{label}</div> : null;
      })}
      {visualLesson && <VisualLessonOverlay lesson={visualLesson} illustration={illustration} />}
    </div>
  );
}

const overlayRoot = document.getElementById("overlay-root");
if (overlayRoot) createRoot(overlayRoot).render(<Overlay />);

