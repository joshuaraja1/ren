import { app } from "electron";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

type Stream = {
  acceptWaveform(value: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
};
type Recognizer = {
  createStream(): Stream;
  isReady(stream: Stream): boolean;
  decode(stream: Stream): void;
  getResult(stream: Stream): { text: string };
};
type Resampler = { resample(samples: Float32Array): Float32Array; flush(samples: Float32Array): Float32Array };

const require = createRequire(import.meta.url);
const maxSamples = 16_000 * 30;
let recognizer: Recognizer | null = null;
let stream: Stream | null = null;
let sampleCount = 0;
let resampler: Resampler | null = null;

function modelPath() {
  return app.isPackaged ? join(process.resourcesPath, "ren-asr") : join(app.getAppPath(), "models/ren-asr");
}

export function speechAvailable() {
  const path = modelPath();
  return ["encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"].every((file) => existsSync(join(path, file)));
}

export function startSpeech(sampleRate: number) {
  if (!speechAvailable() || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) return false;
  try {
    const sherpa = require("sherpa-onnx-node");
    resampler = sampleRate === 16_000 ? null : new sherpa.LinearResampler(sampleRate, 16_000) as Resampler;
    if (!recognizer) {
      const path = modelPath();
      recognizer = new sherpa.OnlineRecognizer({
        featConfig: { sampleRate: 16_000, featureDim: 80 },
        modelConfig: {
          transducer: { encoder: join(path, "encoder.onnx"), decoder: join(path, "decoder.onnx"), joiner: join(path, "joiner.onnx") },
          tokens: join(path, "tokens.txt"), numThreads: 2, provider: "cpu", debug: 0,
        },
        decodingMethod: "greedy_search",
      }) as Recognizer;
    }
    stream = recognizer!.createStream();
    sampleCount = 0;
    return true;
  } catch {
    stopSpeech();
    return false;
  }
}

export function feedSpeech(samples: unknown) {
  if (!stream || !recognizer || !Array.isArray(samples) || samples.length === 0 || samples.length > 8192) return false;
  if (!samples.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1)) return false;
  const input = Float32Array.from(samples);
  const audio = resampler ? resampler.resample(input) : input;
  if (sampleCount + audio.length > maxSamples) return false;
  stream.acceptWaveform({ samples: audio, sampleRate: 16_000 });
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  sampleCount += audio.length;
  return true;
}

export function stopSpeech() {
  stream = null;
  sampleCount = 0;
  resampler = null;
}

export function finishSpeech() {
  if (!stream || !recognizer) return "";
  try {
    const tail = resampler?.flush(new Float32Array(0));
    if (tail?.length) {
      stream.acceptWaveform({ samples: tail, sampleRate: 16_000 });
      sampleCount += tail.length;
    }
    if (sampleCount < 16_000 * 0.35) return "";
    stream.inputFinished();
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    return recognizer.getResult(stream).text.trim();
  } finally {
    stopSpeech();
  }
}
