import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";
import type { RenBridge } from "./contracts";

describe("Ren voice interface", () => {
  it("shows voice controls and never opens a chat box", async () => {
    render(<App />);
    expect(await screen.findByText(/just say “hey ren”/i)).toBeVisible();
    expect(screen.getByText(/control three times/i)).toBeVisible();
    expect(screen.getByText(/control \+ option/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start listening/i })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
  });

  it("opens only voice settings when the user requests them", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /connect ai/i }));
    expect(screen.getByRole("textbox", { name: /vision model/i })).toHaveValue("gpt-6-sol");
    expect(screen.getByLabelText(/openai api key/i)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/deepgram api key/i)).toHaveAttribute("type", "password");
    expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
  });

  it("does not open a chat panel for the global voice shortcut", async () => {
    let activate: (() => void) | undefined;
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: () => () => {},
      onActivateVoice: (listener: () => void) => { activate = listener; return () => { activate = undefined; }; },
      setExpanded: async () => {}, setCompanionVisible: async () => {}, speechStop: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      await screen.findByRole("button", { name: /open ren/i });
      act(() => activate?.());
      expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible();
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
    } finally { window.ren = undefined; }
  });

  it("starts listening after a circle instead of asking a canned question", async () => {
    let selected: (() => void) | undefined;
    const originalAudioContext = globalThis.AudioContext;
    const originalMediaDevices = navigator.mediaDevices;
    class FakeAudioContext {
      sampleRate = 48_000;
      destination = {};
      createMediaStreamSource() { return { connect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
      async close() {}
    }
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    const speechStart = vi.fn(async () => true);
    const captureContext = vi.fn(async () => ({ frames: [], pointer: { x: .5, y: .5 }, focus: { x: .2, y: .3, width: .3, height: .2 } }));
    const ask = vi.fn(async () => new Promise<never>(() => {}));
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => true, wakeStart: async () => true, wakeStop: async () => {}, wakeFeed: async () => false,
      speechAvailable: async () => true, speechStart, speechStop: async () => {}, speechFinish: async () => "What does this part do?",
      onFocusSelection: (listener: () => void) => { selected = listener; return () => { selected = undefined; }; },
      setExpanded: async () => {}, setCompanionVisible: async () => {}, captureContext, ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await waitFor(() => expect(selected).toBeTypeOf("function"));
      await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toBeTypeOf("function"));
      await act(async () => { selected?.(); });
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(1));
      expect(ask).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /open ren/i }));
      fireEvent.click(screen.getByRole("button", { name: /finish speaking/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "What does this part do?", focus: { x: .2, y: .3, width: .3, height: .2 } })));
    } finally {
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

  it("keeps diagram context for a spoken follow-up and starts listening after the answer", async () => {
    let now = 10_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);
    let speechListener: ((data: { id: string; chunk?: string; done?: boolean }) => void) | undefined;
    let processor: { onaudioprocess: ((event: { inputBuffer: { getChannelData(index: number): Float32Array } }) => void) | null } | undefined;
    const originalAudioContext = globalThis.AudioContext;
    const originalMediaDevices = navigator.mediaDevices;
    class FakeAudioContext {
      sampleRate = 48_000;
      currentTime = 0;
      state = "running";
      destination = {};
      createMediaStreamSource() { return { connect() {} }; }
      createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null } as typeof processor & { connect(): void; disconnect(): void }; return processor; }
      createBuffer() { return { duration: .05, getChannelData: () => new Float32Array(1) }; }
      createBufferSource() {
        return { buffer: null, onended: null as (() => void) | null, connect() {}, disconnect() {}, stop() {}, start(this: { onended: (() => void) | null }) { queueMicrotask(() => this.onended?.()); } };
      }
      async resume() {}
      async close() {}
    }
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    const speechStart = vi.fn(async () => true);
    const setCompanionVisible = vi.fn(async () => {});
    const wakeFeed = vi.fn(async () => true);
    const generateIllustration = vi.fn(async () => true);
    const captureContext = vi.fn(async () => ({ frames: [], pointer: { x: .5, y: .5 } }));
    const ask = vi.fn(async ({ question }: { question: string }) => ({
      answer: question.includes("Why") ? "The fan pushes air down." : "The engine drives the fan.",
      annotations: [], provider: "vision" as const,
      ...(question.includes("Why") ? { reusedVisual: true } : { autoIllustrate: true, visualLesson: { version: 1 as const, title: "Hover", layout: "centered" as const, placement: { x: .2, y: .2, width: .6, height: .6 }, parts: [
        { id: "engine", label: "Engine", explanation: "Powers the fan", x: .2, y: .4 },
        { id: "fan", label: "Lift fan", explanation: "Pushes air down", x: .7, y: .4 },
      ], connections: [{ from: "engine", to: "fan", label: "drives" }] } }),
    }));
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      visionStatus: async () => ({ mode: "connected", model: "gpt-6-sol", host: "api.openai.com", baseUrl: "https://api.openai.com/v1" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => true, wakeStart: async () => true, wakeStop: async () => {}, wakeFeed,
      speechAvailable: async () => true, speechStart, speechFeed: async () => true,
      speechFinish: vi.fn().mockResolvedValueOnce("Draw a diagram of the hover system").mockResolvedValueOnce("Why does the fan help?").mockResolvedValueOnce(""), speechStop: async () => {},
      onSpeechData: (listener: typeof speechListener) => { speechListener = listener; return () => { speechListener = undefined; }; },
      speak: async (id: string) => { queueMicrotask(() => { speechListener?.({ id, chunk: "AAA=", done: true }); }); return true; },
      onFocusSelection: () => () => {}, onActivateVoice: () => () => {},
      setExpanded: async () => {}, setCompanionVisible, captureContext, ask, generateIllustration,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await waitFor(() => expect(processor?.onaudioprocess).toBeTypeOf("function"));
      const voiceFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.03) } };
      const quietFollowUpFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.008) } };
      const silentFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048) } };
      act(() => processor?.onaudioprocess?.(voiceFrame));
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(1));
      expect(setCompanionVisible).toHaveBeenCalledWith(true);
      expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible();
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      now += 2_100;
      act(() => processor?.onaudioprocess?.(silentFrame));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      expect(captureContext).toHaveBeenNthCalledWith(1, false, "Draw a diagram of the hover system");
      await waitFor(() => expect(generateIllustration).toHaveBeenCalledExactlyOnceWith(true));
      await waitFor(() => expect(screen.getByText(/ask your next question/i)).toBeVisible());
      await waitFor(() => expect(setCompanionVisible).toHaveBeenCalledWith(false), { timeout: 2_500 });
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      expect(speechStart).toHaveBeenCalledTimes(1);
      now += 400;
      act(() => { for (let index = 0; index < 3; index += 1) processor?.onaudioprocess?.(quietFollowUpFrame); });
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(2));
      expect(setCompanionVisible).toHaveBeenLastCalledWith(true);
      expect(wakeFeed).toHaveBeenCalledTimes(1);
      now += 2_100;
      act(() => processor?.onaudioprocess?.(silentFrame));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
      expect(captureContext).toHaveBeenNthCalledWith(2, true, "Why does the fan help?");
      expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Why does the fan help?", history: expect.arrayContaining([expect.objectContaining({ role: "assistant", content: "The engine drives the fan." })]) }));
      await waitFor(() => expect(screen.getByText(/ask your next question/i)).toBeVisible());
      expect(speechStart).toHaveBeenCalledTimes(2);
      now += 400;
      act(() => { for (let index = 0; index < 3; index += 1) processor?.onaudioprocess?.(voiceFrame); });
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(3));
      now += 2_100;
      act(() => processor?.onaudioprocess?.(silentFrame));
      await waitFor(() => expect(screen.getByText(/ask your next question/i)).toBeVisible());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(wakeFeed).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: /open ren/i }));
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /stop listening/i }));
      expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible();
    } finally {
      dateNow.mockRestore();
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

});
