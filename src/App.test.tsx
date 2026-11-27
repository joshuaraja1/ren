import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { App, friendlyAskError } from "./App";
import type { RenBridge } from "./contracts";

describe("Ren voice interface", () => {
  it("does not expose native command details in an action error", () => {
    const raw = "Error invoking remote method 'ren:ask': Error: Command failed: /usr/bin/swift /Users/Josh/Ren/ren-input.swift {\"action\":\"type\"} The active app changed or cannot be operated safely.";
    expect(friendlyAskError(new Error(raw))).toBe("The visible app changed while Ren was working. Please try again.");
    expect(friendlyAskError(new Error("Error invoking remote method 'ren:ask': Error: Command failed: /usr/bin/swift"))).toBe("Ren couldn't complete that action. Please try again.");
    expect(friendlyAskError(new Error("Error invoking remote method 'ren:ask': Error: Ren cannot operate that app through screen coordinates."))).toBe("Ren cannot operate that app through screen coordinates.");
  });
  it("opens the OpenClicky-style home panel from the compact notch", async () => {
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false, onFocusSelection: () => () => {},
      setExpanded: async () => {}, setCompanionVisible: async () => {}, speechStop: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      const notch = await screen.findByRole("button", { name: /open ren/i });
      expect(notch).toHaveClass("ren-pebble");
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
      fireEvent.click(notch);
      expect(await screen.findByRole("textbox", { name: /ask ren/i })).toBeVisible();
      expect(screen.getByRole("button", { name: /agents/i })).toBeVisible();
      expect(screen.getByRole("button", { name: /connect/i })).toBeVisible();
      expect(screen.getByRole("button", { name: /collapse ren/i })).toBeVisible();
      expect(screen.getByRole("button", { name: /tap control three times to talk/i })).toBeVisible();
      expect(screen.getByRole("button", { name: /summarise screen/i })).toBeVisible();
      expect(screen.getByText(/hey ren only/i)).toBeVisible();
      expect(screen.queryByLabelText("Ren conversation")).not.toBeInTheDocument();
    } finally { window.ren = undefined; }
  });

  it("answers an ordinary question without taking a screen capture", async () => {
    const captureContext = vi.fn(async () => { throw new Error("Screen Recording is unavailable"); });
    const ask = vi.fn(async () => ({ answer: "Pedaling turns the wheel.", annotations: [], provider: "demo" as const }));
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: false, microphone: "granted", screen: "denied", interaction: "not-granted" }),
      wakeAvailable: async () => false, onFocusSelection: () => () => {},
      setExpanded: async () => {}, setCompanionVisible: async () => {}, speechStop: async () => {},
      captureContext, ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /ask ren/i }), { target: { value: "How do bicycle gears work?" } });
      fireEvent.click(screen.getByRole("button", { name: /send ren prompt/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "How do bicycle gears work?", frames: [], contextToken: expect.any(String) })));
      expect(captureContext).not.toHaveBeenCalled();
    } finally { window.ren = undefined; }
  });

  it.each([
    { task: "How do I design an aircraft wing in FreeCAD?", stuck: "I can't find the sketch tool" },
    { task: "How do I create a table using excel?", stuck: "That didn't work" },
  ])("keeps screen context and the original task when guidance gets stuck: $task", async ({ task, stuck }) => {
    const captureContext = vi.fn(async () => ({ frames: ["data:image/png;base64,screen"], pointer: { x: .5, y: .5 }, contextToken: crypto.randomUUID() }));
    const ask = vi.fn(async (_request: unknown) => ({ answer: "Look for the sketch tool in the current workbench.", annotations: [], provider: "vision" as const }));
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      wakeAvailable: async () => false, onFocusSelection: () => () => {},
      setExpanded: async () => {}, setCompanionVisible: async () => {}, speechStop: async () => {},
      captureContext, ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      const prompt = screen.getByRole("textbox", { name: /ask ren/i });
      fireEvent.change(prompt, { target: { value: task } });
      fireEvent.click(screen.getByRole("button", { name: /send ren prompt/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /ask ren/i }), { target: { value: stuck } });
      fireEvent.click(screen.getByRole("button", { name: /send ren prompt/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
      expect(captureContext).toHaveBeenCalledTimes(2);
      expect(ask.mock.calls[1][0]).toEqual(expect.objectContaining({
        question: stuck,
        frames: ["data:image/png;base64,screen"],
        history: expect.arrayContaining([expect.objectContaining({ role: "user", content: task })]),
      }));
    } finally { window.ren = undefined; }
  });

  it("does not turn background audio into dictation while a typed visual request is processing", async () => {
    let processAudio: ((event: { inputBuffer: { getChannelData(channel: number): Float32Array } }) => void) | null = null;
    const originalAudioContext = globalThis.AudioContext;
    const originalMediaDevices = navigator.mediaDevices;
    class FakeAudioContext {
      sampleRate = 48_000;
      state = "running";
      destination = {};
      createMediaStreamSource() { return { connect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, set onaudioprocess(listener: typeof processAudio) { processAudio = listener; } }; }
      async close() {}
    }
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    const speechStart = vi.fn(async () => true);
    const ask = vi.fn(async () => new Promise<never>(() => {}));
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      wakeAvailable: async () => true, wakeStart: async () => true, wakeFeed: async () => false, wakeStop: async () => {},
      speechAvailable: async () => true, speechStart, speechStop: async () => {},
      onFocusSelection: () => () => {}, setExpanded: async () => {}, setCompanionVisible: async () => {},
      captureContext: async () => ({ frames: [], pointer: { x: .5, y: .5 }, contextToken: "visual-1" }), ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await waitFor(() => expect(processAudio).toBeTypeOf("function"));
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /ask ren/i }), { target: { value: "Show a 3D computer assembly" } });
      fireEvent.click(screen.getByRole("button", { name: /send ren prompt/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "Show a 3D computer assembly" })));
      act(() => { for (let index = 0; index < 7; index++) processAudio?.({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.04) } }); });
      expect(speechStart).not.toHaveBeenCalled();
      expect(ask).toHaveBeenCalledTimes(1);
    } finally {
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

  it("keeps Chat visible for a typed follow-up and routes Agent mode to a job", async () => {
    const setExpanded = vi.fn(async () => {});
    const ask = vi.fn(async () => ({ answer: "Here is the answer.", annotations: [], provider: "demo" as const }));
    const startAgentJob = vi.fn(async ({ task }: { task: string }) => ({ id: "job-1", task, status: "running" as const, stage: "Starting", completedSteps: 0, totalSteps: 1, scope: "current screen" as const }));
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      wakeAvailable: async () => false, onFocusSelection: () => () => {},
      setExpanded, setCompanionVisible: async () => {}, speechStop: async () => {},
      captureContext: async () => ({ frames: [], pointer: { x: .5, y: .5 }, contextToken: "capture-1" }), ask, startAgentJob,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      expect(screen.queryByLabelText("Ren conversation")).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: /chat/i }));
      expect(screen.getByLabelText("Ren conversation")).toBeVisible();
      fireEvent.change(screen.getByRole("textbox", { name: /ask ren/i }), { target: { value: "Tell me more" } });
      fireEvent.click(screen.getByRole("button", { name: /send ren prompt/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "Tell me more" })));
      expect(screen.getByRole("textbox", { name: /ask ren/i })).toBeVisible();
      expect(setExpanded).not.toHaveBeenCalledWith(false, false);
      await waitFor(() => expect(screen.getByText("Here is the answer.")).toBeVisible());
      fireEvent.click(screen.getByRole("button", { name: /✦ Ask/i }));
      expect(screen.queryByLabelText("Ren conversation")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /summarise screen/i })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: /^◈ Agent$/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /ask ren/i }), { target: { value: "Compare two learning tools" } });
      fireEvent.click(screen.getByRole("button", { name: /send ren prompt/i }));
      await waitFor(() => expect(startAgentJob).toHaveBeenCalledWith(expect.objectContaining({ task: "Compare two learning tools" })));
      await waitFor(() => expect(setExpanded).toHaveBeenCalledWith(false, false));
    } finally { window.ren = undefined; }
  });

  it("opens settings from the notch context action", async () => {
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false, onFocusSelection: () => () => {},
      setExpanded: async () => {}, setCompanionVisible: async () => {}, speechStop: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.contextMenu(await screen.findByRole("button", { name: /open ren/i }));
      expect(await screen.findByRole("textbox", { name: /vision model/i })).toHaveValue("gpt-6-sol");
      expect(screen.getByLabelText(/openai api key/i)).toHaveAttribute("type", "password");
      expect(screen.getByLabelText(/deepgram api key/i)).toHaveAttribute("type", "password");
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
    } finally { window.ren = undefined; }
  });

  it("keeps voice available without Screen Recording and offers Accessibility setup", async () => {
    const wakeAvailable = vi.fn(async () => false);
    const enableCircleInput = vi.fn(async () => ({ ready: false, microphone: "granted", screen: "denied", interaction: "not-granted" }));
    window.ren = {
      platform: "darwin", permissionStatus: async () => ({ ready: false, microphone: "granted", screen: "denied", interaction: "not-granted" }),
      wakeAvailable, enableCircleInput, onFocusSelection: () => () => {},
      setExpanded: async () => {}, setCompanionVisible: async () => {}, speechStop: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      const strip = await screen.findByRole("button", { name: /open ren/i });
      expect(screen.queryByText(/give ren permission once/i)).not.toBeInTheDocument();
      await waitFor(() => expect(wakeAvailable).toHaveBeenCalled());
      fireEvent.contextMenu(strip);
      fireEvent.click(await screen.findByRole("button", { name: /enable keyboard shortcut/i }));
      expect(enableCircleInput).toHaveBeenCalledOnce();
    } finally { window.ren = undefined; }
  });

  it("keeps setup compact until the user opens Ren", async () => {
    const permissionStatus = vi.fn()
      .mockResolvedValueOnce({ ready: false, microphone: "not-determined", screen: "not-determined", interaction: "not-granted" })
      .mockResolvedValue({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" });
    const setExpanded = vi.fn(async () => {});
    window.ren = {
      platform: "darwin", permissionStatus, setExpanded,
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: () => () => {}, setCompanionVisible: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      await screen.findByRole("button", { name: /open ren/i });
      expect(setExpanded).not.toHaveBeenCalledWith(true, true);
      expect(screen.queryByText(/give ren permission once/i)).not.toBeInTheDocument();
      fireEvent.focus(window);
      await waitFor(() => expect(permissionStatus).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("button", { name: /open ren/i })).toHaveClass("ren-pebble");
      fireEvent.click(screen.getByRole("button", { name: /open ren/i }));
      expect(await screen.findByRole("textbox", { name: /ask ren/i })).toBeVisible();
    } finally { window.ren = undefined; }
  });

  it("shows a visible voice error when a global shortcut has no microphone input", async () => {
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
      expect(screen.getByRole("button", { name: /open ren/i })).toHaveAttribute("title", expect.stringMatching(/voice|wake phrase/i));
    } finally { window.ren = undefined; }
  });

  it("keeps unavailable voice compact and opens settings on right-click", async () => {
    let activate: (() => void) | undefined;
    const setExpanded = vi.fn(async () => {});
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: () => () => {},
      onActivateVoice: (listener: () => void) => { activate = listener; return () => { activate = undefined; }; },
      setExpanded, setCompanionVisible: async () => {}, speechStop: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      const strip = await screen.findByRole("button", { name: /open ren/i });
      expect(strip).toBeVisible();
      expect(setExpanded).not.toHaveBeenCalledWith(true, expect.anything());
      act(() => activate?.());
      expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible();
      expect(setExpanded).not.toHaveBeenCalledWith(true, true);
      fireEvent.contextMenu(screen.getByRole("button", { name: /open ren/i }));
      await waitFor(() => expect(setExpanded).toHaveBeenCalledWith(true, true));
      expect(screen.getByLabelText(/openai api key/i)).toHaveAttribute("type", "password");
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
    } finally { window.ren = undefined; }
  });

  it("keeps a spoken question on the strip and finishes it with one click", async () => {
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
    const speechStop = vi.fn(async () => {});
    const speechStart = vi.fn(async () => true);
    const wakeStart = vi.fn(async () => true);
    const ask = vi.fn(async () => new Promise<never>(() => {}));
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => true, wakeStart, wakeStop: async () => {}, wakeFeed: async () => false,
      speechAvailable: async () => true, speechStart, speechStop, speechFinish: async () => "Explain this component",
      onFocusSelection: (listener: () => void) => { selected = listener; return () => { selected = undefined; }; },
      setExpanded: async () => {}, setCompanionVisible: async () => {}, captureContext: async () => ({ frames: [], pointer: { x: .5, y: .5 } }), ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await waitFor(() => expect(selected).toBeTypeOf("function"));
      await waitFor(() => expect(wakeStart).toHaveBeenCalledTimes(1));
      await act(async () => { selected?.(); });
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(1));
      const strip = screen.getByRole("button", { name: /finish speaking to ren/i });
      expect(strip).toHaveClass("ren-pebble");
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
      fireEvent.click(strip);
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "Explain this component" })));
    } finally {
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

  it("captures microphone audio and answers a provider-ended turn when wake-word startup fails", async () => {
    let activate: (() => void) | undefined;
    let input: ((value: { transcript?: string; error?: string }) => void) | undefined;
    let processAudio: ((event: { inputBuffer: { getChannelData(channel: number): Float32Array } }) => void) | null = null;
    const originalAudioContext = globalThis.AudioContext;
    const originalMediaDevices = navigator.mediaDevices;
    const resume = vi.fn(async () => {});
    class FakeAudioContext {
      sampleRate = 48_000;
      state = "suspended";
      destination = {};
      createMediaStreamSource() { return { connect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, set onaudioprocess(listener: typeof processAudio) { processAudio = listener; } }; }
      async resume() { await resume(); this.state = "running"; }
      async close() {}
    }
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    const speechStart = vi.fn(async () => true);
    const speechFeed = vi.fn(async () => true);
    const ask = vi.fn(async () => new Promise<never>(() => {}));
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => true, wakeStart: async () => false, wakeStop: async () => {},
      speechAvailable: async () => true, speechStart, speechFeed, speechStop: async () => {}, speechFinish: async () => "How does this work?",
      onActivateVoice: (listener: () => void) => { activate = listener; return () => { activate = undefined; }; },
      onFocusSelection: () => () => {},
      onSpeechInput: (listener: typeof input) => { input = listener; return () => { input = undefined; }; },
      setExpanded: async () => {}, setCompanionVisible: async () => {}, captureContext: async () => ({ frames: [], pointer: { x: .5, y: .5 } }), ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await waitFor(() => expect(processAudio).toBeTypeOf("function"));
      act(() => activate?.());
      await waitFor(() => expect(speechStart).toHaveBeenCalledOnce());
      expect(resume).toHaveBeenCalledOnce();
      act(() => processAudio?.({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.05) } }));
      await waitFor(() => expect(speechFeed).toHaveBeenCalledOnce());
      act(() => input?.({ transcript: "How does this work?" }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "How does this work?" })));
      speechStart.mockResolvedValueOnce(false);
      act(() => activate?.());
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Deepgram dictation could not start"));
      expect(screen.getByRole("button", { name: /open ren/i })).toHaveClass("ren-pebble");
    } finally {
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
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
      fireEvent.click(screen.getByRole("button", { name: /finish speaking to ren/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: "What does this part do?", focus: { x: .2, y: .3, width: .3, height: .2 } })));
    } finally {
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

  it("returns to wake-only mode after an answer and retains context after Hey Ren", async () => {
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
    const wakeFeed = vi.fn(async () => false).mockResolvedValueOnce(true);
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
      const quietFollowUpFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.018) } };
      const silentFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048) } };
      act(() => processor?.onaudioprocess?.(voiceFrame));
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(1));
      expect(setCompanionVisible).toHaveBeenCalledWith(true);
      expect(screen.getByRole("button", { name: /finish speaking to ren/i })).toBeVisible();
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      now += 2_100;
      act(() => processor?.onaudioprocess?.(silentFrame));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      expect(captureContext).toHaveBeenNthCalledWith(1, false, "Draw a diagram of the hover system");
      await waitFor(() => expect(generateIllustration).toHaveBeenCalledExactlyOnceWith(true));
      await waitFor(() => expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible());
      await waitFor(() => expect(setCompanionVisible).toHaveBeenCalledWith(false), { timeout: 2_500 });
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      expect(speechStart).toHaveBeenCalledTimes(1);
      now += 400;
      act(() => { for (let index = 0; index < 5; index += 1) processor?.onaudioprocess?.(quietFollowUpFrame); });
      await waitFor(() => expect(wakeFeed).toHaveBeenCalledTimes(2));
      expect(speechStart).toHaveBeenCalledTimes(1);
      wakeFeed.mockResolvedValueOnce(true);
      act(() => processor?.onaudioprocess?.(voiceFrame));
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(setCompanionVisible).toHaveBeenLastCalledWith(true));
      now += 2_100;
      act(() => processor?.onaudioprocess?.(silentFrame));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
      expect(captureContext).toHaveBeenNthCalledWith(2, true, "Why does the fan help?");
      expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Why does the fan help?", history: expect.arrayContaining([expect.objectContaining({ role: "assistant", content: "The engine drives the fan." })]) }));
      await waitFor(() => expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible());
      expect(speechStart).toHaveBeenCalledTimes(2);
      now += 400;
      act(() => { for (let index = 0; index < 5; index += 1) processor?.onaudioprocess?.(voiceFrame); });
      await waitFor(() => expect(wakeFeed).toHaveBeenCalledTimes(4));
      expect(speechStart).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open ren/i })).toHaveClass("ren-pebble");
    } finally {
      dateNow.mockRestore();
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

});
