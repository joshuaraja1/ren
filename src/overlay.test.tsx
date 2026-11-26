import { render, screen } from "@testing-library/react";
import { Overlay } from "./overlay";
import type { Annotation, Illustration, RenBridge } from "./contracts";
import type { VisualLesson } from "../electron/visual-lesson";

it("restores an in-app visual lesson when the overlay renderer becomes ready", () => {
  const priorBridge = window.ren;
  const order: string[] = [];
  let annotationsListener: ((value: Annotation[]) => void) | undefined;
  let lessonListener: ((value: VisualLesson | null) => void) | undefined;
  let illustrationListener: ((value: Illustration | null) => void) | undefined;
  const lesson: VisualLesson = {
    version: 1,
    dimension: 2,
    layout: "centered",
    title: "Camera connection",
    placement: { x: .1, y: .1, width: .8, height: .8 },
    parts: [
      { id: "board", label: "Board", explanation: "Hosts the socket.", x: .3, y: .5 },
      { id: "camera", label: "Camera", explanation: "Connects to the socket.", x: .7, y: .5 },
    ],
    connections: [{ from: "camera", to: "board", label: "ribbon cable" }],
  };
  window.ren = {
    onAnnotations(listener: typeof annotationsListener) { order.push("annotations"); annotationsListener = listener; return () => {}; },
    onVisualLesson(listener: typeof lessonListener) { order.push("lesson"); lessonListener = listener; return () => {}; },
    onIllustration(listener: typeof illustrationListener) { order.push("illustration"); illustrationListener = listener; return () => {}; },
    overlayReady() {
      order.push("ready");
      annotationsListener?.([]);
      lessonListener?.(lesson);
      illustrationListener?.(null);
    },
  } as unknown as RenBridge;
  try {
    const { container } = render(<Overlay />);
    expect(order).toEqual(["annotations", "lesson", "illustration", "ready"]);
    expect(screen.getByRole("img", { name: /Camera connection/ })).toBeInTheDocument();
    expect(container.querySelectorAll(".visual-lesson-vector-fallback line")).toHaveLength(1);
  } finally {
    window.ren = priorBridge;
  }
});
