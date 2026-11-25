// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.REN_TEST_DEEPGRAM_DIR },
  safeStorage: {
    getSelectedStorageBackend: () => "gnome_libsecret",
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (text: string) => Buffer.from(`encrypted:${text}`),
    decryptStringAsync: async (value: Buffer) => ({ result: value.toString().slice("encrypted:".length) }),
  },
}));
import { clearDeepgramKey, deepgramKey, deepgramStatus, saveDeepgramKey } from "./deepgram-settings";

it("keeps a Deepgram key encrypted and out of renderer status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ren-deepgram-"));
  process.env.REN_TEST_DEEPGRAM_DIR = directory;
  try {
    expect(await deepgramStatus()).toEqual({ mode: "demo" });
    expect(await saveDeepgramKey("dg-test-secret")).toEqual({ mode: "connected" });
    const stored = await readFile(join(directory, "deepgram-key.json"), "utf8");
    expect(stored).not.toContain("dg-test-secret");
    expect(await deepgramKey()).toBe("dg-test-secret");
    expect(await deepgramStatus()).toEqual({ mode: "connected" });
    expect(await clearDeepgramKey()).toEqual({ mode: "demo" });
  } finally {
    delete process.env.REN_TEST_DEEPGRAM_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
