// @vitest-environment node
import { vi } from "vitest";

vi.mock("./deepgram-settings.js", () => ({ deepgramKey: async () => "test-key" }));
import { streamWithDeepgram } from "./deepgram-tts.js";

describe("Deepgram speech streaming", () => {
  it("delivers the first audio chunk before the response finishes", async () => {
    let releaseLastChunk!: () => void;
    const lastChunk = new Promise<void>((resolve) => { releaseLastChunk = resolve; });
    const seen: number[][] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]));
        await lastChunk;
        controller.enqueue(Uint8Array.from([3]));
        controller.close();
      },
    }), { status: 200 }));
    try {
      const result = streamWithDeepgram("Hello", (chunk) => seen.push([...chunk]));
      await vi.waitFor(() => expect(seen).toEqual([[1, 2]]));
      releaseLastChunk();
      await result;
      expect(seen).toEqual([[1, 2], [3]]);
      expect(fetchMock.mock.calls[0][0]).toContain("encoding=mp3");
    } finally {
      releaseLastChunk();
      fetchMock.mockRestore();
    }
  });
});
