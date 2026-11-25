import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";
import type { RenBridge } from "./contracts";

describe("Ren ambient shell", () => {
  it("presents a zero-configuration wake and point flow", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /how can i help/i })).toBeVisible();
    expect(screen.getByText(/hey ren, explain this/i)).toBeVisible();
    expect(screen.getByText(/point at anything on your screen/i)).toBeVisible();
    expect(screen.getByRole("textbox", { name: /ask ren/i })).toBeVisible();
  });

  it("supports the click and type fallback without a desktop bridge", async () => {
    render(<App />);
    const input = await screen.findByRole("textbox", { name: /ask ren/i });
    fireEvent.change(input, { target: { value: "Explain the part I am pointing at" } });
    fireEvent.click(screen.getByRole("button", { name: /send question/i }));

    expect(await screen.findByText(/packaged desktop app will use your current screen/i)).toBeVisible();
  });

  it("keeps the microphone fallback honest when local recognition is unavailable", async () => {
    render(<App />);
    const input = await screen.findByRole("textbox", { name: /ask ren/i });
    fireEvent.click(screen.getByRole("button", { name: /start listening/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/connect deepgram in ai settings/i);
    expect(input).toHaveFocus();
    expect(screen.getByRole("heading", { name: /how can i help/i })).toBeVisible();
  });

  it("opens and focuses the question box from the voice shortcut when dictation is unavailable", async () => {
    let activate: (() => void) | undefined;
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      voiceShortcutAvailable: async () => true,
      onFocusSelection: () => () => {},
      onActivateVoice: (listener: () => void) => { activate = listener; return () => { activate = undefined; }; },
      setExpanded: async () => {},
      speechStop: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      await screen.findByRole("button", { name: /open ren/i });
      act(() => activate?.());
      expect(await screen.findByRole("textbox", { name: /ask ren/i })).toHaveFocus();
      expect(screen.getByText(/⌘⇧Space/)).toBeVisible();
    } finally { window.ren = undefined; }
  });

  it("shows where screen images will go before accepting a provider key", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /connect ai/i }));
    expect(screen.getByText(/sends your question and an on-demand screen snapshot to openai/i)).toBeVisible();
    expect(screen.getByText(/streams your spoken question to Deepgram/i)).toBeVisible();
    expect(screen.getByRole("textbox", { name: /vision model/i })).toHaveValue("gpt-6-sol");
    expect(screen.getByLabelText(/openai api key/i)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/deepgram api key/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("heading", { name: /ren image service/i })).toBeVisible();
    expect(screen.getByLabelText(/ren access token/i)).toHaveAttribute("type", "password");
  });

  it("attempts screen access before opening macOS privacy settings", async () => {
    const steps: string[] = [];
    const denied = { ready: false, microphone: "not-determined", screen: "denied", interaction: "not-granted" };
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => denied,
      requestPermissions: async () => { steps.push("request"); return denied; },
      openPermissionSettings: async () => { steps.push("settings"); },
      setExpanded: async () => {},
      onFocusSelection: () => () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /request access and open system settings/i }));
      await waitFor(() => expect(steps).toEqual(["request", "settings"]));
    } finally { window.ren = undefined; }
  });

  it("keeps text learning available when microphone access is denied", async () => {
    const requestPermissions = vi.fn(async () => ({ ready: true, microphone: "denied", screen: "granted", interaction: "not-granted" }));
    const openPermissionSettings = vi.fn(async () => {});
    window.ren = {
      platform: "darwin",
      permissionStatus: async () => ({ ready: true, microphone: "denied", screen: "granted", interaction: "not-granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      requestPermissions,
      openPermissionSettings,
      onFocusSelection: () => () => {},
      setExpanded: async () => {},
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /enable microphone to talk to ren/i }));
      await waitFor(() => expect(openPermissionSettings).toHaveBeenCalledWith("microphone"));
      expect(requestPermissions).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: /give ren permission once/i })).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /ask ren/i })).toBeVisible();
    } finally { window.ren = undefined; }
  });

  it("asks about the circled region without requiring a typed prompt", async () => {
    let selected: (() => void) | undefined;
    const ask = vi.fn(async () => ({ answer: "Look at the circled part.", annotations: [], provider: "demo" as const }));
    window.ren = {
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: (listener: () => void) => { selected = listener; return () => { selected = undefined; }; },
      setExpanded: async () => {},
      speechStop: async () => {},
      captureContext: async () => ({ frames: ["data:image/png;base64,dGVzdA=="], pointer: { x: 0.5, y: 0.5 }, focus: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 } }),
      ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      await screen.findByText(/point at anything/i);
      act(() => selected?.());
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({
        question: expect.stringContaining("area I circled"),
        focus: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      })));
    } finally {
      window.ren = undefined;
    }
  });

  it("keeps a circle question in the compact pill", async () => {
    let selected: (() => void) | undefined;
    const ask = vi.fn(async () => ({ answer: "This is the selected region.", annotations: [], provider: "vision" as const }));
    window.ren = {
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: (listener: () => void) => { selected = listener; return () => { selected = undefined; }; },
      setExpanded: async () => {},
      speechStop: async () => {},
      captureContext: async () => ({ frames: [], pointer: { x: 0.5, y: 0.5 } }),
      ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await screen.findByRole("button", { name: /open ren/i });
      act(() => selected?.());
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: /open ren/i })).toBeVisible();
      expect(screen.queryByRole("textbox", { name: /ask ren/i })).not.toBeInTheDocument();
    } finally { window.ren = undefined; }
  });

  it("asks a suggested follow-up with a fresh screen context", async () => {
    const captureContext = vi.fn(async () => ({ frames: ["data:image/png;base64,dGVzdA=="], pointer: { x: 0.5, y: 0.5 } }));
    const ask = vi.fn(async () => ({ answer: "Look at the highlighted step.", annotations: [], followUps: ["Why does that step work?"], provider: "vision" as const }));
    window.ren = {
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: () => () => {},
      setExpanded: async () => {},
      speechStop: async () => {},
      captureContext,
      ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      const input = await screen.findByRole("textbox", { name: /ask ren/i });
      fireEvent.change(input, { target: { value: "Explain this step" } });
      fireEvent.click(screen.getByRole("button", { name: /send question/i }));
      fireEvent.click(await screen.findByRole("button", { name: /why does that step work/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
      expect(captureContext).toHaveBeenCalledTimes(2);
      expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Why does that step work?" }));
    } finally { window.ren = undefined; }
  });

  it("keeps diagram context for a spoken follow-up and starts listening after the answer", async () => {
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
    const wakeFeed = vi.fn(async () => true);
    const captureContext = vi.fn(async () => ({ frames: [], pointer: { x: .5, y: .5 } }));
    const ask = vi.fn(async ({ question }: { question: string }) => ({
      answer: question.includes("Why") ? "The fan pushes air down." : "The engine drives the fan.",
      annotations: [], provider: "vision" as const,
      ...(question.includes("Why") ? { reusedVisual: true } : { visualLesson: { version: 1 as const, title: "Hover", layout: "centered" as const, placement: { x: .2, y: .2, width: .6, height: .6 }, parts: [
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
      setExpanded: async () => {}, captureContext, ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      await waitFor(() => expect(processor?.onaudioprocess).toBeTypeOf("function"));
      const voiceFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(.03) } };
      act(() => processor?.onaudioprocess?.(voiceFrame));
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("textbox", { name: /ask ren/i })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: /finish speaking/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      expect(captureContext).toHaveBeenNthCalledWith(1, false, "Draw a diagram of the hover system");
      expect(screen.getByRole("button", { name: /illustrate on screen/i })).toBeVisible();
      await waitFor(() => expect(screen.getByRole("heading", { name: /i’m listening/i })).toBeVisible());
      expect(screen.getByText(/ask a follow-up anytime · no wake phrase/i)).toBeVisible();
      expect(screen.getByRole("button", { name: /stop listening/i })).toBeVisible();
      expect(speechStart).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setTimeout(resolve, 400));
      act(() => { for (let index = 0; index < 3; index += 1) processor?.onaudioprocess?.(voiceFrame); });
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(2));
      expect(wakeFeed).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: /finish speaking/i }));
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
      expect(captureContext).toHaveBeenNthCalledWith(2, true, "Why does the fan help?");
      expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Why does the fan help?", history: expect.arrayContaining([expect.objectContaining({ role: "assistant", content: "The engine drives the fan." })]) }));
      expect(screen.getByRole("button", { name: /illustrate on screen/i })).toBeVisible();
      await waitFor(() => expect(screen.getByRole("heading", { name: /i’m listening/i })).toBeVisible());
      expect(speechStart).toHaveBeenCalledTimes(2);
      await new Promise((resolve) => setTimeout(resolve, 400));
      act(() => { for (let index = 0; index < 3; index += 1) processor?.onaudioprocess?.(voiceFrame); });
      await waitFor(() => expect(speechStart).toHaveBeenCalledTimes(3));
      fireEvent.click(screen.getByRole("button", { name: /finish speaking/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /stop listening/i })).toBeVisible());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(wakeFeed).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: /stop listening/i }));
      expect(screen.getByRole("heading", { name: /how can i help/i })).toBeVisible();
    } finally {
      window.ren = undefined;
      globalThis.AudioContext = originalAudioContext;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
    }
  });

  it("automatically starts one illustration for an explicit diagram request", async () => {
    let completeRender: ((value: boolean) => void) | undefined;
    const generateIllustration = vi.fn(() => new Promise<boolean>((resolve) => { completeRender = resolve; }));
    const ask = vi.fn(async () => ({
      answer: "The engine powers the lift fan and rear nozzle.", provider: "vision" as const,
      annotations: [], autoIllustrate: true,
      visualLesson: { version: 1 as const, layout: "centered" as const, title: "Jet hover", placement: { x: .25, y: .25, width: .5, height: .5 }, parts: [
        { id: "fan", label: "Lift fan", explanation: "Pushes air down.", x: .3, y: .4 },
        { id: "nozzle", label: "Rear nozzle", explanation: "Directs thrust down.", x: .7, y: .6 },
      ], connections: [{ from: "fan", to: "nozzle", label: "balances" }] },
    }));
    window.ren = {
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: () => () => {}, setExpanded: async () => {}, speechStop: async () => {},
      captureContext: async () => ({ frames: [], pointer: { x: .5, y: .5 } }),
      ask, generateIllustration,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      const input = await screen.findByRole("textbox", { name: /ask ren/i });
      fireEvent.change(input, { target: { value: "Draw a jet hover diagram" } });
      fireEvent.click(screen.getByRole("button", { name: /send question/i }));
      await waitFor(() => expect(generateIllustration).toHaveBeenCalledExactlyOnceWith(true));
      expect(screen.getByRole("heading", { name: /drawing on your screen/i })).toBeVisible();
      await act(async () => { completeRender?.(true); });
      expect(generateIllustration).toHaveBeenCalledTimes(1);
    } finally { window.ren = undefined; }
  });

  it("offers a manual retry after an automatic illustration fails", async () => {
    const generateIllustration = vi.fn()
      .mockRejectedValueOnce(new Error("Image service timed out"))
      .mockResolvedValueOnce(true);
    window.ren = {
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      visionStatus: async () => ({ mode: "connected", model: "gpt-6-sol", host: "api.openai.com", baseUrl: "https://api.openai.com/v1" }),
      wakeAvailable: async () => false,
      onFocusSelection: () => () => {}, setExpanded: async () => {}, speechStop: async () => {},
      captureContext: async () => ({ frames: [], pointer: { x: .5, y: .5 } }),
      ask: async () => ({ answer: "Engine thrust and lift fan balance the aircraft.", provider: "vision", annotations: [], autoIllustrate: true,
        visualLesson: { version: 1, layout: "centered", title: "Jet hover", placement: { x: .1, y: .1, width: .8, height: .8 }, parts: [
          { id: "engine", label: "Engine", explanation: "Powers the lift fan.", x: .3, y: .4 },
          { id: "fan", label: "Lift fan", explanation: "Pushes air down.", x: .7, y: .6 },
        ], connections: [{ from: "engine", to: "fan", label: "drives" }] },
      }),
      generateIllustration,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      const input = await screen.findByRole("textbox", { name: /ask ren/i });
      fireEvent.change(input, { target: { value: "Draw a jet hover diagram" } });
      fireEvent.click(screen.getByRole("button", { name: /send question/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Image service timed out");
      const retry = await screen.findByRole("button", { name: /illustrate on screen/i });
      expect(retry).toBeEnabled();
      fireEvent.click(retry);
      await waitFor(() => expect(generateIllustration).toHaveBeenCalledTimes(2));
      expect(generateIllustration).toHaveBeenNthCalledWith(1, true);
      expect(generateIllustration).toHaveBeenNthCalledWith(2, false);
    } finally { window.ren = undefined; }
  });
});
