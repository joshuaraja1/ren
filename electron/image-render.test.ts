import { describe, expect, it, vi } from "vitest";
import { generateIllustration, imagePrompt } from "./image-render.js";
import type { VisualLesson } from "./visual-lesson.js";
import { readFileSync } from "node:fs";

const lesson: VisualLesson = { version: 1, title: "Wing lift", placement: { x: .1, y: .1, width: .7, height: .7 }, parts: [
  { id: "wing", label: "Wing", explanation: "Deflects air", x: .2, y: .5 },
  { id: "air", label: "Air", explanation: "Flows past", x: .8, y: .5 },
], connections: [{ from: "air", to: "wing", label: "passes" }] };
const pngBytes = readFileSync("build/icon.png");
const png = pngBytes.toString("base64");
const event = (type: string) => `data: ${JSON.stringify({ type, b64_json: png, output_format: "png" })}\n\n`;

describe("illustration adapter", () => {
  it("builds a bounded manifest-only prompt", () => {
    expect(imagePrompt(lesson)).toContain('"label":"Wing"');
    expect(imagePrompt(lesson)).not.toContain("Deflects air");
    expect(imagePrompt(lesson)).toContain("Transparent background");
  });
  it("streams previews and accepts only a completed image", async () => {
    const preview = vi.fn();
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.stream).toBe(true);
      expect(body.background).toBe("transparent");
      expect(body.prompt).not.toContain("data:image");
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(event("image_generation.partial_image") + event("image_generation.completed"))); controller.close(); } }), { status: 200 });
    }) as unknown as typeof fetch;
    const image = await generateIllustration(lesson, "key", preview, new AbortController().signal, fetcher);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(image).toMatch(/^data:image\/png;base64,/);
  });
  it("rejects a stream with no final image", async () => {
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(event("image_generation.partial_image"))); controller.close(); } }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateIllustration(lesson, "key", () => {}, new AbortController().signal, fetcher)).rejects.toThrow("completed image");
  });
  it("accepts CRLF event boundaries", async () => {
    const stream = event("image_generation.completed").replaceAll("\n", "\r\n");
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(stream)); controller.close(); } }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateIllustration(lesson, "key", () => {}, new AbortController().signal, fetcher)).resolves.toMatch(/^data:image\/png;base64,/);
  });
  it("rejects oversized decoded dimensions before rendering", async () => {
    const huge = Buffer.from(pngBytes);
    huge.writeUInt32BE(100_000, 16);
    const stream = `data: ${JSON.stringify({ type: "image_generation.completed", b64_json: huge.toString("base64"), output_format: "png" })}\n\n`;
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(stream)); controller.close(); } }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateIllustration(lesson, "key", () => {}, new AbortController().signal, fetcher)).rejects.toThrow("dimensions");
  });
  it("rejects a truncated PNG even with a valid signature and dimensions", async () => {
    const stream = `data: ${JSON.stringify({ type: "image_generation.completed", b64_json: pngBytes.subarray(0, 40).toString("base64"), output_format: "png" })}\n\n`;
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(stream)); controller.close(); } }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateIllustration(lesson, "key", () => {}, new AbortController().signal, fetcher)).rejects.toThrow("truncated");
  });
});
