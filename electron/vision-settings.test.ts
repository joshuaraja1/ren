// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.REN_TEST_SETTINGS_DIR },
  safeStorage: {
    getSelectedStorageBackend: () => "gnome_libsecret",
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (text: string) => Buffer.from(`encrypted:${text}`),
    decryptStringAsync: async (value: Buffer) => ({ result: value.toString().slice("encrypted:".length), shouldReEncrypt: false }),
  },
}));

import { clearVisionSettings, saveVisionSettings, validateVisionEndpoint, visionCredentials, visionStatus } from "./vision-settings";

describe("vision provider settings", () => {
  it("stores the key as encrypted bytes and never returns it in status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ren-vision-"));
    process.env.REN_TEST_SETTINGS_DIR = directory;
    try {
      const status = await saveVisionSettings({ apiKey: "secret-test-key", model: "vision-model", baseUrl: "https://api.openai.com/v1" });
      expect(status).toEqual({ mode: "connected", model: "vision-model", host: "api.openai.com", baseUrl: "https://api.openai.com/v1" });
      const saved = await readFile(join(directory, "vision-provider.json"), "utf8");
      expect(saved).not.toContain("secret-test-key");
      expect(saved).not.toContain("api.openai.com");
      expect(saved).not.toContain("vision-model");
      expect(JSON.parse(saved).version).toBe(2);
      expect((await visionCredentials())?.apiKey).toBe("secret-test-key");
      expect(await visionStatus()).toEqual(status);
      await clearVisionSettings();
    } finally {
      delete process.env.REN_TEST_SETTINGS_DIR;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps the OpenAI destination bound to its encrypted key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ren-vision-"));
    process.env.REN_TEST_SETTINGS_DIR = directory;
    try {
      await saveVisionSettings({ apiKey: "secret-test-key", model: "vision-model", baseUrl: "https://api.openai.com/v1" });
      const path = join(directory, "vision-provider.json");
      const saved = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, JSON.stringify({ ...saved, baseUrl: "https://attacker.example/v1" }));
      expect(await visionCredentials()).toEqual({ apiKey: "secret-test-key", model: "vision-model", baseUrl: "https://api.openai.com/v1" });
      await writeFile(path, JSON.stringify({ version: 2, encryptedConfig: Buffer.from("encrypted:bad-json").toString("base64") }));
      await expect(visionCredentials()).rejects.toThrow(/unlock the saved vision provider/);
      await saveVisionSettings({ apiKey: "replacement-key", model: "vision-model", baseUrl: "https://api.openai.com/v1" });
      expect((await visionCredentials())?.apiKey).toBe("replacement-key");
    } finally {
      delete process.env.REN_TEST_SETTINGS_DIR;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates a legacy key and destination into one encrypted payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ren-vision-"));
    process.env.REN_TEST_SETTINGS_DIR = directory;
    try {
      const path = join(directory, "vision-provider.json");
      await writeFile(path, JSON.stringify({ version: 1, encryptedKey: Buffer.from("encrypted:old-key").toString("base64"), model: "old-model", baseUrl: "https://api.openai.com/v1" }));
      expect(await visionCredentials()).toEqual({ apiKey: "old-key", model: "old-model", baseUrl: "https://api.openai.com/v1" });
      const saved = await readFile(path, "utf8");
      expect(JSON.parse(saved).version).toBe(2);
      expect(saved).not.toContain("api.openai.com");
    } finally {
      delete process.env.REN_TEST_SETTINGS_DIR;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects nonlocal unencrypted endpoints", () => {
    expect(() => validateVisionEndpoint("http://example.com/v1")).toThrow(/HTTPS/);
    expect(validateVisionEndpoint("http://localhost:1234/v1")).toBe("http://localhost:1234/v1");
  });

  it("does not autodetect Ollama and rejects a local model", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ren-vision-"));
    process.env.REN_TEST_SETTINGS_DIR = directory;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "qwen3.5:2b", capabilities: ["vision"] }] }))) as typeof fetch;
    try {
      expect(await visionStatus()).toEqual({ mode: "demo", model: "gpt-6-sol", host: "", baseUrl: "https://api.openai.com/v1" });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      await expect(saveVisionSettings({ apiKey: "ollama", model: "qwen3.5:2b", baseUrl: "http://127.0.0.1:11434/v1" })).rejects.toThrow(/OpenAI API/);
      expect(await visionCredentials()).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.REN_TEST_SETTINGS_DIR;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("upgrades the saved mini default while preserving the encrypted key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ren-vision-"));
    process.env.REN_TEST_SETTINGS_DIR = directory;
    try {
      await saveVisionSettings({ apiKey: "secret-test-key", model: "gpt-5.4-mini", baseUrl: "https://api.openai.com/v1" });
      expect(await visionStatus()).toEqual({ mode: "connected", model: "gpt-6-sol", host: "api.openai.com", baseUrl: "https://api.openai.com/v1" });
      expect(await visionCredentials()).toEqual({ apiKey: "secret-test-key", model: "gpt-6-sol", baseUrl: "https://api.openai.com/v1" });
      await saveVisionSettings({ apiKey: "secret-test-key", model: "gpt-6.2-sol", baseUrl: "https://api.openai.com/v1" });
      expect((await visionCredentials())?.model).toBe("gpt-6-sol");
      expect(await readFile(join(directory, "vision-provider.json"), "utf8")).not.toContain("secret-test-key");
    } finally {
      delete process.env.REN_TEST_SETTINGS_DIR;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
