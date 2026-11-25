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
