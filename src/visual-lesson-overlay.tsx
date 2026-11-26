import type { VisualLesson } from "../electron/visual-lesson";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { placeLessonCard } from "./lesson-placement";
import type { Illustration } from "./contracts";
import { imageBox } from "./image-geometry";
import { interactiveSceneFor, jetPartForLabel, type JetPart } from "../electron/interactive-scene";
import type { JetAnchors } from "./jet-scene";
import { LessonVectorFallback, SceneFallback, lessonVectorPositions, sceneFallbackProjection } from "./scene-fallback";

const JetScene = lazy(() => import("./jet-scene").then((module) => ({ default: module.JetScene })));
const GenericScene = lazy(() => import("./generic-scene").then((module) => ({ default: module.GenericScene })));

export function calloutPageSize(stageHeight: number): 2 | 4 | 6 {
  if (stageHeight < 450) return 2;
  if (stageHeight < 600) return 4;
  return 6;
}

/** Place labels beside the nearest half of the model, then preserve that arrangement during orbit. */
export function modelCalloutLayout(parts: Pick<VisualLesson["parts"][number], "id">[], anchors: Record<string, { x: number; y: number }>): Record<string, { side: "left" | "right"; slot: number }> {
  const layout: Record<string, { side: "left" | "right"; slot: number }> = {};
  const byX = [...parts].sort((first, second) => anchors[first.id].x - anchors[second.id].x);
  const leftIds = new Set(byX.slice(0, Math.ceil(parts.length / 2)).map((part) => part.id));
  for (const side of ["left", "right"] as const) {
    const group = parts.filter((part) => (leftIds.has(part.id) ? "left" : "right") === side)
      .sort((first, second) => anchors[first.id].y - anchors[second.id].y);
    group.forEach((part, rank) => { layout[part.id] = { side, slot: .17 + .66 * (rank + .5) / group.length }; });
  }
  return layout;
}

function usePartPaging(lesson: VisualLesson, enabled = true) {
  const pageSizeForViewport = () => enabled ? calloutPageSize(window.innerHeight * lesson.placement.height) : Math.max(1, lesson.parts.length);
  const [pageSize, setPageSize] = useState(pageSizeForViewport);
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(lesson.parts.length / pageSize);
  useEffect(() => {
    const resize = () => setPageSize(pageSizeForViewport());
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [lesson.placement.height, lesson.parts.length, enabled]);
  useEffect(() => {
    setPage(0);
    if (!enabled || pageCount <= 1) return;
    let corner: -1 | 0 | 1 = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const clear = () => { if (timer) clearInterval(timer); timer = undefined; corner = 0; };
    const unsubscribe = window.ren?.onOrbitPointer((point) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      const next: -1 | 0 | 1 = point.y < .12 && point.x < .08 ? -1 : point.y < .12 && point.x > .92 ? 1 : 0;
      if (next === corner) return;
      clear();
      if (!next) return;
      corner = next;
      timer = setInterval(() => setPage((current) => Math.max(0, Math.min(pageCount - 1, current + next))), 700);
    });
    return () => { clear(); unsubscribe?.(); };
  }, [lesson, pageCount, enabled]);
  const first = page * pageSize;
  const visibleParts = lesson.parts.slice(first, first + pageSize);
  return { page, pageSize, pageCount, visibleParts };
}

export function VisualLessonOverlay({ lesson, illustration }: { lesson: VisualLesson; illustration?: Illustration | null }) {
  if (lesson.pendingIllustration && !illustration) return null;
  if (lesson.layout === "centered" && lesson.model) return <InteractiveGenericLesson lesson={lesson} />;
  if (lesson.layout === "centered" && interactiveSceneFor(lesson) === "f35b-hover") return <InteractiveJetLesson lesson={lesson} />;
  if (lesson.layout === "centered" && interactiveSceneFor(lesson) === "conceptual-3d") return <InteractiveGenericLesson lesson={lesson} />;
  return <StaticVisualLessonOverlay lesson={lesson} illustration={illustration} />;
}

function InteractiveGenericLesson({ lesson }: { lesson: VisualLesson }) {
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number }>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [assemblyStep, setAssemblyStep] = useState(0);
  const [modelLayout, setModelLayout] = useState<Record<string, { side: "left" | "right"; slot: number }> | null>(null);
  useLayoutEffect(() => { setAssemblyStep(0); setUnavailable(false); setAnchors({}); setModelLayout(null); }, [lesson]);
  const { page, pageSize, pageCount, visibleParts } = usePartPaging(lesson, !lesson.model);
  useLayoutEffect(() => {
    if (lesson.model && !modelLayout && lesson.parts.every((part) => anchors[part.id])) setModelLayout(modelCalloutLayout(lesson.parts, anchors));
  }, [lesson, anchors, modelLayout]);
  const placement = { left: `${lesson.placement.x * 100}%`, top: `${lesson.placement.y * 100}%`, width: `${lesson.placement.width * 100}%`, height: `${lesson.placement.height * 100}%` };
  const rows = Math.ceil(visibleParts.length / 2);
  const cards = visibleParts.map((part, index) => ({ part, side: modelLayout?.[part.id]?.side ?? (index % 2 ? "right" as const : "left" as const), slot: modelLayout?.[part.id]?.slot ?? .17 + .66 * (Math.floor(index / 2) + .5) / rows }));
  const kind = unavailable ? "2D part guide; 3D graphics unavailable" : lesson.model ? "Illustrative 3D model" : "Conceptual 3D schematic";
  const assembly = lesson.playAssembly ? lesson.model?.assembly : undefined;
  const currentAssembly = assembly && assemblyStep > 0 && assemblyStep <= assembly.length ? assembly[assemblyStep - 1] : null;
  const shownAnchors = unavailable ? lesson.model ? sceneFallbackProjection(lesson.model).anchors : lessonVectorPositions(lesson) : anchors;
  const ready = unavailable || !lesson.model || Boolean(modelLayout && lesson.parts.every((part) => shownAnchors[part.id]));
  return <section className={`visual-lesson interactive-jet-lesson centered-stage${lesson.model ? " interactive-model-lesson" : ""}`} style={{ ...placement, visibility: ready ? "visible" : "hidden" }} role="img" aria-label={`${lesson.title}. ${kind}. Move your cursor to rotate and inspect all parts. ${lesson.parts.map((part) => `${part.label}: ${part.explanation}`).join(" ")}`}>
    {unavailable ? lesson.model ? <SceneFallback spec={lesson.model} connections={lesson.connections} /> : <div className="jet-scene"><LessonVectorFallback lesson={lesson} /></div> : <Suspense fallback={<div className="jet-scene" aria-hidden="true" />}><GenericScene lesson={lesson} onAnchors={setAnchors} onUnavailable={() => setUnavailable(true)} onAssemblyStep={setAssemblyStep} /></Suspense>}
    <div className="interactive-jet-heading" aria-hidden="true"><span>REN EXPLAINS</span><strong>{lesson.title}</strong><small>{unavailable ? "2D part guide · 3D view unavailable" : "Move your cursor to rotate and inspect parts"}</small></div>
    <svg className="visual-lesson-lines interactive-jet-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {cards.map(({ part, side, slot }) => shownAnchors[part.id] && <g key={part.id}><line x1={side === "left" ? 180 : 820} y1={slot * 1000} x2={(.17 + .66 * shownAnchors[part.id].x) * 1000} y2={(.13 + .76 * shownAnchors[part.id].y) * 1000} /><circle cx={(.17 + .66 * shownAnchors[part.id].x) * 1000} cy={(.13 + .76 * shownAnchors[part.id].y) * 1000} r="4" /></g>)}
    </svg>
    {cards.map(({ part, side, slot }) => <div key={part.id} className={`visual-lesson-part illustrated-lesson-part ${side}`} style={{ left: side === "left" ? "0%" : "82%", top: `${slot * 100}%` }} aria-hidden="true"><strong>{part.label}</strong>{!lesson.model && <small>{part.explanation}</small>}</div>)}
    {assembly && <div className="interactive-assembly-step" aria-live="polite">{unavailable ? "Assembly animation requires 3D graphics" : currentAssembly ? <><strong>Step {assemblyStep} of {assembly.length}</strong><span>{currentAssembly.instruction}</span></> : assemblyStep > assembly.length ? <><strong>Assembly complete</strong><span>Rotate to inspect the connected parts.</span></> : <><strong>Preparing assembly</strong><span>Parts will move into place in sequence.</span></>}</div>}
    <div className="interactive-jet-note" aria-hidden="true">{lesson.model ? "Illustrative 3D model · approximate geometry" : "Conceptual 3D schematic · relationships"}{pageCount > 1 ? ` · Parts ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, lesson.parts.length)} of ${lesson.parts.length}; hold cursor in a top corner for more` : ""}</div>
  </section>;
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
  const { page, pageSize, pageCount, visibleParts } = usePartPaging(lesson, lesson.layout === "centered");
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [illustration?.image]);
  const imageReady = Boolean(illustration && box && !imageFailed);
  const vectorReady = lesson.layout === "centered" && !imageReady;
  const vectorAnchors = vectorReady ? lessonVectorPositions(lesson) : {};
  const placement = {
    left: `${lesson.placement.x * 100}%`, top: `${lesson.placement.y * 100}%`,
    width: `${lesson.placement.width * 100}%`, height: `${lesson.placement.height * 100}%`,
  };
  const description = `${lesson.title}. ${lesson.parts.map((part) => `${part.label}: ${part.explanation}`).join(" ")}`;
  const headingInside = lesson.placement.y * window.innerHeight < 110;
  const located = illustration && !illustration.preview ? illustration.registration ?? {} : {};
  const mapped = visibleParts.map((part, index) => {
    const anchor = imageReady && Object.hasOwn(located, part.id) && box ? { x: box.x + box.width * located[part.id].x, y: box.y + box.height * located[part.id].y } : vectorReady ? vectorAnchors[part.id] : null;
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
    {imageReady && illustration && box ? <div className="visual-lesson-illustration"><img src={illustration.image} alt="" onError={() => setImageFailed(true)} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} /><span>{illustration.preview ? "GENERATING · UNVERIFIED" : verified.length ? "ILLUSTRATIVE · PARTS LOCATED" : "ILLUSTRATIVE · PARTS GUIDE"}</span></div> : vectorReady ? <LessonVectorFallback lesson={lesson} /> : <div className="visual-lesson-placeholder"><strong>Creating 3D illustration</strong><small>Ren is preparing the visual and its part labels.</small></div>}
    <div className={`visual-lesson-heading${headingInside ? " is-inside" : ""}`} aria-hidden="true"><span>REN EXPLAINS</span><strong>{lesson.title}</strong>{lesson.assumption && <small>{lesson.assumption}</small>}</div>
    <>
      <svg className="visual-lesson-lines illustrated-lesson-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {verified.map(({ part, side, slot, anchor }) => <g key={part.id}><line x1={side === "left" ? 170 : 830} y1={slot * 1000} x2={anchor!.x * 1000} y2={anchor!.y * 1000} /><circle cx={anchor!.x * 1000} cy={anchor!.y * 1000} r="4" /></g>)}
      </svg>
      {mapped.map(({ part, side, slot, anchor }) => <div key={part.id} className={`visual-lesson-part illustrated-lesson-part ${side}${anchor ? " is-located" : " is-unlocated"}`} aria-hidden="true" style={{ left: side === "left" ? "0%" : "83%", top: `${slot * 100}%` }}><strong>{part.label}</strong><small>{part.explanation}</small></div>)}
    </>
    {(pageCount > 1 || (vectorReady && lesson.dimension === 3)) && <div className="interactive-jet-note" aria-hidden="true">{vectorReady && lesson.dimension === 3 ? "Building rotatable 3D model · " : ""}{pageCount > 1 ? `Parts ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, lesson.parts.length)} of ${lesson.parts.length} · hold cursor in a top corner for more` : "Part guide preview"}</div>}
  </section>;
}
