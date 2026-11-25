import { app, safeStorage } from "electron";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type VisionCredentials = { apiKey: string; model: string; baseUrl: string };
export type VisionStatus = { mode: "connected" | "environment" | "demo"; model: string; host: string; baseUrl: string };
const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-6.2-sol";
const PREVIOUS_DEFAULT_MODEL = "gpt-5.4-mini";

type StoredVision =
  | { version: 1; model: string; baseUrl: string; encryptedKey: string }
  | { version: 2; encryptedConfig: string };

function settingsPath() { return join(app.getPath("userData"), "vision-provider.json"); }

export function validateVisionEndpoint(raw: string) {
  const url = new URL(raw.trim());
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTPS provider URL, or HTTP on localhost.");
  return url.toString().replace(/\/$/, "");
}
function openAIEndpoint(raw: string) {
  if (validateVisionEndpoint(raw) !== OPENAI_BASE) throw new Error("Ren uses the OpenAI API at api.openai.com.");
  return OPENAI_BASE;
}

function validateModel(value: string) {
  const model = value.trim();
  if (!model || model.length > 120 || /\s/.test(model)) throw new Error("Enter a vision-capable model name.");
  return model;
}

async function readStored(): Promise<StoredVision | null> {
  try {
    const value = JSON.parse(await readFile(settingsPath(), "utf8")) as StoredVision;
    if ((value as { version?: number }).version === 3) return null;
    if (value.version === 2 && typeof value.encryptedConfig === "string") return value;
    if (value.version === 1 && typeof value.encryptedKey === "string" && typeof value.model === "string" && typeof value.baseUrl === "string") return value;
    throw new Error("Invalid provider settings");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Could not read the saved vision provider settings.");
  }
}

async function writeStored(saved: StoredVision) {
  const path = settingsPath();
  const temporary = `${path}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(saved), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => {});
    throw new Error("Could not save the vision provider settings.");
  }
}

async function encryptCredentials(credentials: VisionCredentials) {
  const encryptedConfig = (await safeStorage.encryptStringAsync(JSON.stringify(credentials))).toString("base64");
  await writeStored({ version: 2, encryptedConfig });
}

async function readCredentials(): Promise<VisionCredentials | null> {
  const stored = await readStored();
  if (!stored) return null;
  try {
    if (stored.version === 1) {
      const apiKey = (await safeStorage.decryptStringAsync(Buffer.from(stored.encryptedKey, "base64"))).result;
      const credentials = { apiKey, model: validateModel(stored.model) === PREVIOUS_DEFAULT_MODEL ? DEFAULT_MODEL : validateModel(stored.model), baseUrl: openAIEndpoint(stored.baseUrl) };
      await encryptCredentials(credentials);
      return credentials;
    }
    const decrypted = (await safeStorage.decryptStringAsync(Buffer.from(stored.encryptedConfig, "base64"))).result;
    const raw = JSON.parse(decrypted) as Partial<VisionCredentials>;
    if (typeof raw.apiKey !== "string" || !raw.apiKey || typeof raw.model !== "string" || typeof raw.baseUrl !== "string") throw new Error("Invalid provider credentials");
    const credentials = { apiKey: raw.apiKey, model: validateModel(raw.model), baseUrl: openAIEndpoint(raw.baseUrl) };
    if (credentials.model === PREVIOUS_DEFAULT_MODEL) {
      credentials.model = DEFAULT_MODEL;
      await encryptCredentials(credentials);
    }
    return credentials;
  } catch {
    throw new Error("Could not unlock the saved vision provider. Open AI settings to reconnect it.");
  }
}

export async function visionStatus(): Promise<VisionStatus> {
  const stored = await readCredentials();
  if (stored) return { mode: "connected", model: stored.model, host: "api.openai.com", baseUrl: OPENAI_BASE };
  if (process.env.OPENAI_API_KEY) return { mode: "environment", model: process.env.REN_MODEL || DEFAULT_MODEL, host: "api.openai.com", baseUrl: OPENAI_BASE };
  return { mode: "demo", model: DEFAULT_MODEL, host: "", baseUrl: OPENAI_BASE };
}

export async function saveVisionSettings(value: unknown): Promise<VisionStatus> {
  if (!value || typeof value !== "object") throw new Error("Invalid provider settings.");
  const input = value as Record<string, unknown>;
  if (typeof input.apiKey !== "string" || input.apiKey.length > 500 || /[\r\n]/.test(input.apiKey)) throw new Error("Enter a valid API key.");
  if (typeof input.model !== "string" || typeof input.baseUrl !== "string") throw new Error("Enter the model and provider URL.");
  const model = validateModel(input.model);
  const baseUrl = openAIEndpoint(input.baseUrl);
  const saved = input.apiKey.trim() ? null : await readCredentials();
  const previous = saved?.baseUrl === baseUrl ? saved : null;
  if (!input.apiKey.trim() && !previous) throw new Error("Enter an API key.");
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Secure key storage is unavailable on this computer.");
  if (process.platform === "linux" && !["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(safeStorage.getSelectedStorageBackend())) {
    throw new Error("A system keyring is required before Ren can save an API key on Linux.");
  }
  await encryptCredentials({ apiKey: input.apiKey.trim() || previous!.apiKey, model, baseUrl });
  return { mode: "connected", model, host: "api.openai.com", baseUrl };
}

export async function clearVisionSettings(): Promise<VisionStatus> {
  await unlink(settingsPath()).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  return visionStatus();
}

export async function visionCredentials(): Promise<VisionCredentials | null> {
  const stored = await readCredentials();
  if (stored) return stored;
  if (process.env.OPENAI_API_KEY) return {
    apiKey: process.env.OPENAI_API_KEY,
    model: validateModel(process.env.REN_MODEL || DEFAULT_MODEL),
    baseUrl: OPENAI_BASE,
  };
  return null;
}
