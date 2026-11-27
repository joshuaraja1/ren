import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AskResponse, RenBridge, VoiceMode } from "./contracts";
import type { AgentJobSnapshot } from "../electron/agent-jobs";

type AudioProcess = (event: { inputBuffer: { getChannelData(index: number): Float32Array } }) => void;

const originalAudioContext = globalThis.AudioContext;
const originalMediaDevices = navigator.mediaDevices;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function response(answer: string): AskResponse {
  return { answer, annotations: [], provider: "vision" };
}

function makeHarness(transcripts: string[], ask: RenBridge["ask"]) {
  let processAudio: AudioProcess | null = null;
  let activateVoice: (() => void) | null = null;
  let voiceModeChanged: ((mode: VoiceMode) => void) | null = null;
  let speechData: ((data: { id: string; chunk?: string; done?: boolean; error?: string }) => void) | null = null;
  let agentJobUpdate: ((snapshot: AgentJobSnapshot) => void) | null = null;
  const stoppedSources: Array<ReturnType<typeof vi.fn>> = [];
  const audioSources: Array<{ onended: (() => void) | null }> = [];

  class FakeAudioContext {
    sampleRate = 48_000;
    currentTime = 0;
    state = "running";
    destination = {};
    createMediaStreamSource() { return { connect() {} }; }
    createScriptProcessor() {
      return {
        connect() {}, disconnect() {},
        get onaudioprocess() { return processAudio; },
        set onaudioprocess(listener: AudioProcess | null) { processAudio = listener; },
      };
    }
    createBuffer(_channels: number, samples: number, sampleRate: number) {
      return { duration: samples / sampleRate, getChannelData: () => new Float32Array(samples) };
    }
    createBufferSource() {
      const stop = vi.fn();
      stoppedSources.push(stop);
      const source: { buffer: null; onended: (() => void) | null; connect(): void; disconnect(): void; start(): void; stop: typeof stop } =
        { buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop };
      audioSources.push(source);
      return source;
    }
    async resume() {}
    async close() {}
  }

  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
  });

  const speechStart = vi.fn(async () => true);
  const speechFeed = vi.fn(async () => true);
  const speechFinish = vi.fn(async () => transcripts.shift() ?? "");
  const wakeFeed = vi.fn(async (_samples: number[]) => false);
  const speechStop = vi.fn(async () => {});
  const cancelSpeech = vi.fn(async () => true);
  const cancelAsk = vi.fn(async () => true);
  const speak = vi.fn(async (_id: string, _text: string) => true);
  const captureContext = vi.fn(async () => ({ frames: [], pointer: { x: .5, y: .5 }, contextToken: "test-context" }));
  const runningJob: AgentJobSnapshot = {
    id: "job-one", task: "research electric motors", status: "running", stage: "researching",
    completedSteps: 0, totalSteps: 2, scope: "current screen + web",
  };
  const startAgentJob = vi.fn(async () => runningJob);
  const cancelAgentJob = vi.fn(async () => true);

  window.ren = {
    platform: "darwin",
    permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
    primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
    wakeAvailable: async () => true,
    wakeStart: async () => true,
    wakeStop: async () => {},
    wakeFeed,
    speechAvailable: async () => true,
    speechStart, speechFeed, speechFinish, speechStop,
    onSpeechData: (listener: typeof speechData) => { speechData = listener; return () => { speechData = null; }; },
    speak, cancelSpeech, cancelAsk, captureContext, ask, startAgentJob, cancelAgentJob,
    onAgentJobUpdate: (listener: typeof agentJobUpdate) => { agentJobUpdate = listener; return () => { agentJobUpdate = null; }; },
    onFocusSelection: () => () => {},
    onActivateVoice: (listener: () => void) => { activateVoice = listener; return () => { activateVoice = null; }; },
    onVoiceModeChanged: (listener: (mode: VoiceMode) => void) => { voiceModeChanged = listener; return () => { voiceModeChanged = null; }; },
    setExpanded: async () => {}, setCompanionVisible: async () => {},
  } as unknown as RenBridge;

  const frame = (level: number) => ({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(level) } });
  const feedFrames = (count: number, level = .03) => {
    act(() => { for (let index = 0; index < count; index += 1) processAudio?.(frame(level)); });
  };

  return {
    renderApp: () => render(<App />),
    speechStart, speechStop, speechFinish, wakeFeed, cancelSpeech, cancelAsk, speak, captureContext, stoppedSources, audioSources,
    startAgentJob, cancelAgentJob, runningJob,
    get processAudio() { return processAudio; },
    get speechData() { return speechData; },
    activate: () => act(() => { activateVoice?.(); }),
    setVoiceMode: (mode: VoiceMode) => act(() => { voiceModeChanged?.(mode); }),
    emitAgentJob: (snapshot: AgentJobSnapshot) => act(() => { agentJobUpdate?.(snapshot); }),
    feedFrames,
    silence: () => act(() => { processAudio?.(frame(0)); }),
  };
}

async function finishUtterance(harness: ReturnType<typeof makeHarness>, advance: () => void) {
  harness.feedFrames(3);
  advance();
  harness.silence();
}

afterEach(() => {
  window.ren = undefined;
  globalThis.AudioContext = originalAudioContext;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
  vi.restoreAllMocks();
});

describe("voice interruption and follow-ups", () => {
  it("ignores a false local wake hit from a show and answers only after Hey Ren is transcribed", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const ask = vi.fn(async () => response("The wheel turns on an axle."));
    const harness = makeHarness(["The show is still playing", "Hey Run, explain the wheel"], ask as RenBridge["ask"]);
    harness.wakeFeed.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.feedFrames(1);
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(1));
    now += 2_100;
    harness.silence();
    await waitFor(() => expect(harness.speechFinish).toHaveBeenCalledTimes(1));
    expect(ask).not.toHaveBeenCalled();
    expect(harness.speak).not.toHaveBeenCalled();

    harness.feedFrames(1);
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(2));
    now += 2_100;
    harness.silence();
    await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "explain the wheel" })));
  });

  it("keeps consecutive wake audio while the detector is processing", async () => {
    const first = deferred<boolean>();
    const harness = makeHarness([], vi.fn(async () => response("unused")) as RenBridge["ask"]);
    harness.wakeFeed.mockImplementationOnce(() => first.promise);
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.feedFrames(1);
    await waitFor(() => expect(harness.wakeFeed).toHaveBeenCalledTimes(1));
    harness.feedFrames(4);
    expect(harness.wakeFeed).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(false));
    await waitFor(() => expect(harness.wakeFeed).toHaveBeenCalledTimes(2));
    expect(harness.wakeFeed.mock.calls[1][0]).toHaveLength(8192);
  });

  it("accepts a contextual follow-up after Hey Ren, then returns to wake-only after silence", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const sessionTimeouts: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, timeout, ...args) => {
      if (timeout === 15_000 && typeof handler === "function") {
        sessionTimeouts.push(() => (handler as (...values: unknown[]) => void)(...args));
        return 0 as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(handler, timeout, ...args);
    });
    const ask = vi.fn(async ({ question }: { question: string }) => response(
      question.toLowerCase() === "explain the engine" ? "The engine drives the fan." : "It moves air downward.",
    ));
    const harness = makeHarness(["Hey Ren, explain the engine", "And the fan?"], ask as RenBridge["ask"]);
    harness.wakeFeed.mockResolvedValueOnce(true);
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.feedFrames(1);
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledOnce());
    now += 2_100;
    harness.silence();
    await waitFor(() => expect(harness.speak).toHaveBeenCalledOnce());
    const [firstSpeechID] = harness.speak.mock.calls[0];
    act(() => { harness.speechData?.({ id: firstSpeechID, chunk: btoa("\0".repeat(4096)), done: true }); });
    act(() => { harness.audioSources[0].onended?.(); });
    await waitFor(() => expect(sessionTimeouts).toHaveLength(1));
    expect(screen.getByRole("button", { name: /start speaking to ren/i })).toHaveTextContent("Follow up");
    now += 350;
    harness.feedFrames(5);
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(2));
    expect(harness.wakeFeed).toHaveBeenCalledOnce();
    now += 2_100;
    harness.silence();
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({
      question: "And the fan?",
      history: expect.arrayContaining([expect.objectContaining({ role: "assistant", content: "The engine drives the fan." })]),
    }));
    await waitFor(() => expect(harness.speak).toHaveBeenCalledTimes(2));
    const [secondSpeechID] = harness.speak.mock.calls[1];
    act(() => { harness.speechData?.({ id: secondSpeechID, chunk: btoa("\0".repeat(4096)), done: true }); });
    act(() => { harness.audioSources[1].onended?.(); });
    await waitFor(() => expect(sessionTimeouts).toHaveLength(2));
    act(() => { sessionTimeouts[1](); });
    expect(screen.getByRole("button", { name: /start speaking to ren/i })).toHaveTextContent("Ready");
    harness.feedFrames(5);
    expect(harness.speechStart).toHaveBeenCalledTimes(2);
  });

  it("turns off hands-free listening and cancels active dictation on the second toggle", async () => {
    const ask = vi.fn(async () => response("unused"));
    const harness = makeHarness(["A line from the show"], ask as RenBridge["ask"]);
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.setVoiceMode({ paused: false, alwaysOn: true });
    harness.feedFrames(5);
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledOnce());
    harness.setVoiceMode({ paused: false, alwaysOn: false });
    await waitFor(() => expect(harness.speechStop).toHaveBeenCalled());
    harness.feedFrames(6);
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /start speaking to ren/i })).toBeVisible();
  });

  it("uses a second voice shortcut press to finish dictation without enabling Always On", async () => {
    const harness = makeHarness([""], vi.fn(async () => response("unused")) as RenBridge["ask"]);
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.activate();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledOnce());
    harness.activate();
    await waitFor(() => expect(harness.speechFinish).toHaveBeenCalledOnce());
    expect(harness.speechStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /start speaking to ren/i }), { shiftKey: true });
    expect(await screen.findByText(/hey ren only/i)).toBeVisible();
  });

  it("leaves Speaking and exposes an error if Deepgram never sends audio", async () => {
    let now = 8_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const idleCallbacks: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, timeout, ...args) => {
      if (timeout === 20_000 && typeof handler === "function") {
        idleCallbacks.push(() => (handler as (...values: unknown[]) => void)(...args));
        return 0 as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(handler, timeout, ...args);
    });
    const harness = makeHarness(["Explain bicycles"], vi.fn(async () => response("The pedals turn a chain.")) as RenBridge["ask"]);
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.activate();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledOnce());
    await finishUtterance(harness, () => { now += 2_100; });
    await waitFor(() => expect(harness.speak).toHaveBeenCalledOnce());
    const [speechID] = harness.speak.mock.calls[0];
    expect(idleCallbacks.length).toBeGreaterThan(0);
    act(() => idleCallbacks.at(-1)?.());
    await waitFor(() => expect(harness.cancelSpeech).toHaveBeenCalledWith(speechID));
    expect(screen.getByRole("alert")).toHaveTextContent("voice stopped responding");
  });

  it("keeps a newly started recording when the initial voice-mode status arrives", async () => {
    const status = deferred<VoiceMode>();
    const harness = makeHarness([], vi.fn(async () => response("unused")) as RenBridge["ask"]);
    window.ren!.voiceModeStatus = () => status.promise;
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.activate();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledOnce());
    await act(async () => { status.resolve({ paused: false, alwaysOn: false }); });
    expect(harness.speechStop).not.toHaveBeenCalled();
  });

  it("cuts off narration when the user speaks, then sends the follow-up with prior answer history", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const ask = vi.fn(async ({ question }: { question: string }) => response(
      question === "Explain the engine" ? "The engine drives the fan." : "The fan moves air downward.",
    ));
    const harness = makeHarness(["Explain the engine", "What about the fan?"], ask as RenBridge["ask"]);
    window.ren!.voiceModeStatus = async () => ({ paused: false, alwaysOn: true });
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.activate();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(1));
    await finishUtterance(harness, () => { now += 2_100; });
    await waitFor(() => expect(harness.speak).toHaveBeenCalledTimes(1));

    const [firstSpeechID] = harness.speak.mock.calls[0];
    const heldAudio = btoa("\0".repeat(4096));
    act(() => { harness.speechData?.({ id: firstSpeechID, chunk: heldAudio, done: true }); });
    expect(harness.stoppedSources).toHaveLength(1);
    expect(harness.stoppedSources[0]).not.toHaveBeenCalled();

    harness.feedFrames(5);
    await waitFor(() => expect(harness.cancelSpeech).toHaveBeenCalledWith(firstSpeechID));
    expect(harness.stoppedSources[0]).toHaveBeenCalledOnce();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(2));
    expect(harness.cancelAsk).not.toHaveBeenCalled();

    now += 2_100;
    harness.silence();
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({
      question: "What about the fan?",
      history: expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Explain the engine" }),
        expect.objectContaining({ role: "assistant", content: "The engine drives the fan." }),
      ]),
    }));
    await waitFor(() => expect(harness.speak).toHaveBeenCalledTimes(2));
  });

  it("cancels an in-flight answer and ignores its late completion after a new utterance", async () => {
    let now = 20_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const firstAnswer = deferred<AskResponse>();
    const ask = vi.fn(({ question }: { question: string }) => question === "First question"
      ? firstAnswer.promise
      : Promise.resolve(response("The new answer.")));
    const harness = makeHarness(["First question", "New question"], ask as RenBridge["ask"]);
    window.ren!.voiceModeStatus = async () => ({ paused: false, alwaysOn: true });
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.activate();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(1));
    await finishUtterance(harness, () => { now += 2_100; });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));

    harness.feedFrames(5);
    await waitFor(() => expect(harness.cancelAsk).toHaveBeenCalledExactlyOnceWith(expect.any(String)));
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(2));
    await act(async () => { firstAnswer.resolve(response("A stale answer that must never speak.")); });
    expect(harness.speak).not.toHaveBeenCalled();

    now += 2_100;
    harness.silence();
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(harness.speak).toHaveBeenCalledTimes(1));
    expect(harness.speak).toHaveBeenCalledWith(expect.any(String), "The new answer.");
    expect(harness.speak).not.toHaveBeenCalledWith(expect.any(String), "A stale answer that must never speak.");
  });

  it("stops a running agent job on speech and ignores its late update while answering the new request", async () => {
    let now = 30_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const ask = vi.fn(async () => response("Here is the new answer."));
    const harness = makeHarness(["Start a job to research electric motors", "Explain the diagram instead"], ask as RenBridge["ask"]);
    window.ren!.voiceModeStatus = async () => ({ paused: false, alwaysOn: true });
    harness.renderApp();
    await waitFor(() => expect(harness.processAudio).toBeTypeOf("function"));
    harness.activate();
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(1));
    await finishUtterance(harness, () => { now += 2_100; });
    await waitFor(() => expect(harness.startAgentJob).toHaveBeenCalledWith({
      task: "research electric motors", contextToken: "test-context",
    }));
    harness.emitAgentJob(harness.runningJob);

    harness.feedFrames(5);
    await waitFor(() => expect(harness.cancelAgentJob).toHaveBeenCalledWith("job-one"));
    await waitFor(() => expect(harness.speechStart).toHaveBeenCalledTimes(2));
    harness.emitAgentJob({ ...harness.runningJob, status: "completed", answer: "The old job finished too late." });
    expect(harness.speak).not.toHaveBeenCalledWith(expect.any(String), "The old job finished too late.");

    now += 2_100;
    harness.silence();
    await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "Explain the diagram instead" })));
    await waitFor(() => expect(harness.speak).toHaveBeenCalledWith(expect.any(String), "Here is the new answer."));
    expect(harness.speak).not.toHaveBeenCalledWith(expect.any(String), "The old job finished too late.");
  });
});
