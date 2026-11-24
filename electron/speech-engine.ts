import { createRequire } from "node:module";
import { join } from "node:path";

type Stream = { acceptWaveform(value: { samples: Float32Array; sampleRate: number }): void; inputFinished(): void };
type Recognizer = { createStream(): Stream; isReady(stream: Stream): boolean; decode(stream: Stream): void; getResult(stream: Stream): { text: string } };
type Resampler = { resample(samples: Float32Array): Float32Array; flush(samples: Float32Array): Float32Array };

const require = createRequire(import.meta.url);
const maxSamples = 16_000 * 30;

export class SpeechEngine {
  private recognizer: Recognizer | null = null;
  private stream: Stream | null = null;
  private resampler: Resampler | null = null;
  private sampleCount = 0;

  constructor(private readonly modelPath: string) {}

  start(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) return false;
    try {
      const sherpa = require("sherpa-onnx-node");
      this.resampler = sampleRate === 16_000 ? null : new sherpa.LinearResampler(sampleRate, 16_000) as Resampler;
      if (!this.recognizer) {
        this.recognizer = new sherpa.OnlineRecognizer({
          featConfig: { sampleRate: 16_000, featureDim: 80 },
          modelConfig: {
            transducer: { encoder: join(this.modelPath, "encoder.onnx"), decoder: join(this.modelPath, "decoder.onnx"), joiner: join(this.modelPath, "joiner.onnx") },
            tokens: join(this.modelPath, "tokens.txt"), numThreads: 2, provider: "cpu", debug: 0,
          },
          decodingMethod: "greedy_search",
        }) as Recognizer;
      }
      this.stream = this.recognizer!.createStream();
      this.sampleCount = 0;
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  feed(samples: unknown) {
    if (!this.stream || !this.recognizer || !Array.isArray(samples) || samples.length === 0 || samples.length > 8192) return false;
    if (!samples.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1)) return false;
    const audio = this.resampler ? this.resampler.resample(Float32Array.from(samples)) : Float32Array.from(samples);
    if (this.sampleCount + audio.length > maxSamples) return false;
    this.stream.acceptWaveform({ samples: audio, sampleRate: 16_000 });
    while (this.recognizer.isReady(this.stream)) this.recognizer.decode(this.stream);
    this.sampleCount += audio.length;
    return true;
  }

  finish() {
    if (!this.stream || !this.recognizer) return "";
    try {
      const tail = this.resampler?.flush(new Float32Array(0));
      if (tail?.length) { this.stream.acceptWaveform({ samples: tail, sampleRate: 16_000 }); this.sampleCount += tail.length; }
      if (this.sampleCount < 16_000 * 0.35) return "";
      this.stream.inputFinished();
      while (this.recognizer.isReady(this.stream)) this.recognizer.decode(this.stream);
      return this.recognizer.getResult(this.stream).text.trim();
    } finally { this.stop(); }
  }

  stop() { this.stream = null; this.resampler = null; this.sampleCount = 0; }
}
