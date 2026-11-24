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
let chunks: Float32Array[] | null = null;
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
    chunks = [];
    sampleCount = 0;
    return true;
  } catch {
    stopSpeech();
    return false;
  }
}

export function feedSpeech(samples: unknown) {
  if (!chunks || !Array.isArray(samples) || samples.length === 0 || samples.length > 8192) return false;
  if (!samples.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1)) return false;
  const input = Float32Array.from(samples);
  const audio = resampler ? resampler.resample(input) : input;
  if (sampleCount + audio.length > maxSamples) return false;
  chunks.push(audio);
  sampleCount += audio.length;
  return true;
}

export function stopSpeech() {
  chunks = null;
  sampleCount = 0;
  resampler = null;
}

export function finishSpeech() {
  if (!chunks) return "";
  try {
    const tail = resampler?.flush(new Float32Array(0));
    if (tail?.length) { chunks.push(tail); sampleCount += tail.length; }
    if (sampleCount < 16_000 * 0.35) return "";
    if (!recognizer) {
      const sherpa = require("sherpa-onnx-node");
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
    const stream = recognizer.createStream();
    for (const chunk of chunks) {
      stream.acceptWaveform({ samples: chunk, sampleRate: 16_000 });
      while (recognizer.isReady(stream)) recognizer.decode(stream);
    }
    stream.inputFinished();
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    return recognizer.getResult(stream).text.trim();
  } finally {
    stopSpeech();
  }
}
