// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageService } from "./image-service.js";
import { generateHostedIllustration } from "../electron/hosted-image-render.js";
import type { VisualLesson } from "../electron/visual-lesson.js";

const token = "ren_test_token_0123456789_abcdef";
const digest = createHash("sha256").update(token).digest("hex");
const image = `data:image/png;base64,${readFileSync("build/icon.png").toString("base64")}`;
const manifest = { title: "Aircraft", parts: [{ id: "wing", label: "Wing" }, { id: "engine", label: "Engine" }], connections: [{ from: "wing", to: "engine", label: "attached to" }] };
const servers: ReturnType<typeof createImageService>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

async function start(options: { dailyLimit?: number; generate?: Parameters<typeof createImageService>[1]["generate"]; register?: Parameters<typeof createImageService>[1]["register"] } = {}) {
  const generate = options.generate ?? vi.fn(async (_lesson, _key, preview) => { preview(image); return image; });
  const register = options.register ?? vi.fn(async () => ({ wing: { x: 0.3, y: 0.5 }, engine: { x: 0.7, y: 0.5 } }));
  const server = createImageService({ openaiKey: "server-only-key", tokenDigests: [digest], visionModel: "vision-model", dailyLimit: options.dailyLimit ?? 10, perTokenDailyLimit: 10, maxConcurrent: 2 }, { generate, register });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { url: `http://127.0.0.1:${address.port}/v1/illustrations`, generate, register };
}

const post = (url: string, access = token, body: unknown = { manifest }) => fetch(url, { method: "POST", headers: { authorization: `Bearer ${access}`, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("hosted illustration service", () => {
  it("requires access before spending provider requests", async () => {
    const { url, generate } = await start();
    expect((await post(url, "wrong_token_0123456789_abcdefghi")).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it("streams a preview and registered final image from a validated manifest", async () => {
    const { url, generate, register } = await start();
    const response = await post(url);
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("event: preview");
    expect(stream).toContain("event: complete");
    expect(stream.match(/event: preview/g)).toHaveLength(2);
    expect(stream).toContain('"wing":{"x":0.3,"y":0.5}');
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ title: "Aircraft" }), "server-only-key", expect.any(Function), expect.any(AbortSignal));
    expect(register).toHaveBeenCalledWith(expect.any(Object), image, "server-only-key", "vision-model", expect.any(AbortSignal));
  });

  it("rejects malformed requests and enforces the daily request cap", async () => {
    const { url, generate } = await start({ dailyLimit: 1 });
    expect((await post(url, token, { manifest: { ...manifest, connections: [] } })).status).toBe(400);
    expect((await post(url)).status).toBe(200);
    expect((await post(url)).status).toBe(429);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps the rendered image when part registration fails", async () => {
    const { url } = await start({ register: vi.fn(async () => null) });
    const response = await post(url);
    const stream = await response.text();
    expect(stream).toContain("event: complete");
    expect(stream).toContain('"registration":null');
  });

  it("delivers a verified image to the desktop adapter over HTTP", async () => {
    const { url } = await start();
    const lesson: VisualLesson = { version: 1, title: "Aircraft", placement: { x: .1, y: .1, width: .7, height: .7 }, parts: [
      { id: "wing", label: "Wing", explanation: "Lift", x: .2, y: .5 },
      { id: "engine", label: "Engine", explanation: "Thrust", x: .8, y: .5 },
    ], connections: [{ from: "wing", to: "engine", label: "attached to" }] };
    const preview = vi.fn();
    await expect(generateHostedIllustration(lesson, { baseUrl: url.slice(0, -"/illustrations".length), accessToken: token }, preview, AbortSignal.timeout(5_000))).resolves.toEqual({ image, registration: { wing: { x: .3, y: .5 }, engine: { x: .7, y: .5 } } });
    expect(preview).toHaveBeenCalled();
  });
});
