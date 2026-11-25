import { vi } from "vitest";
import { PcmStreamPlayer } from "./pcm-player";

function fakeAudioContext() {
  const sources: Array<{ onended: (() => void) | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const channels: Float32Array[] = [];
  const context = {
    currentTime: 0,
    destination: {},
    createBuffer: (_channels: number, samples: number) => {
      const channel = new Float32Array(samples);
      channels.push(channel);
      return { duration: samples / 24_000, getChannelData: () => channel };
    },
    createBufferSource: () => {
      const source = { onended: null, buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(source);
      return source;
    },
    close: vi.fn(async () => {}),
  };
  return { context: context as unknown as AudioContext, sources, channels };
}

describe("PCM speech playback", () => {
  it("keeps playing as later chunks arrive and finishes only after the final buffer", () => {
    const { context, sources } = fakeAudioContext();
    const ended = vi.fn();
    const player = new PcmStreamPlayer(context, ended);
    player.push(new Uint8Array(4096));
    expect(sources).toHaveLength(1);
    sources[0].onended?.();
    expect(ended).not.toHaveBeenCalled();
    player.push(new Uint8Array(2));
    player.complete();
    expect(sources).toHaveLength(2);
    sources[1].onended?.();
    expect(ended).toHaveBeenCalledOnce();
    player.dispose();
  });

  it("joins split PCM samples and decodes signed little-endian audio", () => {
    const { context, channels } = fakeAudioContext();
    const player = new PcmStreamPlayer(context, () => {});
    player.push(Uint8Array.from([0, 128, 255]));
    player.push(Uint8Array.from([127]));
    player.complete();
    expect([...channels[0]]).toEqual([-1, 32767 / 32768]);
    player.dispose();
  });
});
