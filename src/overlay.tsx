import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Annotation, Illustration, Point } from "./contracts";
import type { VisualLesson } from "../electron/visual-lesson";
import { VisualLessonOverlay } from "./visual-lesson-overlay";
import "./overlay.css";

const pos = (point: Point) => ({ left: `${point.x * 100}%`, top: `${point.y * 100}%` });

function Overlay() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [visualLesson, setVisualLesson] = useState<VisualLesson | null>(null);
  const [illustration, setIllustration] = useState<Illustration | null>(null);
  useEffect(() => window.ren?.onAnnotations(setAnnotations), []);
  useEffect(() => window.ren?.onVisualLesson(setVisualLesson), []);
  useEffect(() => window.ren?.onIllustration(setIllustration), []);
  return (
    <div className="overlay-canvas">
      <svg className="overlay-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <defs><marker id="arrowhead" markerWidth="12" markerHeight="12" refX="9" refY="4" orient="auto"><path d="M0,0 L0,8 L10,4 z" /></marker></defs>
        {annotations.map((item) => {
          const color = item.color || "#e7653a";
          if (item.type === "arrow") return <g key={item.id} style={{ color }}><line x1={item.from.x * 1000} y1={item.from.y * 1000} x2={item.to.x * 1000} y2={item.to.y * 1000} markerEnd="url(#arrowhead)" /></g>;
          if (item.type === "rectangle") return <rect key={item.id} x={item.at.x * 1000} y={item.at.y * 1000} width={item.width * 1000} height={item.height * 1000} rx="18" style={{ color }} />;
          if (item.type === "path") return <polyline key={item.id} points={item.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")} style={{ color }} />;
          return null;
        })}
      </svg>
      {annotations.map((item) => {
        const at = item.type === "arrow" ? item.to : item.type === "path" ? item.points.at(-1)! : item.at;
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

createRoot(document.getElementById("overlay-root")!).render(<Overlay />);

