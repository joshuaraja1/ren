import { describe, expect, it, vi } from "vitest";
import { generateSceneSpec, matchesLessonSubject, wantsAssemblyAnimation, wantsAssemblySequence, wantsSubject3D } from "./scene-generation.js";
import { raspberryPiCameraTemplate } from "./scene-templates.js";
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
  it("rejects a geometrically valid model of the wrong subject", () => {
    const desktop = { ...lesson, title: "Desktop computer assembly" };
    expect(matchesLessonSubject({ ...model, subject: "Bicycle front wheel", fidelity: "conceptual" }, desktop)).toBe(false);
    expect(matchesLessonSubject({ ...model, subject: "Open desktop computer tower", fidelity: "conceptual" }, desktop)).toBe(true);
    expect(matchesLessonSubject({ ...model, subject: "Cellular handset", fidelity: "conceptual" }, { ...lesson, title: "Mobile phone internals" })).toBe(true);
  });

  it("retries an unrelated generated object before displaying a model", async () => {
    const fetcher = vi.fn(async () => reply(fetcher.mock.calls.length === 1
      ? { ...model, subject: "Bicycle front wheel" } : model)) as unknown as typeof fetch;
    const result = await generateSceneSpec(lesson, "Show a 3D phone", credentials, new AbortController().signal, fetcher);
    expect(result.subject).toBe("Classic cell phone");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("recognizes explicit 3D requests without treating ordinary 2D requests as 3D", () => {
    expect(wantsSubject3D("Make me a rotatable model of this phone")).toBe(true);
    expect(wantsSubject3D("Show a three-dimensional heart diagram")).toBe(true);
    expect(wantsSubject3D("Draw a diagram of this phone")).toBe(false);
    expect(wantsSubject3D("Draw a 2D flat diagram, not 3D")).toBe(false);
  });

  it("recognizes assembly and requires a usable step sequence", async () => {
    expect(wantsAssemblySequence("Show the phone assembly step by step in 3D")).toBe(true);
    expect(wantsAssemblySequence("Draw a phone diagram")).toBe(false);
    const withAssembly = { ...model, assembly: [{ partId: "display", from: [0, 0, 2], instruction: "Place the display in the housing." }] };
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].content).toContain('"assemblyRequested":true');
      return reply(fetcher.mock.calls.length === 1 ? model : withAssembly);
    }) as unknown as typeof fetch;
    const result = await generateSceneSpec(lesson, "Show the phone assembly step by step in 3D", credentials, new AbortController().signal, fetcher);
    expect(result.assembly).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("plays an explicitly requested attachment animation, while a static diagram stays static", () => {
    expect(wantsAssemblySequence("Show a 3D Raspberry Pi 5 and how to attach a mini camera with an animation")).toBe(true);
    expect(wantsAssemblyAnimation("Show a 3D Raspberry Pi 5 and how to attach a mini camera with an animation")).toBe(true);
    expect(wantsAssemblySequence("Animate attaching a mini camera to a Raspberry Pi 5")).toBe(true);
    expect(wantsAssemblyAnimation("Animate attaching a mini camera to a Raspberry Pi 5")).toBe(true);
    expect(wantsAssemblyAnimation("Show a static 3D Raspberry Pi 5 camera diagram")).toBe(false);
    expect(wantsAssemblyAnimation("Replay the assembly")).toBe(true);
    expect(wantsAssemblyAnimation("Show me exactly how to attach a camera to this Raspberry Pi 5")).toBe(true);
    expect(wantsAssemblySequence("Animate attaching a bicycle wheel to its fork")).toBe(true);
    expect(wantsAssemblyAnimation("Animate attaching a bicycle wheel to its fork")).toBe(true);
    expect(wantsAssemblySequence("Show installing a desk lamp shade onto its stem")).toBe(true);
    expect(wantsAssemblySequence("Animate connecting a turbine to a generator")).toBe(true);
    expect(wantsAssemblySequence("Connect to Wi-Fi")).toBe(false);
    expect(wantsAssemblySequence("Show a 3D Raspberry Pi 5 camera connection")).toBe(true);
    expect(wantsAssemblyAnimation("Show a 3D Raspberry Pi 5 camera connection")).toBe(true);
    expect(wantsAssemblyAnimation("How do I connect a camera module to this Pi?")).toBe(true);
    expect(wantsAssemblyAnimation("How do I attach a bicycle wheel to its fork?")).toBe(true);
    expect(wantsAssemblyAnimation("How do I install memory into a desktop computer?")).toBe(true);
    expect(wantsAssemblyAnimation("Show a static 3D Pi camera connection")).toBe(false);
    expect(wantsAssemblySequence("How do I build a job application agent?")).toBe(false);
    expect(wantsAssemblySequence("Show how to install RAM into a server")).toBe(true);
    expect(wantsAssemblySequence("How do I connect a monitor to a server?")).toBe(true);
    expect(wantsAssemblySequence("How do I connect an app to a server?")).toBe(false);
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

  it("uses the visible Pi crop to plan matching geometry while keeping verified attachment instructions", async () => {
    const piLesson = validateVisualLesson({
      version: 1, title: "Raspberry Pi 5 camera setup", placement: { x: .1, y: .1, width: .8, height: .8 },
      parts: [
        { id: "pi", label: "Raspberry Pi 5 board", explanation: "Host board", x: .5, y: .3 },
        { id: "cable", label: "Ribbon cable", explanation: "Adapter", x: .5, y: .5 },
        { id: "camera", label: "Camera Module 3", explanation: "Image sensor", x: .5, y: .7 },
      ],
      connections: [{ from: "pi", to: "cable", label: "holds" }, { from: "cable", to: "camera", label: "connects" }],
    })!;
    const template = raspberryPiCameraTemplate(piLesson, "Animate attaching the camera", true)!;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const content = JSON.parse(String(init.body)).messages[1].content;
      expect(content[0].text).toContain("horizontal XZ plane");
      expect(content[1].image_url.url).toBe("data:image/png;base64,AA==");
      return reply({ ...template, subject: "Image matched Pi", assembly: template.assembly?.map((step) => ({ ...step, instruction: "Unverified instruction" })) });
    }) as unknown as typeof fetch;
    const result = await generateSceneSpec(piLesson, "Animate attaching the camera to this Raspberry Pi 5", credentials, new AbortController().signal, fetcher, "data:image/png;base64,AA==");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.subject).toBe("Image matched Pi");
    expect(result.assembly).toEqual(template.assembly);
  });

  it("falls back to the verified Pi layout when image-derived geometry has an upright board", async () => {
    const piLesson = validateVisualLesson({
      version: 1, title: "Raspberry Pi 5 camera setup", placement: { x: .1, y: .1, width: .8, height: .8 },
      parts: [
        { id: "pi", label: "Raspberry Pi 5 board", explanation: "Host board", x: .5, y: .3 },
        { id: "cable", label: "Ribbon cable", explanation: "Adapter", x: .5, y: .5 },
        { id: "camera", label: "Camera Module 3", explanation: "Image sensor", x: .5, y: .7 },
      ],
      connections: [{ from: "pi", to: "cable", label: "holds" }, { from: "cable", to: "camera", label: "connects" }],
    })!;
    const template = raspberryPiCameraTemplate(piLesson, "Show a Pi camera", true)!;
    const upright = { ...template, primitives: template.primitives.map((part) => part.partId === "pi" && part.kind === "box" ? { ...part, scale: [part.scale[0], part.scale[2], part.scale[1]] } : part) };
    const fetcher = vi.fn(async () => reply(upright)) as unknown as typeof fetch;
    const result = await generateSceneSpec(piLesson, "Show how to attach a camera to this Raspberry Pi 5", credentials, new AbortController().signal, fetcher, "data:image/png;base64,AA==");
    expect(result).toEqual(template);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("plans an anaphoric 3D follow-up from the retained diagram's subject and parts", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[0].content).toContain('only says "it"');
      expect(body.messages[1].content).toContain('"title":"How a phone works"');
      expect(body.messages[1].content).toContain('"id":"display"');
      expect(body.messages[1].content).toContain('"request":"Make it 3D"');
      return reply(model);
    }) as unknown as typeof fetch;
    const result = await generateSceneSpec(lesson, "Make it 3D", credentials, new AbortController().signal, fetcher);
    expect(result.subject).toBe("Classic cell phone");
  });

  it("retries an incomplete model once and fails clearly if still invalid", async () => {
    const fetcher = vi.fn(async () => reply({ ...model, primitives: model.primitives.slice(0, 1) })) as unknown as typeof fetch;
    await expect(generateSceneSpec(lesson, "Make a 3D phone", credentials, new AbortController().signal, fetcher)).rejects.toThrow("could not construct a coherent 3D model");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["phone battery replacement", ["housing", "battery", "back cover"]],
    ["desk lamp assembly", ["base", "stem", "lamp head", "shade"]],
    ["small water pump assembly", ["housing", "impeller", "shaft", "cover", "outlet"]],
  ])("plans all parts and ordered steps for a %s", async (subject, labels) => {
    const parts = labels.map((label, index) => ({ id: `p${index}`, label, explanation: `${label} role`, x: .5, y: .5 }));
    const subjectLesson = validateVisualLesson({
      version: 1, title: subject, placement: { x: .1, y: .1, width: .8, height: .8 }, parts,
      connections: parts.slice(1).map((part, index) => ({ from: `p${index}`, to: part.id, label: "connects" })),
    })!;
    const generated = {
      version: 1, subject,
      primitives: parts.map((part, index) => ({ partId: part.id, kind: "box", position: [index * .65 - 1, 0, index * .1], scale: [.6, .7, .2], rotation: [0, 0, 0], color: "#557788" })),
      anchors: parts.map((part, index) => ({ partId: part.id, position: [index * .65 - 1, 0, index * .1] })),
      assembly: parts.slice(1).map((part, index) => ({ partId: part.id, from: [0, 0, index + 1], instruction: `Align and place ${part.label}.` })),
    };
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).messages[1].content).toContain('"assemblyRequested":true');
      return reply(generated);
    }) as unknown as typeof fetch;
    const result = await generateSceneSpec(subjectLesson, `Show the ${subject} assembly step by step in 3D`, credentials, new AbortController().signal, fetcher);
    expect(result.primitives.map((part) => part.partId)).toEqual(parts.map((part) => part.id));
    expect(result.assembly?.map((step) => step.partId)).toEqual(parts.slice(1).map((part) => part.id));
    expect(validateVisualLesson({ ...subjectLesson, model: result })?.model).toEqual(result);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
