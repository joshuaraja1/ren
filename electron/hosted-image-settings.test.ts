// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.REN_TEST_HOSTED_DIR },
  safeStorage: {
    getSelectedStorageBackend: () => "gnome_libsecret",
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => Buffer.from(`encrypted:${value}`),
    decryptStringAsync: async (value: Buffer) => ({ result: value.toString().slice("encrypted:".length) }),
  },
}));

import { clearHostedImageSettings, hostedImageCredentials, hostedImageStatus, saveHostedImageSettings, validateHostedEndpoint } from "./hosted-image-settings.js";

it("saves the Ren access token encrypted and binds it to its endpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ren-hosted-"));
  process.env.REN_TEST_HOSTED_DIR = directory;
  try {
    const status = await saveHostedImageSettings({ baseUrl: "https://images.ren.example/v1", accessToken: "private-ren-access-token-0123456789" });
    expect(status).toEqual({ mode: "connected", baseUrl: "https://images.ren.example/v1", host: "images.ren.example" });
    const raw = await readFile(join(directory, "hosted-image-service.json"), "utf8");
    expect(raw).not.toContain("private-ren-access-token");
    expect(raw).not.toContain("images.ren.example");
    expect(await hostedImageCredentials()).toEqual({ baseUrl: "https://images.ren.example/v1", accessToken: "private-ren-access-token-0123456789" });
    await expect(saveHostedImageSettings({ baseUrl: "https://other.example/v1", accessToken: "" })).rejects.toThrow("access token");
    expect(await hostedImageStatus()).toEqual(status);
    await clearHostedImageSettings();
    expect((await hostedImageStatus()).mode).toBe("demo");
  } finally {
    delete process.env.REN_TEST_HOSTED_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});

it("requires HTTPS off loopback and the versioned path", () => {
  expect(validateHostedEndpoint("https://images.ren.example/v1")).toBe("https://images.ren.example/v1");
  expect(validateHostedEndpoint("http://127.0.0.1:8080/v1")).toBe("http://127.0.0.1:8080/v1");
  expect(() => validateHostedEndpoint("http://images.ren.example/v1")).toThrow("HTTPS");
  expect(() => validateHostedEndpoint("https://images.ren.example/other")).toThrow("/v1");
});
