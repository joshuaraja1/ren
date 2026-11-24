import { app, safeStorage } from "electron";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type VisionCredentials = { apiKey: string; model: string; baseUrl: string };
export type VisionStatus = { mode: "connected" | "environment" | "demo"; model: string; host: string; baseUrl: string };
type StoredVision = { version: 1; model: string; baseUrl: string; encryptedKey: string };

function settingsPath() { return join(app.getPath("userData"), "vision-provider.json"); }

export function validateVisionEndpoint(raw: string) {
  const url = new URL(raw.trim());
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTPS provider URL, or HTTP on localhost.");
  }
  return url.toString().replace(/\/$/, "");
}

function validateModel(value: string) {
  const model = value.trim();
  if (!model || model.length > 120 || /\s/.test(model)) throw new Error("Enter a vision-capable model name.");
  return model;
}

async function readStored(): Promise<StoredVision | null> {
  try {
    const value = JSON.parse(await readFile(settingsPath(), "utf8")) as StoredVision;
    return value.version === 1 && typeof value.encryptedKey === "string" && typeof value.model === "string" && typeof value.baseUrl === "string" ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Could not read the saved vision provider settings.");
  }
}

export async function visionStatus(): Promise<VisionStatus> {
  const stored = await readStored();
  if (stored) return { mode: "connected", model: stored.model, host: new URL(stored.baseUrl).host, baseUrl: stored.baseUrl };
  if (process.env.OPENAI_API_KEY && process.env.REN_MODEL) {
    const baseUrl = validateVisionEndpoint(process.env.REN_API_BASE || "https://api.openai.com/v1");
    return { mode: "environment", model: process.env.REN_MODEL, host: new URL(baseUrl).host, baseUrl };
  }
  return { mode: "demo", model: "", host: "", baseUrl: "https://api.openai.com/v1" };
}

export async function saveVisionSettings(value: unknown): Promise<VisionStatus> {
  if (!value || typeof value !== "object") throw new Error("Invalid provider settings.");
  const input = value as Record<string, unknown>;
  if (typeof input.apiKey !== "string" || input.apiKey.length > 500 || /[\r\n]/.test(input.apiKey)) throw new Error("Enter a valid API key.");
  if (typeof input.model !== "string" || typeof input.baseUrl !== "string") throw new Error("Enter the model and provider URL.");
  const model = validateModel(input.model);
  const baseUrl = validateVisionEndpoint(input.baseUrl);
  const previous = await readStored();
  if (!input.apiKey.trim() && !previous) throw new Error("Enter an API key.");
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Secure key storage is unavailable on this computer.");
  if (process.platform === "linux" && !["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(safeStorage.getSelectedStorageBackend())) {
    throw new Error("A system keyring is required before Ren can save an API key on Linux.");
  }
  const encryptedKey = input.apiKey.trim()
    ? (await safeStorage.encryptStringAsync(input.apiKey.trim())).toString("base64")
    : previous!.encryptedKey;
  const saved: StoredVision = { version: 1, model, baseUrl, encryptedKey };
  const path = settingsPath();
  const temporary = `${path}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(saved), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error("Could not save the vision provider settings.");
  }
  return { mode: "connected", model, host: new URL(baseUrl).host, baseUrl };
}

export async function clearVisionSettings(): Promise<VisionStatus> {
  await unlink(settingsPath()).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  return visionStatus();
}

export async function visionCredentials(): Promise<VisionCredentials | null> {
  const stored = await readStored();
  if (stored) {
    const decrypted = await safeStorage.decryptStringAsync(Buffer.from(stored.encryptedKey, "base64"));
    return { apiKey: decrypted.result, model: stored.model, baseUrl: stored.baseUrl };
  }
  if (process.env.OPENAI_API_KEY && process.env.REN_MODEL) return {
    apiKey: process.env.OPENAI_API_KEY,
    model: validateModel(process.env.REN_MODEL),
    baseUrl: validateVisionEndpoint(process.env.REN_API_BASE || "https://api.openai.com/v1"),
  };
  return null;
}
