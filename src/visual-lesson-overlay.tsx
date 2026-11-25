import type { VisualLesson } from "../electron/visual-lesson";
import { useLayoutEffect, useRef, useState } from "react";
import { placeLessonCard } from "./lesson-placement";

export function VisualLessonOverlay({ lesson }: { lesson: VisualLesson }) {
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [positions, setPositions] = useState<Record<string, { x: number; y: number; right: boolean }>>({});
  useLayoutEffect(() => {
    const layout = () => {
      const next: typeof positions = {};
      for (const part of lesson.parts) {
        const card = cards.current.get(part.id);
        if (!card) continue;
        const anchorX = (lesson.placement.x + lesson.placement.width * part.x) * window.innerWidth;
        const anchorY = (lesson.placement.y + lesson.placement.height * part.y) * window.innerHeight;
        next[part.id] = placeLessonCard(anchorX, anchorY, card.offsetWidth || 175, card.offsetHeight || 80, window.innerWidth, window.innerHeight);
      }
      setPositions(next);
    };
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [lesson]);
  const parts = new Map(lesson.parts.map((part) => [part.id, part]));
  const placement = {
    left: `${lesson.placement.x * 100}%`, top: `${lesson.placement.y * 100}%`,
    width: `${lesson.placement.width * 100}%`, height: `${lesson.placement.height * 100}%`,
  };
  const description = `${lesson.title}. ${lesson.parts.map((part) => `${part.label}: ${part.explanation}`).join(" ")}`;
  const headingInside = lesson.placement.y * window.innerHeight < 110;
  return <section className="visual-lesson" style={placement} role="img" aria-label={description}>
    <div className={`visual-lesson-heading${headingInside ? " is-inside" : ""}`} aria-hidden="true"><span>REN EXPLAINS</span><strong>{lesson.title}</strong>{lesson.assumption && <small>{lesson.assumption}</small>}</div>
    <svg className="visual-lesson-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <defs><marker id="lesson-arrowhead" markerWidth="11" markerHeight="11" refX="9" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" /></marker></defs>
      {lesson.connections.map((connection) => {
        const from = parts.get(connection.from)!;
        const to = parts.get(connection.to)!;
        return <line key={`${connection.from}-${connection.to}`} x1={from.x * 1000} y1={from.y * 1000} x2={to.x * 1000} y2={to.y * 1000} markerEnd="url(#lesson-arrowhead)" />;
      })}
    </svg>
    {lesson.connections.map((connection) => {
      const from = parts.get(connection.from)!;
      const to = parts.get(connection.to)!;
      const x = Math.max(0.1, Math.min(0.9, lesson.placement.x + lesson.placement.width * (from.x + to.x) / 2));
      const y = Math.max(0.05, Math.min(0.95, lesson.placement.y + lesson.placement.height * (from.y + to.y) / 2));
      return <span key={`${connection.from}-${connection.to}`} className="visual-lesson-relation" aria-hidden="true" style={{ left: `${(x - lesson.placement.x) / lesson.placement.width * 100}%`, top: `${(y - lesson.placement.y) / lesson.placement.height * 100}%` }}>{connection.label}</span>;
    })}
    {lesson.parts.map((part, index) => {
      const position = positions[part.id];
      return <div key={part.id} ref={(element) => { if (element) cards.current.set(part.id, element); else cards.current.delete(part.id); }} className={`visual-lesson-part${position?.right ? " is-flipped" : ""}`} aria-hidden="true" style={{ left: `${part.x * 100}%`, top: `${part.y * 100}%`, transform: `translate(${position?.x ?? 12}px, ${position?.y ?? -30}px)`, visibility: position ? "visible" : "hidden", animationDelay: `${index * 55}ms` }}><i /><strong>{part.label}</strong><small>{part.explanation}</small></div>;
    })}
  </section>;
}
