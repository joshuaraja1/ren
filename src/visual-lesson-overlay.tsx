import type { VisualLesson } from "../electron/visual-lesson";
import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import { placeLessonCard } from "./lesson-placement";
import type { Illustration } from "./contracts";
import { imageBox } from "./image-geometry";
import { interactiveSceneFor, jetPartForLabel, type JetPart } from "../electron/interactive-scene";
import type { JetAnchors } from "./jet-scene";

const JetScene = lazy(() => import("./jet-scene").then((module) => ({ default: module.JetScene })));

export function VisualLessonOverlay({ lesson, illustration }: { lesson: VisualLesson; illustration?: Illustration | null }) {
  if (lesson.layout === "centered" && interactiveSceneFor(lesson)) return <InteractiveJetLesson lesson={lesson} />;
  return <StaticVisualLessonOverlay lesson={lesson} illustration={illustration} />;
}

function StaticVisualLessonOverlay({ lesson, illustration }: { lesson: VisualLesson; illustration?: Illustration | null }) {
  const box = illustration ? imageBox(lesson.placement.width * window.innerWidth, lesson.placement.height * window.innerHeight, illustration.width, illustration.height) : null;
  const displayParts = lesson.parts.map((part) => {
    const location = illustration?.registration?.[part.id];
    return location && box ? { ...part, x: box.x + box.width * location.x, y: box.y + box.height * location.y } : part;
  });
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [positions, setPositions] = useState<Record<string, { x: number; y: number; right: boolean }>>({});
  useLayoutEffect(() => {
    if (lesson.layout === "centered" || illustration) return;
    const layout = () => {
      const next: typeof positions = {};
      for (const part of displayParts) {
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
  }, [lesson, illustration]);
  const parts = new Map(displayParts.map((part) => [part.id, part]));
  const placement = {
    left: `${lesson.placement.x * 100}%`, top: `${lesson.placement.y * 100}%`,
    width: `${lesson.placement.width * 100}%`, height: `${lesson.placement.height * 100}%`,
  };
  const description = `${lesson.title}. ${lesson.parts.map((part) => `${part.label}: ${part.explanation}`).join(" ")}`;
  const headingInside = lesson.placement.y * window.innerHeight < 110;
  if (lesson.layout === "centered" || (illustration && box)) return <IllustratedLesson lesson={lesson} illustration={illustration} box={box} />;
  return <section className={`visual-lesson${illustration ? " has-illustration" : ""}${illustration && !illustration.registration ? " is-preview" : ""}`} style={placement} role="img" aria-label={description}>
    {illustration && box && <div className="visual-lesson-illustration"><img src={illustration.image} alt="" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} /><span>{illustration.preview ? "GENERATING · UNVERIFIED" : illustration.registration ? "ILLUSTRATIVE · PARTS LOCATED" : "ILLUSTRATIVE"}</span></div>}
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
    {displayParts.map((part, index) => {
      const position = positions[part.id];
      return <div key={part.id} ref={(element) => { if (element) cards.current.set(part.id, element); else cards.current.delete(part.id); }} className={`visual-lesson-part${position?.right ? " is-flipped" : ""}`} aria-hidden="true" style={{ left: `${part.x * 100}%`, top: `${part.y * 100}%`, transform: `translate(${position?.x ?? 12}px, ${position?.y ?? -30}px)`, visibility: position ? "visible" : "hidden", animationDelay: `${index * 55}ms` }}><i /><strong>{part.label}</strong><small>{part.explanation}</small></div>;
    })}
  </section>;
}

function InteractiveJetLesson({ lesson }: { lesson: VisualLesson }) {
  const [anchors, setAnchors] = useState<JetAnchors>({});
  const [unavailable, setUnavailable] = useState(false);
  const placement = {
    left: `${lesson.placement.x * 100}%`, top: `${lesson.placement.y * 100}%`,
    width: `${lesson.placement.width * 100}%`, height: `${lesson.placement.height * 100}%`,
  };
  const description = `${lesson.title}. Interactive three-dimensional model. Move the cursor to rotate it. ${lesson.parts.map((part) => `${part.label}: ${part.explanation}`).join(" ")}`;
  const cards = lesson.parts.map((part) => {
    const anchor = jetPartForLabel(part.label);
    return anchor ? { part, anchor, side: anchor === "fan" || anchor === "posts" || anchor === "controls" ? "left" as const : "right" as const } : null;
  }).filter((card): card is NonNullable<typeof card> => card !== null);
  const slots: Record<JetPart, number> = { fan: .35, posts: .65, controls: .83, engine: .39, nozzle: .7 };
  const shownAnchors: JetAnchors = unavailable ? { fan: { x: .41, y: .48 }, engine: { x: .6, y: .46 }, nozzle: { x: .73, y: .53 }, posts: { x: .53, y: .67 }, controls: { x: .68, y: .43 } } : anchors;
  return <section className="visual-lesson interactive-jet-lesson centered-stage" style={placement} role="img" aria-label={description}>
    {unavailable ? <svg className="jet-scene jet-fallback" viewBox="0 0 1000 700" aria-hidden="true"><path d="M80 350 270 300 420 285 820 310 920 350 820 390 420 415 270 400Z" /><path d="M360 320 450 75 620 85 575 325 575 375 620 615 450 625 360 380Z" /><ellipse cx="415" cy="350" rx="72" ry="65" /><rect x="550" y="310" width="220" height="80" rx="32" /><path d="M780 320 860 350 780 380" /></svg> : <Suspense fallback={<div className="jet-scene" aria-hidden="true" />}><JetScene onAnchors={setAnchors} onUnavailable={() => setUnavailable(true)} /></Suspense>}
    <div className="interactive-jet-heading" aria-hidden="true"><span>REN EXPLAINS</span><strong>{lesson.title}</strong><small>{unavailable ? "2D schematic · 3D view unavailable" : "Move your cursor to rotate the model"}</small></div>
    <svg className="visual-lesson-lines interactive-jet-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {cards.map(({ part, anchor, side }) => shownAnchors[anchor] && <g key={part.id}><line x1={side === "left" ? 180 : 820} y1={slots[anchor] * 1000} x2={shownAnchors[anchor]!.x * 1000} y2={shownAnchors[anchor]!.y * 1000} /><circle cx={shownAnchors[anchor]!.x * 1000} cy={shownAnchors[anchor]!.y * 1000} r="4" /></g>)}
    </svg>
    {cards.map(({ part, anchor, side }) => <div key={part.id} className={`visual-lesson-part illustrated-lesson-part ${side}${shownAnchors[anchor] ? "" : " is-hidden-part"}`} style={{ left: side === "left" ? "0%" : "82%", top: `${slots[anchor] * 100}%` }} aria-hidden="true"><strong>{part.label}</strong><small>{part.explanation}</small>{!unavailable && !shownAnchors[anchor] && <em>Rotate to reveal</em>}</div>)}
    <div className="interactive-jet-note" aria-hidden="true">Interactive teaching model · proportions simplified</div>
  </section>;
}

function IllustratedLesson({ lesson, illustration, box }: { lesson: VisualLesson; illustration?: Illustration | null; box: ReturnType<typeof imageBox> | null }) {
  const placement = {
    left: `${lesson.placement.x * 100}%`, top: `${lesson.placement.y * 100}%`,
    width: `${lesson.placement.width * 100}%`, height: `${lesson.placement.height * 100}%`,
  };
  const description = `${lesson.title}. ${lesson.parts.map((part) => `${part.label}: ${part.explanation}`).join(" ")}`;
  const headingInside = lesson.placement.y * window.innerHeight < 110;
  const located = illustration && !illustration.preview ? illustration.registration ?? {} : {};
  const mapped = lesson.parts.map((part, index) => {
    const anchor = Object.hasOwn(located, part.id) && box ? { x: box.x + box.width * located[part.id].x, y: box.y + box.height * located[part.id].y } : null;
    return { part, index, anchor, side: "left" as "left" | "right", slot: 0 };
  });
  const maxSide = Math.ceil(mapped.length / 2);
  let leftCount = 0;
  let rightCount = 0;
  for (const item of mapped) {
    const wantsRight = item.anchor ? item.anchor.x >= .5 : item.index % 2 === 1;
    item.side = (wantsRight && rightCount < maxSide) || leftCount >= maxSide ? "right" : "left";
    if (item.side === "left") leftCount += 1;
    else rightCount += 1;
  }
  for (const side of ["left", "right"] as const) {
    const group = mapped.filter((item) => item.side === side).sort((a, b) => (a.anchor?.y ?? a.index / mapped.length) - (b.anchor?.y ?? b.index / mapped.length));
    group.forEach((item, index) => { item.slot = .18 + .68 * (index + .5) / group.length; });
  }
  const verified = mapped.filter((item) => item.anchor);
  return <section className={`visual-lesson illustrated-lesson${lesson.layout === "centered" ? " centered-stage" : ""}${illustration ? " has-illustration" : ""}${illustration?.preview ? " is-preview" : ""}`} style={placement} role="img" aria-label={description}>
    {illustration && box ? <div className="visual-lesson-illustration"><img src={illustration.image} alt="" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} /><span>{illustration.preview ? "GENERATING · UNVERIFIED" : verified.length ? "ILLUSTRATIVE · PARTS LOCATED" : "ILLUSTRATIVE · PARTS GUIDE"}</span></div> : <div className="visual-lesson-placeholder"><strong>Creating 3D illustration</strong><small>Ren is preparing the visual and its part labels.</small></div>}
    <div className={`visual-lesson-heading${headingInside ? " is-inside" : ""}`} aria-hidden="true"><span>REN EXPLAINS</span><strong>{lesson.title}</strong>{lesson.assumption && <small>{lesson.assumption}</small>}</div>
    <>
      <svg className="visual-lesson-lines illustrated-lesson-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {verified.map(({ part, side, slot, anchor }) => <g key={part.id}><line x1={side === "left" ? 170 : 830} y1={slot * 1000} x2={anchor!.x * 1000} y2={anchor!.y * 1000} /><circle cx={anchor!.x * 1000} cy={anchor!.y * 1000} r="4" /></g>)}
      </svg>
      {mapped.map(({ part, side, slot, anchor }, index) => <div key={part.id} className={`visual-lesson-part illustrated-lesson-part ${side}${anchor ? " is-located" : " is-unlocated"}`} aria-hidden="true" style={{ left: side === "left" ? "0%" : "83%", top: `${slot * 100}%`, animationDelay: `${index * 55}ms` }}><strong>{part.label}</strong><small>{part.explanation}</small></div>)}
    </>
  </section>;
}
