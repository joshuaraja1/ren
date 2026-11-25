import { render, screen } from "@testing-library/react";
import { VisualLessonOverlay } from "./visual-lesson-overlay";
import { centerRequestedLesson } from "../electron/visual-presentation";
import type { VisualLesson } from "../electron/visual-lesson";

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

it("keeps five essential parts around a centered render through preview and final image", () => {
  const names = ["Engine", "Lift fan", "Rear nozzle", "Roll posts", "Flight controls", "Air inlet", "Fan doors", "Exhaust"];
  const source: VisualLesson = {
    version: 1, title: "How hover works", placement: { x: .75, y: .5, width: .22, height: .3 },
    parts: names.map((label, index) => ({ id: `part${index}`, label, explanation: `${label} contributes to a controlled vertical force.`, x: .5, y: .5 })),
    connections: names.slice(1).map((_, index) => ({ from: `part${index}`, to: `part${index + 1}`, label: "supports" })),
  };
  const lesson = centerRequestedLesson(source, 3456, 2234);
  const image = "data:image/png;base64,dGVzdA==";
  const { container, rerender } = render(<VisualLessonOverlay lesson={lesson} />);
  expect(container.querySelector(".visual-lesson")).toHaveClass("centered-stage");
  expect(container).toHaveTextContent("Creating 3D illustration");
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(5);
  const assertSpacing = () => {
    for (const side of ["left", "right"]) {
      const cards = Array.from(container.querySelectorAll<HTMLElement>(`.illustrated-lesson-part.${side}`));
      expect(cards.length).toBeGreaterThanOrEqual(2);
      expect(cards.length).toBeLessThanOrEqual(3);
      const slots = cards.map((card) => Number.parseFloat(card.style.top));
      expect(slots.every((slot, index) => index === 0 || slot - slots[index - 1] >= 20)).toBe(true);
    }
  };
  assertSpacing();
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image, preview: true, width: 1024, height: 1024 }} />);
  expect(container.querySelector(".visual-lesson-illustration img")).toHaveAttribute("src", image);
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(5);
  assertSpacing();
  const registration = Object.fromEntries(names.map((_, index) => [`part${index}`, { x: index % 2 ? .7 : .3, y: .15 + index * .1 }]));
  rerender(<VisualLessonOverlay lesson={lesson} illustration={{ image, preview: false, width: 1024, height: 1024, registration }} />);
  expect(container.querySelectorAll(".illustrated-lesson-lines line")).toHaveLength(5);
  expect(container.querySelectorAll(".illustrated-lesson-part")).toHaveLength(5);
  expect(container.querySelector(".visual-lesson-illustration img")).toHaveAttribute("src", image);
  lesson.parts.forEach((part) => expect(container).toHaveTextContent(part.label));
  assertSpacing();
});
