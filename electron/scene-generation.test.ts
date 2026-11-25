import { describe, expect, it, vi } from "vitest";
import { generateSceneSpec, wantsSubject3D } from "./scene-generation.js";
import { validateVisualLesson } from "./visual-lesson.js";

const lesson = validateVisualLesson({
  version: 1, title: "How a phone works", placement: { x: .1, y: .1, width: .8, height: .8 },
  parts: [
    { id: "body", label: "Housing", explanation: "Holds the components.", x: .4, y: .5 },
    { id: "display", label: "Display", explanation: "Shows information.", x: .5, y: .3 },
  ],
  connections: [{ from: "body", to: "display", label: "supports" }],
})!;
const credentials = { apiKey: "test", model: "gpt-6-sol", baseUrl: "https://api.openai.com/v1" };
const model = {
  version: 1, subject: "Classic cell phone",
  primitives: [
    { partId: "body", kind: "box", position: [0, 0, 0], scale: [2, 4, .5], rotation: [0, 0, 0], color: "#2255aa" },
    { partId: "display", kind: "box", position: [0, .8, .3], scale: [1.4, 1.2, .1], rotation: [0, 0, 0], color: "#aacccc" },
  ],
  anchors: [{ partId: "body", position: [0, -1, .3] }, { partId: "display", position: [0, .8, .4] }],
};
const reply = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

describe("generic subject model generation", () => {
  it("recognizes explicit 3D requests without treating ordinary 2D requests as 3D", () => {
    expect(wantsSubject3D("Make me a rotatable model of this phone")).toBe(true);
    expect(wantsSubject3D("Show a three-dimensional heart diagram")).toBe(true);
    expect(wantsSubject3D("Draw a diagram of this phone")).toBe(false);
    expect(wantsSubject3D("Draw a 2D flat diagram, not 3D")).toBe(false);
  });

  it("sends bounded lesson data and returns validated physical primitives", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("gpt-6-sol");
      expect(body.reasoning_effort).toBe("medium");
      expect(body.messages[0].content).toContain("not a relationship graph");
      expect(body.messages[1].content).toContain("classic cell phone");
      expect(body.messages[1].content).not.toContain("data:image");
      return reply(model);
    }) as unknown as typeof fetch;
    const result = await generateSceneSpec(lesson, "Make a 3D model of a classic cell phone", credentials, new AbortController().signal, fetcher);
    expect(result.subject).toBe("Classic cell phone");
    expect(result.fidelity).toBe("conceptual");
    expect(result.anchors.map((anchor) => anchor.partId)).toEqual(["body", "display"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(validateVisualLesson({ ...lesson, model: result })?.model).toEqual(result);
  });

  it("retries an incomplete model once and fails clearly if still invalid", async () => {
    const fetcher = vi.fn(async () => reply({ ...model, anchors: model.anchors.slice(0, 1) })) as unknown as typeof fetch;
    await expect(generateSceneSpec(lesson, "Make a 3D phone", credentials, new AbortController().signal, fetcher)).rejects.toThrow("could not construct a coherent 3D model");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
