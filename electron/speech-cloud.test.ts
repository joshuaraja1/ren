// @vitest-environment node
import { vi } from "vitest";

const state = vi.hoisted(() => ({ key: "test-key", sockets: [] as Array<{ sent: unknown[]; emit: (name: string, value?: unknown) => void; close: () => void }> }));
vi.mock("./deepgram-settings.js", () => ({ deepgramKey: async () => state.key }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class Socket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    sent: unknown[] = [];
    constructor(public url: URL, public options: { headers: { Authorization: string } }) {
      super();
      state.sockets.push(this);
      queueMicrotask(() => this.emit("open"));
    }
    send(value: unknown) { this.sent.push(value); }
    close() { this.readyState = 3; this.emit("close"); }
  }
  return { default: Socket };
});
import { feedSpeech, finishSpeech, speechAvailable, startSpeech, stopSpeech } from "./speech.js";

describe("Deepgram dictation", () => {
  afterEach(async () => { await stopSpeech(); state.sockets.length = 0; state.key = "test-key"; });
  it("streams PCM after wake and finishes on a Deepgram turn", async () => {
    expect(await speechAvailable()).toBe(true);
    expect(await startSpeech(48000)).toBe(true);
    const socket = state.sockets[0];
    expect(await feedSpeech([-1, 0, 1])).toBe(true);
    expect(Buffer.isBuffer(socket.sent[0])).toBe(true);
    expect((socket.sent[0] as Buffer).readInt16LE(0)).toBe(-32768);
    const result = finishSpeech();
    expect(socket.sent[1]).toBe(JSON.stringify({ type: "ForceEndTurn" }));
    socket.emit("message", JSON.stringify({ type: "TurnInfo", event: "EndOfTurn", transcript: "Explain my screen" }));
    await expect(result).resolves.toBe("Explain my screen");
  });
  it("stays unavailable without a key", async () => {
    state.key = "";
    expect(await speechAvailable()).toBe(false);
    expect(await startSpeech(48000)).toBe(false);
    expect(state.sockets).toHaveLength(0);
  });
});
