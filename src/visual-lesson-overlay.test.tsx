import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VisualLessonOverlay } from "./visual-lesson-overlay";
import { centerRequestedLesson } from "../electron/visual-presentation";
import type { VisualLesson } from "../electron/visual-lesson";
import type { Point, RenBridge } from "./contracts";
import { vi } from "vitest";
import { calloutPageSize, modelCalloutLayout } from "./visual-lesson-overlay";

it("sizes callout pages for short, medium, and tall diagram areas", () => {
  expect(calloutPageSize(400)).toBe(2);
  expect(calloutPageSize(550)).toBe(4);
  expect(calloutPageSize(700)).toBe(6);
});

it("places general 3D callouts on their nearest side and in vertical part order", () => {
  const parts = ["frame", "screen", "battery", "board", "camera", "port"].map((id) => ({ id }));
  const anchors = { frame: { x: .2, y: .5 }, screen: { x: .7, y: .7 }, battery: { x: .3, y: .8 }, board: { x: .8, y: .2 }, camera: { x: .1, y: .1 }, port: { x: .9, y: .9 } };
  const layout = modelCalloutLayout(parts, anchors);
  expect(layout.camera.side).toBe("left");
  expect(layout.board.side).toBe("right");
  expect(layout.camera.slot).toBeLessThan(layout.frame.slot);
  expect(layout.frame.slot).toBeLessThan(layout.battery.slot);
  expect(layout.board.slot).toBeLessThan(layout.screen.slot);
  expect(layout.screen.slot).toBeLessThan(layout.port.slot);
});

it("shows a projected machine and connected callouts when WebGL is unavailable", async () => {
  const lesson: VisualLesson = {
    version: 1, layout: "centered", title: "Pump", placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [{ id: "motor", label: "Motor", explanation: "Drives the pump.", x: .3, y: .5 }, { id: "impeller", label: "Impeller", explanation: "Moves water.", x: .7, y: .5 }],
    connections: [{ from: "motor", to: "impeller", label: "drives" }],
    referenceImage: "data:image/png;base64,dGVzdA==",
    model: { version: 1, subject: "Pump", fidelity: "conceptual", primitives: [
      { partId: "motor", kind: "cylinder", position: [-1, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0], color: "#4689bb" },
      { partId: "impeller", kind: "sphere", position: [1, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0], color: "#d59d4e" },
    ], anchors: [{ partId: "motor", position: [-1, 0, 0] }, { partId: "impeller", position: [1, 0, 0] }],
    assembly: [{ partId: "impeller", from: [0, 0, 2], instruction: "Seat the impeller." }] },
  };
  const { container, rerender } = render(<VisualLessonOverlay lesson={lesson} />);
  await waitFor(() => expect(container.querySelector(".scene-fallback")).toBeInTheDocument());
  expect(container.querySelectorAll(".scene-fallback > g")).toHaveLength(2);
  expect(container.querySelector(".scene-fallback > line")).toBeInTheDocument();
  expect(container.querySelector(".interactive-source-reference img")).toHaveAttribute("src", lesson.referenceImage);
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image: "data:image/png;base64,bWF0Y2hlZA==", preview: false, width: 500, height: 500 }} />);
  expect(container.querySelector(".interactive-source-reference img")).toHaveAttribute("src", "data:image/png;base64,bWF0Y2hlZA==");
  expect(container).toHaveTextContent("Reference-guided illustration");
  expect(container.querySelectorAll(".interactive-jet-lines line")).toHaveLength(2);
  expect(container).toHaveTextContent("3D view unavailable");
  expect(container.querySelector(".interactive-assembly-step")).not.toBeInTheDocument();
});

it("shows a connected vector graph when conceptual 3D cannot start", async () => {
  const lesson: VisualLesson = {
    version: 1, layout: "centered", scene: "conceptual-3d", title: "Cycle", placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [{ id: "a", label: "Input", explanation: "Starts it.", x: .3, y: .5 }, { id: "b", label: "Output", explanation: "Finishes it.", x: .7, y: .5 }],
    connections: [{ from: "a", to: "b", label: "flows" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} />);
  await waitFor(() => expect(container.querySelector(".visual-lesson-vector-fallback")).toBeInTheDocument());
  expect(container.querySelector(".visual-lesson-vector-fallback line")).toBeInTheDocument();
  expect(container.querySelectorAll(".interactive-jet-lines line")).toHaveLength(2);
});

it("shows a 2D vector diagram immediately and after an image fails", () => {
  const lesson: VisualLesson = {
    version: 1, dimension: 2, layout: "centered", title: "Water flow", placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [{ id: "tap", label: "Tap", explanation: "Controls flow.", x: .3, y: .5 }, { id: "sink", label: "Sink", explanation: "Collects water.", x: .7, y: .5 }],
    connections: [{ from: "tap", to: "sink", label: "flows to" }],
  };
  const { container, rerender } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container.querySelector(".visual-lesson-vector-fallback line")).toBeInTheDocument();
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image: "data:image/png;base64,dGVzdA==", preview: false, width: 500, height: 500 }} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toBeInTheDocument();
  fireEvent.error(container.querySelector(".visual-lesson-illustration img")!);
  expect(container.querySelector(".visual-lesson-vector-fallback line")).toBeInTheDocument();
});

it("reveals an automatic 2D illustration with its labels and pointers in one render", () => {
  const lesson: VisualLesson = {
    version: 1, dimension: 2, layout: "centered", pendingIllustration: true, title: "Bicycle power path",
    placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [{ id: "chainring", label: "Chainring", explanation: "Pulls the chain.", x: .3, y: .5 }, { id: "wheel", label: "Wheel", explanation: "Moves the bicycle.", x: .7, y: .5 }],
    connections: [{ from: "chainring", to: "wheel", label: "drives" }],
  };
  const { container, rerender } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image: "data:image/png;base64,dGVzdA==", preview: false, width: 1024, height: 1024, registration: { chainring: { x: .3, y: .5 }, wheel: { x: .7, y: .5 } } }} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toBeInTheDocument();
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
  expect(container.querySelectorAll(".illustrated-lesson-lines line")).toHaveLength(2);
  rerender(<VisualLessonOverlay lesson={{ ...lesson, pendingIllustration: false }} />);
  expect(container.querySelector(".visual-lesson-vector-fallback line")).toBeInTheDocument();
});

it("shows a labeled vector preview while a subject-specific 3D model is planned", () => {
  const lesson: VisualLesson = {
    version: 1, dimension: 3, layout: "centered", title: "Heart valves", placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [{ id: "atrium", label: "Atrium", explanation: "Receives blood.", x: .3, y: .5 }, { id: "valve", label: "Valve", explanation: "Controls flow.", x: .7, y: .5 }],
    connections: [{ from: "atrium", to: "valve", label: "feeds" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container.querySelector(".visual-lesson-vector-fallback line")).toBeInTheDocument();
  expect(container).toHaveTextContent("Building rotatable 3D model");
  expect(container).toHaveTextContent("Atrium");
});

it("shows every generated-model label together without sequential paging", () => {
  const listeners = new Set<(point: Point) => void>();
  const previous = window.ren;
  window.ren = { onOrbitPointer(listener: (point: Point) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } } as unknown as RenBridge;
  const parts = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, label: `Part ${index + 1}`, explanation: `Explains mechanism ${index + 1}.`, x: .5, y: .5 }));
  const lesson: VisualLesson = {
    version: 1, layout: "centered", title: "Twelve part machine", placement: { x: .08, y: .1, width: .84, height: .8 },
    parts, connections: parts.slice(1).map((_, index) => ({ from: parts[index].id, to: parts[index + 1].id, label: "drives" })),
    model: {
      version: 1, subject: "Twelve part machine", fidelity: "conceptual",
      primitives: parts.map((part, index) => ({ partId: part.id, kind: "box", position: [index / 2 - 3, 0, 0], scale: [.4, .4, .4], rotation: [0, 0, 0], color: "#6699aa" })),
      anchors: parts.map((part, index) => ({ partId: part.id, position: [index / 2 - 3, 0, 0] })),
    },
  };
  const { container, unmount } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(12);
  expect(container).toHaveTextContent("Illustrative 3D model · approximate geometry");
  expect(container).toHaveTextContent("Part 1");
  vi.useFakeTimers();
  act(() => { for (const listener of listeners) listener({ x: .9, y: .5 }); });
  expect(container).toHaveTextContent("Part 12");
  act(() => { for (const listener of listeners) listener({ x: .96, y: .04 }); vi.advanceTimersByTime(701); });
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(12);
  expect(container).toHaveTextContent("Part 12");
  expect(container.querySelectorAll(".illustrated-lesson-part.left")).toHaveLength(6);
  expect(container.querySelectorAll(".illustrated-lesson-part.right")).toHaveLength(6);
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  act(() => window.dispatchEvent(new Event("resize")));
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(12);
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
  act(() => window.dispatchEvent(new Event("resize")));
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(12);
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  act(() => window.dispatchEvent(new Event("resize")));
  unmount();
  window.ren = previous;
  vi.useRealTimers();
});

it("draws a connected lesson directly in a normalized screen rectangle", () => {
  const lesson = {
    version: 1 as const,
    title: "Lift",
    placement: { x: 0.2, y: 0.3, width: 0.6, height: 0.5 },
    parts: [
      { id: "wing", label: "Wing", explanation: "Deflects air downward.", x: 0.2, y: 0.6 },
      { id: "air", label: "Airflow", explanation: "Moves around the wing.", x: 0.8, y: 0.3 },
    ],
    connections: [{ from: "air", to: "wing", label: "flows around" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(screen.getByRole("img", { name: /wing: deflects air downward/i })).toHaveStyle({ left: "20%", top: "30%", width: "60%", height: "50%" });
  expect(container.querySelectorAll(".visual-lesson-part")).toHaveLength(2);
  expect(container.querySelector(".visual-lesson-lines line")).toHaveAttribute("marker-end", "url(#lesson-arrowhead)");
});

it("keeps headings and callouts inside top and right screen edges", () => {
  const lesson = {
    version: 1 as const, title: "Edge", placement: { x: 0.75, y: 0, width: 0.25, height: 0.3 },
    parts: [
      { id: "a", label: "A", explanation: "First.", x: 0.8, y: 0 },
      { id: "b", label: "B", explanation: "Second.", x: 0.9, y: 1 },
    ], connections: [{ from: "a", to: "b", label: "leads to" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container.querySelector(".visual-lesson-heading")).toHaveClass("is-inside");
  expect(container.querySelectorAll(".visual-lesson-part.is-flipped")).toHaveLength(2);
  expect((container.querySelector(".visual-lesson-part") as HTMLElement).style.transform).toMatch(/^translate\(-\d+px, \d+px\)$/);
});

it("composes a clearly marked image preview into the same overlay", () => {
  const lesson = {
    version: 1 as const, title: "Wing", placement: { x: .2, y: .2, width: .5, height: .5 },
    parts: [{ id: "a", label: "Air", explanation: "Flows past.", x: .2, y: .2 }, { id: "b", label: "Wing", explanation: "Deflects air.", x: .8, y: .8 }],
    connections: [{ from: "a", to: "b", label: "passes" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} illustration={{ image: "data:image/png;base64,dGVzdA==", preview: true, width: 1024, height: 1024 }} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toHaveAttribute("src", "data:image/png;base64,dGVzdA==");
  expect(container.querySelector(".visual-lesson")).toHaveClass("has-illustration", "is-preview");
  expect(container).toHaveTextContent("GENERATING · UNVERIFIED");
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
});

it("registers connected callouts to verified image parts", () => {
  const lesson = {
    version: 1 as const, title: "Wing", placement: { x: .2, y: .2, width: .5, height: .5 },
    parts: [{ id: "a", label: "Air", explanation: "Flows past.", x: .2, y: .2 }, { id: "b", label: "Wing", explanation: "Deflects air.", x: .8, y: .8 }],
    connections: [{ from: "a", to: "b", label: "passes" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} illustration={{ image: "data:image/png;base64,dGVzdA==", preview: false, width: 1024, height: 1024, registration: { a: { x: .7, y: .2 }, b: { x: .3, y: .8 } } }} />);
  expect(container.querySelector(".visual-lesson")).not.toHaveClass("is-preview");
  expect(container).toHaveTextContent("ILLUSTRATIVE · PARTS LOCATED");
  const first = container.querySelector(".visual-lesson-part") as HTMLElement;
  expect(first.style.left).not.toBe("20%");
  expect(container.querySelectorAll(".illustrated-lesson-lines line")).toHaveLength(2);
  expect(container.querySelectorAll(".illustrated-lesson-lines circle")).toHaveLength(2);
  expect(container).toHaveTextContent("Flows past.");
  expect(container).toHaveTextContent("Deflects air.");
});

it("keeps the image and part explanations together when only one anchor is verified", () => {
  const lesson = {
    version: 1 as const, title: "Phone", placement: { x: .2, y: .2, width: .5, height: .5 },
    parts: [{ id: "display", label: "Display", explanation: "Shows messages.", x: .2, y: .2 }, { id: "keys", label: "Keys", explanation: "Dial numbers.", x: .8, y: .8 }],
    connections: [{ from: "display", to: "keys", label: "above" }],
  };
  const illustration = { image: "data:image/png;base64,dGVzdA==", preview: false, width: 1024, height: 1024, registration: { display: { x: .45, y: .3 } } };
  const { container, rerender } = render(<VisualLessonOverlay lesson={lesson} illustration={illustration} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toBeInTheDocument();
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
  expect(container.querySelectorAll(".illustrated-lesson-lines line")).toHaveLength(1);
  expect(container).toHaveTextContent("Shows messages.");
  expect(container).toHaveTextContent("Dial numbers.");
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ ...illustration, registration: undefined }} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toBeInTheDocument();
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
  expect(container).toHaveTextContent("PARTS GUIDE");
});

it("keeps every part accessible around a centered image through preview and final render", () => {
  const listeners = new Set<(point: Point) => void>();
  const previous = window.ren;
  window.ren = { onOrbitPointer(listener: (point: Point) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } } as unknown as RenBridge;
  const names = ["Engine", "Lift fan", "Rear nozzle", "Roll posts", "Flight controls", "Air inlet", "Fan doors", "Exhaust"];
  const source: VisualLesson = {
    version: 1, title: "How hover works", placement: { x: .75, y: .5, width: .22, height: .3 },
    parts: names.map((label, index) => ({ id: `part${index}`, label, explanation: `${label} contributes to a controlled vertical force.`, x: .5, y: .5 })),
    connections: names.slice(1).map((_, index) => ({ from: `part${index}`, to: `part${index + 1}`, label: "supports" })),
  };
  const lesson = centerRequestedLesson(source, 3456, 2234);
  const image = "data:image/png;base64,dGVzdA==";
  const { container, rerender, unmount } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container.querySelector(".visual-lesson")).toHaveClass("centered-stage");
  expect(container.querySelector(".visual-lesson-vector-fallback")).toBeInTheDocument();
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
  expect(container).toHaveTextContent("Parts 1–2 of 8");
  const assertSpacing = () => {
    for (const side of ["left", "right"]) {
      const cards = Array.from(container.querySelectorAll<HTMLElement>(`.illustrated-lesson-part.${side}`));
      expect(cards.length).toBeGreaterThanOrEqual(1);
      expect(cards.length).toBeLessThanOrEqual(3);
      const slots = cards.map((card) => Number.parseFloat(card.style.top));
      expect(slots.every((slot, index) => index === 0 || slot - slots[index - 1] >= 20)).toBe(true);
    }
  };
  assertSpacing();
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image, preview: true, width: 1024, height: 1024 }} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toHaveAttribute("src", image);
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
  assertSpacing();
  const registration = Object.fromEntries(names.map((_, index) => [`part${index}`, { x: index % 2 ? .7 : .3, y: .15 + index * .1 }]));
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image, preview: false, width: 1024, height: 1024, registration }} />);
  expect(container.querySelectorAll(".illustrated-lesson-lines line")).toHaveLength(2);
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(2);
  expect(container.querySelector(".visual-lesson-illustration img")).toHaveAttribute("src", image);
  vi.useFakeTimers();
  act(() => { for (const listener of listeners) listener({ x: .7, y: .5 }); vi.advanceTimersByTime(1400); });
  expect(container).toHaveTextContent("Parts 1–2 of 8");
  const seen = new Set<string>();
  for (let page = 0; page < 4; page++) {
    if (page) act(() => { for (const listener of listeners) listener({ x: .96, y: .04 }); vi.advanceTimersByTime(701); });
    for (const part of lesson.parts.slice(page * 2, (page + 1) * 2)) {
      expect(container).toHaveTextContent(part.label);
      seen.add(part.id);
    }
    if (page < 3) act(() => { for (const listener of listeners) listener({ x: .5, y: .5 }); });
  }
  expect(seen.size).toBe(8);
  assertSpacing();
  unmount();
  window.ren = previous;
  vi.useRealTimers();
});

it("switches between interactive aircraft and ordinary lessons without losing hooks or labels", () => {
  const aircraft: VisualLesson = {
    version: 1, layout: "centered", scene: "f35b-hover", title: "F-35B hover", placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [
      { id: "fan", label: "Lift fan", explanation: "Pushes air down.", x: .3, y: .4 },
      { id: "engine", label: "Engine", explanation: "Powers the fan.", x: .7, y: .5 },
    ], connections: [{ from: "engine", to: "fan", label: "drives" }],
  };
  const phone: VisualLesson = { ...aircraft, layout: undefined, title: "Phone", parts: aircraft.parts.map((part) => ({ ...part, label: "Keypad" })) };
  const { container, rerender } = render(<VisualLessonOverlay lesson={aircraft} />);
  expect(container.querySelector(".interactive-jet-lesson")).toBeInTheDocument();
  rerender(<VisualLessonOverlay lesson={phone} />);
  expect(container.querySelector(".interactive-jet-lesson")).not.toBeInTheDocument();
  expect(container).toHaveTextContent("Keypad");
  rerender(<VisualLessonOverlay lesson={aircraft} />);
  expect(container.querySelector(".interactive-jet-lesson")).toBeInTheDocument();
});

it("keeps the aircraft explanation visible when WebGL is unavailable", async () => {
  const lesson: VisualLesson = {
    version: 1, layout: "centered", scene: "f35b-hover", title: "F-35B hover", placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [
      { id: "fan", label: "Lift fan", explanation: "Pushes air down.", x: .3, y: .4 },
      { id: "engine", label: "Engine", explanation: "Powers the fan.", x: .7, y: .5 },
    ], connections: [{ from: "engine", to: "fan", label: "drives" }],
  };
  const { container } = render(<VisualLessonOverlay lesson={lesson} />);
  await waitFor(() => expect(container.querySelector(".jet-fallback")).toBeInTheDocument());
  expect(container.querySelectorAll(".interactive-jet-lines line")).toHaveLength(2);
  expect(container).toHaveTextContent("3D view unavailable");
});
