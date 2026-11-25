import { render, screen } from "@testing-library/react";
import { VisualLessonOverlay } from "./visual-lesson-overlay";

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
  expect(container.querySelector(".visual-lesson-lines line")).toHaveAttribute("marker-end", "url(#lesson-arrowhead)");
});
