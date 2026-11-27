import { app } from "electron";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

type Stream = { acceptWaveform(value: { samples: Float32Array; sampleRate: number }): void };
type Spotter = {
  createStream(): Stream;
  isReady(stream: Stream): boolean;
  decode(stream: Stream): void;
  getResult(stream: Stream): { keyword: string };
  reset(stream: Stream): void;
};
type Resampler = { resample(samples: Float32Array): Float32Array };

const require = createRequire(import.meta.url);
let spotter: Spotter | null = null;
let stream: Stream | null = null;
let resampler: Resampler | null = null;
let lastWake = 0;

export function wakeAvailable() {
  const path = app.isPackaged ? join(process.resourcesPath, "ren-kws") : join(app.getAppPath(), "models/ren-kws");
  return ["encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt", "keywords.txt"].every((file) => existsSync(join(path, file)));
}

export function startWake(sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !wakeAvailable()) return false;
  const model = app.isPackaged ? join(process.resourcesPath, "ren-kws") : join(app.getAppPath(), "models/ren-kws");
  try {
    const sherpa = require("sherpa-onnx-node");
    spotter = new sherpa.KeywordSpotter({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: { encoder: join(model, "encoder.onnx"), decoder: join(model, "decoder.onnx"), joiner: join(model, "joiner.onnx") },
        tokens: join(model, "tokens.txt"), numThreads: 1, provider: "cpu", debug: 0,
      },
      keywordsFile: join(model, "keywords.txt"),
      keywordsThreshold: 0.75,
    }) as Spotter;
    stream = spotter.createStream();
    resampler = sampleRate === 16000 ? null : new sherpa.LinearResampler(sampleRate, 16000) as Resampler;
    return true;
  } catch {
    spotter = null; stream = null; resampler = null;
    return false;
  }
}

export function feedWake(samples: unknown) {
  if (!spotter || !stream || !Array.isArray(samples) || samples.length > 8192 || samples.length === 0) return false;
  if (!samples.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1)) return false;
  const audio = Float32Array.from(samples);
  stream.acceptWaveform({ samples: resampler ? resampler.resample(audio) : audio, sampleRate: 16000 });
  while (spotter.isReady(stream)) spotter.decode(stream);
  const detected = spotter.getResult(stream).keyword;
  if (!detected) return false;
  spotter.reset(stream);
  const now = Date.now();
  if (now - lastWake < 2500) return false;
  lastWake = now;
  return true;
}

export function stopWake() { spotter = null; stream = null; resampler = null; }
