import WebSocket from "ws";
import { deepgramKey } from "./deepgram-settings.js";
import { RealtimeAudioBudget } from "./audio-budget.js";

type ActiveSpeech = {
  socket: WebSocket;
  budget: RealtimeAudioBudget;
  transcript: string;
  finish?: { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
};
let active: ActiveSpeech | null = null;
const rates = new Set([8000, 16000, 24000, 44100, 48000]);

export async function speechAvailable() { return !!await deepgramKey(); }

function closeSpeech(current: ActiveSpeech, error?: Error) {
  if (active === current) active = null;
  if (current.socket.readyState === WebSocket.CONNECTING) current.socket.terminate();
  else if (current.socket.readyState === WebSocket.OPEN) current.socket.close();
  if (current.finish) {
    clearTimeout(current.finish.timer);
    if (error) current.finish.reject(error);
    else current.finish.resolve(current.transcript.trim());
    current.finish = undefined;
  }
}

export async function startSpeech(sampleRate: number) {
  if (active || !rates.has(sampleRate)) return false;
  const key = await deepgramKey();
  if (!key) return false;
  const url = new URL("wss://api.deepgram.com/v2/listen");
  url.searchParams.set("model", "flux-general-en");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", String(sampleRate));
  url.searchParams.set("eot_threshold", "1.0");
  url.searchParams.set("eot_timeout_ms", "60000");
  const socket = new WebSocket(url, { headers: { Authorization: `Token ${key}` }, handshakeTimeout: 10_000 });
  const current: ActiveSpeech = { socket, budget: new RealtimeAudioBudget(sampleRate), transcript: "" };
  active = current;
  socket.on("message", (data) => {
    if (active !== current) return;
    try {
      const message = JSON.parse(String(data)) as { type?: string; event?: string; transcript?: string };
      if (message.type === "TurnInfo" && typeof message.transcript === "string") {
        current.transcript = message.transcript;
        if (message.event === "EndOfTurn" && current.finish) closeSpeech(current);
      }
    } catch { /* Ignore malformed provider events. */ }
  });
  socket.on("error", () => { if (active === current) closeSpeech(current, new Error("Deepgram connection failed. Check your key and network.")); });
  socket.on("close", () => { if (active === current) closeSpeech(current, new Error("Deepgram disconnected during dictation.")); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Deepgram connection timed out.")), 10_000);
      socket.once("open", () => { clearTimeout(timer); resolve(); });
      socket.once("error", () => { clearTimeout(timer); reject(new Error("Deepgram connection failed. Check your key and network.")); });
      socket.once("close", () => { clearTimeout(timer); reject(new Error("Deepgram connection closed. Check your key and network.")); });
    });
    return active === current;
  } catch (error) { closeSpeech(current); throw error; }
}

export async function feedSpeech(samples: unknown) {
  const current = active;
  if (!current || current.socket.readyState !== WebSocket.OPEN || !Array.isArray(samples) || samples.length === 0 || samples.length > 8192 || !samples.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1) || !current.budget.accept(samples.length)) return false;
  if (current.socket.bufferedAmount > 1_000_000) return false;
  const pcm = Buffer.allocUnsafe(samples.length * 2);
  samples.forEach((sample, index) => pcm.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), index * 2));
  current.socket.send(pcm);
  return true;
}

export async function finishSpeech() {
  const current = active;
  if (!current || current.socket.readyState !== WebSocket.OPEN) return "";
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => closeSpeech(current), 8_000);
    current.finish = { resolve, reject, timer };
    try { current.socket.send(JSON.stringify({ type: "ForceEndTurn" })); }
    catch { closeSpeech(current, new Error("Deepgram could not finish dictation.")); }
  });
}

export async function stopSpeech() {
  if (active) closeSpeech(active, new Error("Dictation cancelled."));
}
