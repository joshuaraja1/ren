import { SpeechEngine } from "./speech-engine.js";

type Command = { id: number; type: "start"; modelPath: string; sampleRate: number }
  | { id: number; type: "feed"; samples: unknown }
  | { id: number; type: "finish" | "stop" };
type Parent = { on(event: "message", listener: (event: { data: Command }) => void): void; postMessage(message: { id: number; result?: unknown; error?: string }): void };

const parent = (process as unknown as { parentPort: Parent }).parentPort;
let engine: SpeechEngine | null = null;

parent.on("message", ({ data }) => {
  try {
    let result: unknown;
    switch (data.type) {
      case "start": engine ??= new SpeechEngine(data.modelPath); result = engine.start(data.sampleRate); break;
      case "feed": result = engine?.feed(data.samples) ?? false; break;
      case "finish": result = engine?.finish() ?? ""; break;
      case "stop": engine?.stop(); result = true; break;
    }
    parent.postMessage({ id: data.id, result });
  } catch {
    parent.postMessage({ id: data.id, error: "Local speech recognition failed." });
  }
});
