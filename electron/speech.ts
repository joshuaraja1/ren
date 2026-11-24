import { app, utilityProcess } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RealtimeAudioBudget } from "./audio-budget.js";

type Child = ReturnType<typeof utilityProcess.fork>;
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
type Reply = { id?: unknown; result?: unknown; error?: unknown };

let child: Child | null = null;
let ready: Promise<Child> | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();
let active = false;
let starting = false;
let feedBusy = false;
let budget: RealtimeAudioBudget | null = null;
let lastStart = 0;
let session = 0;

function modelPath() { return app.isPackaged ? join(process.resourcesPath, "ren-asr") : join(app.getAppPath(), "models/ren-asr"); }

export function speechAvailable() {
  return ["encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"].every((file) => existsSync(join(modelPath(), file)));
}

function workerPath() {
  const compiled = fileURLToPath(new URL("./speech-worker.js", import.meta.url));
  return app.isPackaged ? compiled.replace("app.asar/", "app.asar.unpacked/").replace("app.asar\\", "app.asar.unpacked\\") : compiled;
}

function reset(error: Error) {
  for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
  pending.clear(); child = null; ready = null; active = false; starting = false; feedBusy = false; budget = null;
}

function ensureChild(): Promise<Child> {
  if (ready) return ready;
  let process: Child;
  try { process = utilityProcess.fork(workerPath()); }
  catch { return Promise.reject(new Error("Local speech worker could not start.")); }
  ready = new Promise<Child>((resolve, reject) => {
    child = process;
    process.once("spawn", () => resolve(process));
    process.on("message", (reply: Reply) => {
      if (!reply || typeof reply !== "object") return;
      if (typeof reply.id !== "number") return;
      const task = pending.get(reply.id);
      if (!task) return;
      pending.delete(reply.id); clearTimeout(task.timer);
      if (typeof reply.error === "string") task.reject(new Error(reply.error));
      else task.resolve(reply.result);
    });
    process.once("error", () => { reject(new Error("Local speech worker could not start.")); process.kill(); reset(new Error("Local speech worker failed.")); });
    process.once("exit", () => { reject(new Error("Local speech worker exited.")); reset(new Error("Local speech worker exited.")); });
  });
  return ready;
}

async function send(message: Record<string, unknown>) {
  const process = await ensureChild();
  const id = ++nextId;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => { process.kill(); reset(new Error("Local speech worker timed out.")); }, 30_000);
    pending.set(id, { resolve, reject, timer });
    try { process.postMessage({ ...message, id }); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("Local speech worker could not receive audio.")); }
  });
}

export async function startSpeech(sampleRate: number) {
  if (!speechAvailable() || active || starting || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || Date.now() - lastStart < 1000) return false;
  lastStart = Date.now();
  starting = true;
  const currentSession = ++session;
  try {
    const started = await send({ type: "start", modelPath: modelPath(), sampleRate }) === true;
    if (currentSession !== session) return false;
    active = started;
    budget = started ? new RealtimeAudioBudget(sampleRate) : null;
    return started;
  } finally { starting = false; }
}

export async function feedSpeech(samples: unknown) {
  if (!active || feedBusy || !Array.isArray(samples) || samples.length === 0 || samples.length > 8192 || !samples.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1) || !budget?.accept(samples.length)) return false;
  feedBusy = true;
  try { return await send({ type: "feed", samples }) === true; }
  finally { feedBusy = false; }
}

export async function finishSpeech() {
  if (!active || feedBusy) return "";
  active = false; budget = null;
  return String(await send({ type: "finish" }) || "");
}

export async function stopSpeech() {
  session++; active = false; starting = false; budget = null;
  if (child) await send({ type: "stop" });
}
