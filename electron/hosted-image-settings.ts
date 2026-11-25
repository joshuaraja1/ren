import { app, safeStorage } from "electron";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateVisionEndpoint } from "./vision-settings.js";

export type HostedImageCredentials = { baseUrl: string; accessToken: string };
export type HostedImageStatus = { mode: "connected" | "environment" | "demo"; baseUrl: string; host: string };
const path = () => join(app.getPath("userData"), "hosted-image-service.json");

export function validateHostedEndpoint(value: string) {
  const baseUrl = validateVisionEndpoint(value);
  if (new URL(baseUrl).pathname !== "/v1") throw new Error("The Ren image service URL must end in /v1.");
  return baseUrl;
}

async function readSaved(): Promise<HostedImageCredentials | null> {
  let raw: string;
  try { raw = await readFile(path(), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("Could not read the image service settings."); }
  try {
    const stored = JSON.parse(raw) as { version?: unknown; encrypted?: unknown };
    if (stored.version !== 1 || typeof stored.encrypted !== "string") throw new Error("Invalid settings");
    const value = JSON.parse((await safeStorage.decryptStringAsync(Buffer.from(stored.encrypted, "base64"))).result) as Partial<HostedImageCredentials>;
    if (typeof value.baseUrl !== "string" || typeof value.accessToken !== "string" || !value.accessToken) throw new Error("Invalid settings");
    return { baseUrl: validateHostedEndpoint(value.baseUrl), accessToken: value.accessToken };
  } catch { throw new Error("Could not unlock the hosted image service. Reconnect it in Ren settings."); }
}

export async function hostedImageCredentials(): Promise<HostedImageCredentials | null> {
  const saved = await readSaved();
  if (saved) return saved;
  if (process.env.REN_IMAGE_SERVICE_URL && process.env.REN_IMAGE_ACCESS_TOKEN) return {
    baseUrl: validateHostedEndpoint(process.env.REN_IMAGE_SERVICE_URL), accessToken: process.env.REN_IMAGE_ACCESS_TOKEN,
  };
  return null;
}

export async function hostedImageStatus(): Promise<HostedImageStatus> {
  const saved = await readSaved();
  if (saved) return { mode: "connected", baseUrl: saved.baseUrl, host: new URL(saved.baseUrl).host };
  if (process.env.REN_IMAGE_SERVICE_URL && process.env.REN_IMAGE_ACCESS_TOKEN) {
    const baseUrl = validateHostedEndpoint(process.env.REN_IMAGE_SERVICE_URL);
    return { mode: "environment", baseUrl, host: new URL(baseUrl).host };
  }
  return { mode: "demo", baseUrl: "", host: "" };
}

export async function saveHostedImageSettings(value: unknown): Promise<HostedImageStatus> {
  if (!value || typeof value !== "object") throw new Error("Invalid image service settings.");
  const input = value as Record<string, unknown>;
  if (typeof input.baseUrl !== "string" || typeof input.accessToken !== "string" || input.accessToken.length > 500 || /[\r\n]/.test(input.accessToken)) throw new Error("Enter a valid Ren access token and service URL.");
  const baseUrl = validateHostedEndpoint(input.baseUrl);
  if (input.accessToken.trim() && !/^[A-Za-z0-9_-]{32,256}$/.test(input.accessToken.trim())) throw new Error("Enter a valid Ren access token.");
  const old = input.accessToken.trim() ? null : await readSaved();
  const accessToken = input.accessToken.trim() || (old?.baseUrl === baseUrl ? old.accessToken : "");
  if (!accessToken) throw new Error("Enter a Ren access token.");
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Secure token storage is unavailable on this computer.");
  if (process.platform === "linux" && !["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(safeStorage.getSelectedStorageBackend())) throw new Error("A system keyring is required to save a Ren access token on Linux.");
  const encrypted = (await safeStorage.encryptStringAsync(JSON.stringify({ baseUrl, accessToken }))).toString("base64");
  const temporary = `${path()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, encrypted }), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path());
  } catch { await unlink(temporary).catch(() => {}); throw new Error("Could not save the image service settings."); }
  return { mode: "connected", baseUrl, host: new URL(baseUrl).host };
}

export async function clearHostedImageSettings(): Promise<HostedImageStatus> {
  await unlink(path()).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  return hostedImageStatus();
}
