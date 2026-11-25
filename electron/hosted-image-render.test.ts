import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { generateHostedIllustration } from "./hosted-image-render.js";
import type { VisualLesson } from "./visual-lesson.js";

const lesson: VisualLesson = { version: 1, title: "Wing", placement: { x: .1, y: .1, width: .7, height: .7 }, parts: [
  { id: "wing", label: "Wing", explanation: "Lift", x: .2, y: .5 },
  { id: "engine", label: "Engine", explanation: "Thrust", x: .8, y: .5 },
], connections: [{ from: "wing", to: "engine", label: "next to" }] };
const image = `data:image/png;base64,${readFileSync("build/icon.png").toString("base64")}`;
const registration = { wing: { x: .3, y: .4 }, engine: { x: .7, y: .6 } };
const credentials = { baseUrl: "https://images.ren.example/v1", accessToken: "ren-access-token" };
const event = (name: string, value: unknown) => `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;

describe("hosted image adapter", () => {
  it("sends only the bounded manifest and accepts verified streamed imagery", async () => {
    const preview = vi.fn();
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe("https://images.ren.example/v1/illustrations");
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toEqual(expect.objectContaining({ authorization: "Bearer ren-access-token" }));
      const body = JSON.parse(String(init?.body));
      expect(body.manifest.parts[0]).toEqual({ id: "wing", label: "Wing", function: "Lift" });
      expect(JSON.stringify(body)).not.toContain("data:image");
      return new Response(event("preview", { image }) + event("complete", { image, registration }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(generateHostedIllustration(lesson, credentials, preview, new AbortController().signal, fetcher)).resolves.toEqual({ image, registration });
    expect(preview).toHaveBeenCalledWith(image);
  });

  it("rejects an unverified final event", async () => {
    const fetcher = vi.fn(async () => new Response(event("complete", { image, registration: { unknown: { x: .3, y: .4 } } }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateHostedIllustration(lesson, credentials, () => {}, new AbortController().signal, fetcher)).rejects.toThrow("part locations");
  });
  it("keeps a verified label when another image part is missing", async () => {
    const partial = { wing: registration.wing };
    const fetcher = vi.fn(async () => new Response(event("complete", { image, registration: partial }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateHostedIllustration(lesson, credentials, () => {}, new AbortController().signal, fetcher)).resolves.toEqual({ image, registration: partial });
  });
  it("keeps the final image when the checker cannot locate parts", async () => {
    const fetcher = vi.fn(async () => new Response(event("complete", { image, registration: null }), { status: 200 })) as unknown as typeof fetch;
    await expect(generateHostedIllustration(lesson, credentials, () => {}, new AbortController().signal, fetcher)).resolves.toEqual({ image, registration: undefined });
  });
});
