import { app, safeStorage } from "electron";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type DeepgramStatus = { mode: "connected" | "environment" | "demo" };
const settingsPath = () => join(app.getPath("userData"), "deepgram-key.json");

async function savedKey(): Promise<string | null> {
  let raw: string;
  try { raw = await readFile(settingsPath(), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("Could not read Deepgram settings."); }
  try {
    const saved = JSON.parse(raw) as { version?: unknown; encrypted?: unknown };
    if (saved.version !== 1 || typeof saved.encrypted !== "string") throw new Error("Invalid settings");
    const key = (await safeStorage.decryptStringAsync(Buffer.from(saved.encrypted, "base64"))).result;
    if (!key || /[\r\n]/.test(key)) throw new Error("Invalid key");
    return key;
  } catch { throw new Error("Could not unlock the Deepgram key. Reconnect it in Ren settings."); }
}

export async function deepgramKey(): Promise<string | null> {
  return await savedKey() || process.env.DEEPGRAM_API_KEY || null;
}

export async function deepgramStatus(): Promise<DeepgramStatus> {
  if (await savedKey()) return { mode: "connected" };
  return { mode: process.env.DEEPGRAM_API_KEY ? "environment" : "demo" };
}

export async function saveDeepgramKey(value: unknown): Promise<DeepgramStatus> {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\r\n]/.test(value)) throw new Error("Enter a valid Deepgram API key.");
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Secure key storage is unavailable on this computer.");
  if (process.platform === "linux" && !["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(safeStorage.getSelectedStorageBackend())) throw new Error("A system keyring is required to save a Deepgram key on Linux.");
  const encrypted = (await safeStorage.encryptStringAsync(value.trim())).toString("base64");
  const temporary = `${settingsPath()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, encrypted }), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, settingsPath());
  } catch { await unlink(temporary).catch(() => {}); throw new Error("Could not save the Deepgram key."); }
  return { mode: "connected" };
}

export async function clearDeepgramKey(): Promise<DeepgramStatus> {
  await unlink(settingsPath()).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  return deepgramStatus();
}
