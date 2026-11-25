import { deepgramKey } from "./deepgram-settings.js";

export async function speakWithDeepgram(value: unknown): Promise<string> {
  if (typeof value !== "string" || !value.trim() || value.length > 5000) throw new Error("Speech text is invalid.");
  const key = await deepgramKey();
  if (!key) throw new Error("Connect Deepgram in AI settings to hear Ren speak.");
  let response: Response;
  try {
    response = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3", {
      method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: value }), signal: AbortSignal.timeout(20_000), redirect: "error",
    });
  } catch { throw new Error("Deepgram speech is unavailable. Check your network."); }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Deepgram rejected the saved key." : `Deepgram speech failed (${response.status}).`);
  if (Number(response.headers.get("content-length")) > 10_000_000) throw new Error("Deepgram speech response was too large.");
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length > 10_000_000) throw new Error("Deepgram speech response was too large.");
  return audio.toString("base64");
}
