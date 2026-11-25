import { deepgramKey } from "./deepgram-settings.js";
import { plainAnswer } from "./plain-answer.js";

export async function streamWithDeepgram(value: unknown, onChunk: (audio: Uint8Array) => void, signal?: AbortSignal): Promise<void> {
  if (typeof value !== "string" || !value.trim() || value.length > 5000) throw new Error("Speech text is invalid.");
  const spoken = plainAnswer(value);
  if (!spoken) throw new Error("Speech text is invalid.");
  const key = await deepgramKey();
  if (!key) throw new Error("Connect Deepgram in AI settings to hear Ren speak.");
  let response: Response;
  try {
    response = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=24000&container=none", {
      method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000), redirect: "error",
    });
  } catch { throw new Error("Deepgram speech is unavailable. Check your network."); }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Deepgram rejected the saved key." : `Deepgram speech failed (${response.status}).`);
  if (!response.body) throw new Error("Deepgram returned no speech audio.");
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > 10_000_000) throw new Error("Deepgram speech response was too large.");
      onChunk(chunk);
    }
    if (!bytes) throw new Error("Deepgram returned no speech audio.");
  } finally { reader.releaseLock(); }
}
