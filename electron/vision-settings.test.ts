// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
      const status = await saveVisionSettings({ apiKey: "secret-test-key", model: "vision-model", baseUrl: "https://example.com/v1" });
      expect(status).toEqual({ mode: "connected", model: "vision-model", host: "example.com", baseUrl: "https://example.com/v1" });
      expect(await readFile(join(directory, "vision-provider.json"), "utf8")).not.toContain("secret-test-key");
      expect((await visionCredentials())?.apiKey).toBe("secret-test-key");
      expect(await visionStatus()).toEqual(status);
      await clearVisionSettings();
    } finally {
      delete process.env.REN_TEST_SETTINGS_DIR;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects nonlocal unencrypted endpoints", () => {
    expect(() => validateVisionEndpoint("http://example.com/v1")).toThrow(/HTTPS/);
    expect(validateVisionEndpoint("http://localhost:1234/v1")).toBe("http://localhost:1234/v1");
  });
});
