import { describe, expect, it, vi } from "vitest";
import { filterOpaquePositions, locateImageParts, positionsOnOpaquePixels, validateImageRegistration, validatePartialImageRegistration } from "./image-registration.js";
import type { VisualLesson } from "./visual-lesson.js";

const lesson: VisualLesson = { version: 1, title: "Aircraft", placement: { x: .1, y: .1, width: .7, height: .7 }, parts: [
  { id: "wing", label: "Wing", explanation: "Creates lift", x: .2, y: .4 },
  { id: "engine", label: "Engine", explanation: "Creates thrust", x: .8, y: .6 },
], connections: [{ from: "engine", to: "wing", label: "moves past" }] };
const valid = { coherent: true, parts: [
  { id: "wing", present: true, confidence: .94, x: .28, y: .4 },
  { id: "engine", present: true, confidence: .9, x: .71, y: .64 },
] };

describe("generated image registration", () => {
  it("accepts a complete independent mapping", () => expect(validateImageRegistration(valid, lesson)).toEqual({ wing: { x: .28, y: .4 }, engine: { x: .71, y: .64 } }));
  it("rejects missing, ambiguous, duplicate, and collapsed parts", () => {
    expect(validateImageRegistration({ ...valid, parts: valid.parts.slice(0, 1) }, lesson)).toBeNull();
    expect(validateImageRegistration({ ...valid, parts: [{ ...valid.parts[0], confidence: .5 }, valid.parts[1]] }, lesson)).toBeNull();
    expect(validateImageRegistration({ ...valid, parts: [valid.parts[0], { ...valid.parts[1], id: "wing" }] }, lesson)).toBeNull();
    expect(validateImageRegistration({ ...valid, parts: [valid.parts[0], { ...valid.parts[1], x: .29, y: .41 }] }, lesson)).toBeNull();
  });
  it("keeps confidently located parts when other generated details are absent", () => {
    const partial = { coherent: true, parts: [valid.parts[0], { ...valid.parts[1], present: false, confidence: .2 }] };
    expect(validatePartialImageRegistration(partial, lesson)).toEqual({ wing: { x: .28, y: .4 } });
    expect(validatePartialImageRegistration({ ...partial, coherent: false }, lesson)).toBeNull();
  });
  it("accepts coding part IDs that overlap Object.prototype names", () => {
    const coding = { ...lesson, parts: [{ ...lesson.parts[0], id: "constructor" }, { ...lesson.parts[1], id: "toString" }] };
    const mapping = { coherent: true, parts: [{ ...valid.parts[0], id: "constructor" }, { ...valid.parts[1], id: "toString" }] };
    expect(validateImageRegistration(mapping, coding)).toEqual({ constructor: { x: .28, y: .4 }, toString: { x: .71, y: .64 } });
  });
  it("sends only the generated image and manifest to the vision checker", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[1].content[1].image_url.url).toBe("data:image/png;base64,example");
      expect(body.messages[1].content[0].text).not.toContain("Creates lift");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(locateImageParts(lesson, "data:image/png;base64,example", "key", "vision-model", new AbortController().signal, fetcher)).resolves.toEqual({ wing: { x: .28, y: .4 }, engine: { x: .71, y: .64 } });
  });
  it("checks generated image locations through OpenAI", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.think).toBeUndefined();
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(locateImageParts(lesson, "data:image/png;base64,example", "test-key", "gpt-5.4-mini", new AbortController().signal, fetcher, "https://api.openai.com/v1")).resolves.toEqual({ wing: { x: .28, y: .4 }, engine: { x: .71, y: .64 } });
  });
  it("uses GPT-6 Sol's supported reasoning setting for image checks", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: "gpt-6-sol", reasoning_effort: "low", max_completion_tokens: 1200 });
      expect(body.temperature).toBeUndefined();
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(locateImageParts(lesson, "data:image/png;base64,example", "key", "gpt-6-sol", new AbortController().signal, fetcher)).resolves.not.toBeNull();
  });
  it("rejects part anchors in transparent padding", () => {
    const bitmap = new Uint8Array(20 * 20 * 4);
    const registration = { wing: { x: .25, y: .25 }, engine: { x: .75, y: .75 } };
    expect(positionsOnOpaquePixels(bitmap, 20, 20, registration)).toBe(false);
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) bitmap[(y * 20 + x) * 4 + 3] = 255;
    expect(positionsOnOpaquePixels(bitmap, 20, 20, registration)).toBe(true);
    for (let y = 0; y < 10; y += 1) for (let x = 0; x < 10; x += 1) bitmap[(y * 20 + x) * 4 + 3] = 0;
    expect(filterOpaquePositions(bitmap, 20, 20, registration)).toEqual({ engine: registration.engine });
  });
  it("stops reading an oversized image-check response", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(50_001)); },
      cancel,
    });
    const fetcher = vi.fn(async () => new Response(stream, { status: 200 })) as unknown as typeof fetch;
    await expect(locateImageParts(lesson, "data:image/png;base64,example", "key", "model", new AbortController().signal, fetcher)).rejects.toThrow("too much data");
    expect(cancel).toHaveBeenCalled();
  });
});
