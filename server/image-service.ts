import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { imageManifest, generateIllustration } from "../electron/image-render.js";
import { locateImageParts, type ImageRegistration } from "../electron/image-registration.js";
import { validateVisualLesson, type VisualLesson } from "../electron/visual-lesson.js";

type ImageManifest = ReturnType<typeof imageManifest>;
type Generate = (lesson: VisualLesson, key: string, preview: (image: string) => void, signal: AbortSignal) => Promise<string>;
type Register = (lesson: VisualLesson, image: string, key: string, model: string, signal: AbortSignal) => Promise<ImageRegistration | null>;
export type ImageServiceConfig = {
  openaiKey: string;
  tokenDigests: string[];
  visionModel: string;
  dailyLimit: number;
  perTokenDailyLimit: number;
  maxConcurrent: number;
};

function manifestToLesson(value: unknown): VisualLesson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ImageManifest>;
  if (!Array.isArray(raw.parts) || raw.parts.length < 2 || raw.parts.length > 12 || !Array.isArray(raw.connections)) return null;
  const parts = raw.parts.map((part, index) => ({ id: part?.id, label: part?.label, explanation: typeof part?.function === "string" ? part.function : "Illustrative component.", x: (index + 1) / (raw.parts!.length + 1), y: 0.5 }));
  return validateVisualLesson({ version: 1, title: raw.title, assumption: raw.assumption, placement: { x: 0, y: 0, width: 1, height: 1 }, parts, connections: raw.connections });
}

async function readRequest(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += bytes.byteLength;
    if (size > 8_192) throw new Error("too-large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function reply(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify({ error: message }));
}

function digest(token: string) { return createHash("sha256").update(token).digest(); }
function authenticatedToken(req: IncomingMessage, allowed: Buffer[]) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.authorization ?? "");
  if (!match) return null;
  const candidate = digest(match[1]);
  return allowed.some((value) => timingSafeEqual(value, candidate)) ? candidate.toString("hex") : null;
}

export function createImageService(config: ImageServiceConfig, deps: { generate?: Generate; register?: Register } = {}) {
  if (!config.openaiKey || !config.tokenDigests.length || config.tokenDigests.some((value) => !/^[a-f0-9]{64}$/i.test(value))) throw new Error("Image service credentials are missing or invalid.");
  if (!Number.isInteger(config.dailyLimit) || config.dailyLimit < 1 || !Number.isInteger(config.perTokenDailyLimit) || config.perTokenDailyLimit < 1 || !Number.isInteger(config.maxConcurrent) || config.maxConcurrent < 1) throw new Error("Image service limits are invalid.");
  const allowed = config.tokenDigests.map((value) => Buffer.from(value, "hex"));
  const generate = deps.generate ?? generateIllustration;
  const register = deps.register ?? locateImageParts;
  let day = new Date().toISOString().slice(0, 10);
  let daily = 0;
  let active = 0;
  const byToken = new Map<string, number>();
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end('{"status":"ready"}');
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/illustrations") { reply(res, 404, "Not found."); return; }
    const token = authenticatedToken(req, allowed);
    if (!token) { reply(res, 401, "Ren access token required."); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; daily = 0; byToken.clear(); }
    if (active >= config.maxConcurrent || daily >= config.dailyLimit || (byToken.get(token) ?? 0) >= config.perTokenDailyLimit) { reply(res, 429, "Illustration allowance reached. Try later."); return; }
    let lesson: VisualLesson | null = null;
    try {
      const request = await readRequest(req);
      lesson = manifestToLesson(request && typeof request === "object" ? (request as { manifest?: unknown }).manifest : null);
    } catch (error) {
      reply(res, error instanceof Error && error.message === "too-large" ? 413 : 400, "Invalid illustration request.");
      return;
    }
    if (!lesson) { reply(res, 400, "Invalid lesson manifest."); return; }
    const acceptedDay = new Date().toISOString().slice(0, 10);
    if (acceptedDay !== day) { day = acceptedDay; daily = 0; byToken.clear(); }
    if (active >= config.maxConcurrent || daily >= config.dailyLimit || (byToken.get(token) ?? 0) >= config.perTokenDailyLimit) { reply(res, 429, "Illustration allowance reached. Try later."); return; }
    daily += 1;
    byToken.set(token, (byToken.get(token) ?? 0) + 1);
    active += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 150_000);
    res.on("close", () => controller.abort());
    controller.signal.addEventListener("abort", () => res.destroy(), { once: true });
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", connection: "keep-alive" });
    let writes = Promise.resolve();
    const emit = (event: string, data: unknown) => {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      writes = writes.then(() => new Promise<void>((resolve) => {
        if (res.destroyed || controller.signal.aborted) { resolve(); return; }
        if (res.write(frame)) { resolve(); return; }
        const done = () => { res.off("drain", done); res.off("close", done); resolve(); };
        res.once("drain", done);
        res.once("close", done);
      }));
    };
    try {
      const image = await generate(lesson, config.openaiKey, (preview) => emit("preview", { image: preview }), controller.signal);
      emit("preview", { image });
      const registration = await register(lesson, image, config.openaiKey, config.visionModel, controller.signal).catch(() => null);
      emit("complete", { image, registration });
    } catch {
      emit("error", { message: "Ren could not verify every part of this image. Keeping the schematic." });
    } finally {
      await writes;
      clearTimeout(timeout);
      active -= 1;
      res.end();
    }
  });
}
