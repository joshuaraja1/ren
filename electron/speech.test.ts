// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SpeechEngine } from "./speech-engine";

describe("bundled local dictation", () => {
  it("transcribes the publisher's English speech sample without a network call", () => {
    const wav = readFileSync(join(process.cwd(), "test/fixtures/english.wav"));
    const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, index) => wav.readInt16LE(44 + index * 2) / 32768);
    const engine = new SpeechEngine(join(process.cwd(), "models/ren-asr"));
    expect(engine.start(16_000)).toBe(true);
    for (let offset = 0; offset < samples.length; offset += 2048) expect(engine.feed(samples.slice(offset, offset + 2048))).toBe(true);
    const transcript = engine.finish().toLowerCase();
    expect(transcript).toContain("yellow lamps would light up");
    engine.stop();
  });
});
