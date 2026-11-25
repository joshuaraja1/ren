import { FormEvent, useEffect, useRef, useState } from "react";
import type { AmbientStatus, AskResponse, ConversationTurn, DeepgramStatus, HostedImageStatus, ScreenContext, ScreenSource, VisionStatus } from "./contracts";
import { PcmStreamPlayer } from "./pcm-player";
import { interactiveSceneFor } from "../electron/interactive-scene";
import { wantsVisualCreation } from "../electron/visual-intent";

type VoiceState = "idle" | "listening" | "processing" | "responding";
type Message = ConversationTurn & { id: string; provider?: AskResponse["provider"]; followUps?: string[] };
type RecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  processLocally?: boolean;
  start(): void; stop(): void;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const readyStatus: AmbientStatus = { ready: true, microphone: "preview", screen: "preview" };
const demoVision: VisionStatus = { mode: "demo", model: "", host: "", baseUrl: "https://api.openai.com/v1" };
const demoHosted: HostedImageStatus = { mode: "demo", baseUrl: "", host: "" };
const voiceLabels: Record<VoiceState, { title: string; detail: string }> = {
  idle: { title: "Ready", detail: "Say “Hey Ren”" },
  listening: { title: "Listening", detail: "Ask me anything" },
  processing: { title: "Looking closely", detail: "Reading your screen" },
  responding: { title: "Explaining", detail: "Working it through" },
};
const Spark = () => <svg aria-hidden="true" viewBox="0 0 32 32" className="spark"><path d="M16 2c.8 8.6 5.4 13.2 14 14-8.6.8-13.2 5.4-14 14-.8-8.6-5.4-13.2-14-14 8.6-.8 13.2-5.4 14-14Z" /></svg>;
const MicGlyph = () => <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></svg>;
const VoiceMeter = ({ active = false }: { active?: boolean }) => <span className={`voice-meter${active ? " is-active" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;

export function App() {
  const [permission, setPermission] = useState<AmbientStatus | null>(null);
  const [expanded, setExpandedState] = useState(false);
  const [source, setSource] = useState<ScreenSource | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const voiceStateRef = useRef<VoiceState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [vision, setVision] = useState<VisionStatus>(demoVision);
  const [deepgram, setDeepgram] = useState<DeepgramStatus>({ mode: "demo" });
  const [deepgramInput, setDeepgramInput] = useState("");
  const [visionOpen, setVisionOpen] = useState(false);
  const [visionKey, setVisionKey] = useState("");
  const [visionModel, setVisionModel] = useState("gpt-6-sol");
  const [visionBase, setVisionBase] = useState(demoVision.baseUrl);
  const [hosted, setHosted] = useState<HostedImageStatus>(demoHosted);
  const [hostedUrl, setHostedUrl] = useState("");
  const [hostedToken, setHostedToken] = useState("");
  const [imageAvailable, setImageAvailable] = useState(false);
  const [imageRendering, setImageRendering] = useState(false);
  const [voiceShortcutAvailable, setVoiceShortcutAvailable] = useState(false);
  const imageRenderingRef = useRef(false);
  const speechCancelRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeEnabledRef = useRef(false);
  const awakeUntilRef = useRef(0);
  const suppressSpeechUntilRef = useRef(0);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const nativeWakeRef = useRef(false);
  const nativeSpeechRef = useRef(false);
  const sampleRateRef = useRef(16_000);
  const dictationActiveRef = useRef(false);
  const dictationReadyRef = useRef(false);
  const dictationStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const voicedFramesRef = useRef(0);
  const feedChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const queuedFeedsRef = useRef(0);
  const dictationSessionRef = useRef(0);
  const automaticDictationRef = useRef(false);
  const pendingAudioRef = useRef<number[][]>([]);
  const expandedRef = useRef(false);
  const askingRef = useRef(false);
  const visionOpenRef = useRef(false);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);
  useEffect(() => {
    void window.ren?.visionStatus?.().then((status) => {
      setVision(status);
      setVisionModel(status.model);
      setVisionBase(status.baseUrl);
    }).catch(() => setError("Ren could not read the vision provider settings."));
  }, []);
  useEffect(() => { void window.ren?.deepgramStatus?.().then(setDeepgram).catch(() => setError("Could not read Deepgram settings.")); }, []);
  useEffect(() => { void window.ren?.voiceShortcutAvailable?.().then(setVoiceShortcutAvailable).catch(() => {}); }, []);
  useEffect(() => {
    void window.ren?.hostedImageStatus?.().then((status) => {
      setHosted(status);
      setHostedUrl(status.baseUrl);
    }).catch(() => setError("Ren could not read the hosted image service settings."));
  }, []);
  useEffect(() => window.ren?.onFocusSelection(() => {
    visionOpenRef.current = false;
    setVisionOpen(false);
    setVisionKey("");
    void askQuestion("Explain what is inside the area I circled on my screen. Start with the part I selected, and show me how it connects to what I'm doing.");
  }), []);
  useEffect(() => window.ren?.onActivateVoice?.(() => {
    void setExpanded(true);
    if (askingRef.current) { window.setTimeout(() => questionRef.current?.focus(), 0); return; }
    speechCancelRef.current?.();
    if (nativeSpeechRef.current) void startNativeDictation();
    else window.setTimeout(() => questionRef.current?.focus(), 0);
  }), []);

  useEffect(() => {
    void (async () => {
      const status = window.ren ? await window.ren.permissionStatus() : readyStatus;
      setPermission(status);
      if (!status.ready || status.microphone !== "granted" || !window.ren) await setExpanded(true);
      if (status.ready) await startAutomaticCapture();
    })();
  }, []);

  useEffect(() => {
    if (!window.ren || (permission?.ready && permission.interaction === "granted" && permission.microphone === "granted")) return;
    const refresh = () => { void window.ren?.permissionStatus().then(setPermission).catch(() => {}); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 2500);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [permission?.ready, permission?.interaction, permission?.microphone]);

  useEffect(() => {
    if (!permission?.ready || (window.ren && permission.microphone !== "granted")) return;
    let disposed = false;
    let media: MediaStream | null = null;
    let context: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    void (async () => {
      if (window.ren && await window.ren.wakeAvailable()) {
        try {
          nativeSpeechRef.current = await window.ren.speechAvailable();
          media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
          if (disposed) { media.getTracks().forEach((track) => track.stop()); return; }
          context = new AudioContext();
          sampleRateRef.current = context.sampleRate;
          if (!await window.ren.wakeStart(context.sampleRate)) throw new Error("Local wake engine could not start");
          nativeWakeRef.current = true;
          const source = context.createMediaStreamSource(media);
          processor = context.createScriptProcessor(2048, 1, 1);
          let pending = false;
          const recentAudio: number[][] = [];
          processor.onaudioprocess = (event) => {
            if (disposed || visionOpenRef.current) return;
            const samples = Array.from(event.inputBuffer.getChannelData(0));
            if (dictationActiveRef.current) {
              const now = Date.now();
              const level = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
              if (level > 0.012) {
                voicedFramesRef.current += 1;
                lastVoiceAtRef.current = now;
              }
              if (!dictationReadyRef.current) {
                // Keep the question spoken while the cloud socket connects.
                if (pendingAudioRef.current.length >= 180) pendingAudioRef.current.shift();
                pendingAudioRef.current.push(samples);
                return;
              }
              if (queuedFeedsRef.current >= 24) {
                setError("Deepgram audio stream could not keep up. Try again.");
                stopNativeDictation();
                return;
              }
              const session = dictationSessionRef.current;
              queuedFeedsRef.current += 1;
              feedChainRef.current = feedChainRef.current.then(async () => {
                if (session !== dictationSessionRef.current) return;
                if (!await window.ren!.speechFeed(samples)) throw new Error("Deepgram audio stream stopped");
              }).catch(() => {
                if (session !== dictationSessionRef.current) return;
                setError("Deepgram dictation stopped. Check your network and key.");
                stopNativeDictation();
              }).finally(() => { if (session === dictationSessionRef.current) queuedFeedsRef.current -= 1; });
              if ((voicedFramesRef.current >= 2 && now - lastVoiceAtRef.current > 2000) || now - dictationStartedAtRef.current > (voicedFramesRef.current ? 30_000 : 10_000)) void finishNativeDictation();
              return;
            }
            if (pending || Date.now() < suppressSpeechUntilRef.current) return;
            recentAudio.push(samples);
            if (recentAudio.length > 24) recentAudio.shift();
            pending = true;
            void window.ren!.wakeFeed(samples).then((woke) => {
              if (woke && !disposed) {
                if (nativeSpeechRef.current) void startNativeDictation(recentAudio.slice());
                else handleAmbientTranscript("Hey Ren");
              }
            }).catch(() => setError("Local wake engine stopped. Click Ren to ask.")).finally(() => { pending = false; });
          };
          source.connect(processor);
          processor.connect(context.destination);
          return;
        } catch {
          media?.getTracks().forEach((track) => track.stop());
          void context?.close();
          await window.ren.wakeStop();
        }
      }
      if (disposed) return;
    const browserWindow = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) { setError("Wake phrase is unavailable on this system; click Ren or use the text box."); return; }
    const recognition = new Recognition();
    if (!("processLocally" in recognition)) {
      setError("Local wake-word recognition is unavailable here. Click Ren to talk; room audio will not be sent to a cloud wake service.");
      return;
    }
    recognition.processLocally = true;
    wakeEnabledRef.current = true;
    recognition.continuous = true; recognition.interimResults = false; recognition.lang = navigator.language;
    recognition.onresult = (event) => {
      const finals = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript.trim()).filter(Boolean);
      const transcript = finals.at(-1);
      if (!transcript || Date.now() < suppressSpeechUntilRef.current) return;
      handleAmbientTranscript(transcript);
    };
    recognition.onend = () => {
      if (wakeEnabledRef.current) window.setTimeout(() => { try { recognition.start(); } catch { /* already running */ } }, 250);
    };
    recognition.onerror = () => setVoiceState("idle");
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* permission flow will retry on remount */ }
    })();
    return () => {
      disposed = true;
      nativeWakeRef.current = false;
      nativeSpeechRef.current = false;
      dictationActiveRef.current = false;
      dictationReadyRef.current = false;
      pendingAudioRef.current = [];
      wakeEnabledRef.current = false;
      recognitionRef.current?.stop();
      processor?.disconnect();
      media?.getTracks().forEach((track) => track.stop());
      void context?.close();
      void window.ren?.wakeStop();
      void window.ren?.speechStop();
    };
  }, [permission?.ready, permission?.microphone]);

  async function setExpanded(value: boolean) {
    expandedRef.current = value;
    setExpandedState(value);
    if (!value) { stopNativeDictation(); visionOpenRef.current = false; setVisionOpen(false); setVisionKey(""); }
    await window.ren?.setExpanded(value);
  }

  function stopNativeDictation() {
    dictationSessionRef.current += 1;
    dictationActiveRef.current = false;
    dictationReadyRef.current = false;
    automaticDictationRef.current = false;
    pendingAudioRef.current = [];
    void window.ren?.speechStop();
  }

  async function startNativeDictation(preRoll: number[][] = [], automatic = false) {
    if (!window.ren || !nativeSpeechRef.current || dictationActiveRef.current) return;
    setError("");
    dictationActiveRef.current = true;
    automaticDictationRef.current = automatic;
    const session = ++dictationSessionRef.current;
    dictationReadyRef.current = false;
    dictationStartedAtRef.current = Date.now();
    lastVoiceAtRef.current = 0;
    voicedFramesRef.current = 0;
    feedChainRef.current = Promise.resolve();
    queuedFeedsRef.current = 0;
    pendingAudioRef.current = preRoll;
    if (session !== dictationSessionRef.current) return;
    setVoiceState("listening"); keepAwake();
    try {
      if (!await window.ren.speechStart(sampleRateRef.current)) throw new Error("Deepgram dictation could not start");
      if (session !== dictationSessionRef.current) return;
      dictationStartedAtRef.current = Date.now();
      for (const samples of pendingAudioRef.current.splice(0)) {
        feedChainRef.current = feedChainRef.current.then(async () => {
          if (session !== dictationSessionRef.current) return;
          if (!await window.ren!.speechFeed(samples)) throw new Error("Deepgram audio stream stopped");
        });
      }
      dictationReadyRef.current = true;
    } catch (reason) {
      if (session !== dictationSessionRef.current) return;
      stopNativeDictation();
      setVoiceState("idle");
      setError(reason instanceof Error ? reason.message : "Deepgram is unavailable. Check your key and network in AI settings.");
    }
  }

  async function finishNativeDictation() {
    if (!dictationActiveRef.current || !window.ren) return;
    const session = dictationSessionRef.current;
    const automatic = automaticDictationRef.current;
    automaticDictationRef.current = false;
    dictationActiveRef.current = false;
    dictationReadyRef.current = false;
    setVoiceState("processing");
    try {
      await feedChainRef.current;
      if (session !== dictationSessionRef.current) return;
      const transcript = (await window.ren.speechFinish()).replace(/^(?:hey\s+)?(?:ren|run)\b[.,:;\s-]*/i, "").trim();
      if (session !== dictationSessionRef.current) return;
      if (transcript) await askQuestion(transcript);
      else {
        setVoiceState("idle");
        if (!automatic || voicedFramesRef.current >= 2) setError("I didn't catch that. Say “Hey Ren” and try again, or type your question.");
        keepAwake();
      }
    } catch (reason) {
      if (session !== dictationSessionRef.current) return;
      setVoiceState("idle");
      setError(reason instanceof Error ? reason.message : "Deepgram could not finish dictation. Try again.");
      stopNativeDictation();
    }
  }

  async function startAutomaticCapture() {
    if (!window.ren) { setSource({ id: "preview", name: "current display", thumbnail: "" }); return; }
    try {
      setSource(await window.ren.primarySource());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t access the current display."); }
  }

  async function requestOneTimePermissions() {
    setError("");
    try {
      const status = window.ren ? await window.ren.requestPermissions() : readyStatus;
      setPermission(status);
      if (status.ready) { await startAutomaticCapture(); greet(status.microphone === "granted" ? "All set. From now on, just say “Hey Ren.”" : "Screen access is ready. Type a question to begin."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Permissions could not be completed."); }
  }

  async function openPermissionSettings() {
    if (!window.ren) return;
    try {
      // A capture attempt registers Ren with macOS before opening the list.
      const status = await window.ren.requestPermissions();
      setPermission(status);
      if (status.ready) { await startAutomaticCapture(); greet(status.microphone === "granted" ? "All set. From now on, just say “Hey Ren.”" : "Screen access is ready. Type a question to begin."); }
      else await window.ren.openPermissionSettings();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t request screen access."); }
  }

  async function enableMicrophone() {
    if (!window.ren) return;
    setError("");
    try {
      // Request the device from the focused renderer. On macOS this presents
      // the TCC prompt for the signed app and also exercises the media path
      // that the wake listener will use after permission is granted.
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          // A previous denial is handled by the native status below.
        }
      }
      let status = await window.ren.permissionStatus();
      if (status.microphone === "not-determined") status = await window.ren.requestPermissions();
      setPermission(status);
      if (status.microphone !== "granted") {
        await window.ren.openPermissionSettings("microphone");
        setError("After enabling Ren in Microphone settings, quit and reopen Ren so macOS applies the grant.");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t request microphone access."); }
  }

  async function enableCircle() {
    if (!window.ren) return;
    const status = await window.ren.enableCircleInput();
    setPermission(status);
    if (status.interaction !== "granted") setError(window.ren.platform === "darwin"
      ? "Allow Ren in Accessibility in System Settings, then return to Ren. If it is already on, remove the old Ren entry and add this signed Ren app."
      : "The global circle shortcut is unavailable on this desktop. You can still point and ask Ren.");
    else setError("");
  }

  function openVisionSettings() {
    stopNativeDictation();
    visionOpenRef.current = true;
    setVisionOpen(true);
    setError("");
  }

  async function saveVision(event: FormEvent) {
    event.preventDefault();
    if (!window.ren) return;
    try {
      const status = await window.ren.saveVisionSettings({ apiKey: visionKey, model: visionModel, baseUrl: visionBase });
      setVision(status);
      setVisionKey("");
      nativeSpeechRef.current = await window.ren.speechAvailable();
      visionOpenRef.current = false;
      setVisionOpen(false);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the vision provider."); }
  }

  async function saveDeepgram() {
    if (!window.ren) return;
    try {
      setDeepgram(await window.ren.saveDeepgramKey(deepgramInput));
      setDeepgramInput("");
      nativeSpeechRef.current = true;
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the Deepgram key."); }
  }

  async function clearDeepgram() {
    if (!window.ren) return;
    try {
      setDeepgram(await window.ren.clearDeepgramKey());
      nativeSpeechRef.current = await window.ren.speechAvailable();
      setDeepgramInput("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove the Deepgram key."); }
  }

  async function speak(text: string, onEnd: () => void) {
    if (!window.ren?.onSpeechData || typeof AudioContext === "undefined") {
      setError("Speech playback is unavailable on this system.");
      onEnd(); return;
    }
    speechCancelRef.current?.();
    suppressSpeechUntilRef.current = Date.now() + 120_000;
    const id = crypto.randomUUID();
    const context = new AudioContext();
    let finished = false;
    let unsubscribe = () => {};
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let player: PcmStreamPlayer | null = null;
    const finish = (reason?: string, notify = true) => {
      if (finished) return;
      finished = true;
      if (startTimer) clearTimeout(startTimer);
      unsubscribe();
      player?.dispose();
      speechCancelRef.current = null;
      if (reason) setError(reason);
      suppressSpeechUntilRef.current = Date.now() + 800;
      if (notify) onEnd();
    };
    player = new PcmStreamPlayer(context, () => finish());
    unsubscribe = window.ren.onSpeechData((data) => {
      if (data.id !== id || finished) return;
      if (data.error) { finish(data.error); return; }
      try {
        if (data.chunk) player?.push(Uint8Array.from(atob(data.chunk), (character) => character.charCodeAt(0)));
        if (data.done) player?.complete();
      } catch (reason) { finish(reason instanceof Error ? reason.message : "Deepgram speech could not play."); }
    });
    speechCancelRef.current = () => finish(undefined, false);
    startTimer = setTimeout(() => {
      if (context.state !== "running") finish("Audio playback did not start. Click Ren’s microphone button and try again.");
    }, 10_000);
    void context.resume().catch(() => finish("Audio playback could not start."));
    try {
      await window.ren.speak(id, text);
    } catch (reason) {
      finish(reason instanceof Error ? reason.message : "Deepgram speech is unavailable.");
    }
  }

  async function saveHosted() {
    if (!window.ren) return;
    try {
      const status = await window.ren.saveHostedImageSettings({ baseUrl: hostedUrl, accessToken: hostedToken });
      setHosted(status);
      setHostedToken("");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the Ren image service."); }
  }

  async function clearHosted() {
    if (!window.ren) return;
    try {
      const status = await window.ren.clearHostedImageSettings();
      setHosted(status);
      setHostedUrl(status.baseUrl);
      setHostedToken("");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not disconnect the Ren image service."); }
  }

  async function clearVision() {
    if (!window.ren) return;
    try {
      const status = await window.ren.clearVisionSettings();
      setVision(status);
      setVisionModel(status.model);
      setVisionBase(status.baseUrl);
      setVisionKey("");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove the vision provider."); }
  }

  function keepAwake() {
    awakeUntilRef.current = Date.now() + 20_000;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => { if (voiceStateRef.current === "idle" && !dictationActiveRef.current && !visionOpenRef.current) void setExpanded(false); }, 20_000);
  }

  function greet(text = "Hey—what’s up? How can I help?") {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: text }]);
    setVoiceState("responding"); keepAwake();
    suppressSpeechUntilRef.current = Date.now() + 2_500;
    void speak(text, () => setVoiceState(nativeWakeRef.current ? "idle" : "listening"));
  }

  function handleAmbientTranscript(transcript: string) {
    const wakeMatch = transcript.match(/\b(?:hey\s+(?:ren|run)|ren)\b/i);
    const alreadyAwake = Date.now() < awakeUntilRef.current;
    if (!wakeMatch && !alreadyAwake) return;
    keepAwake(); setVoiceState("listening");
    const remainder = wakeMatch ? transcript.slice((wakeMatch.index ?? 0) + wakeMatch[0].length).replace(/^[,.:;\s-]+/, "") : transcript;
    if (remainder) void askQuestion(remainder);
    else if (nativeWakeRef.current && nativeSpeechRef.current) void startNativeDictation();
    else greet(nativeWakeRef.current ? "Hey, I'm here. Type your question about what you're pointing at." : undefined);
  }

  async function captureBurst(question: string) {
    return window.ren ? window.ren.captureContext(!wantsVisualCreation(question), question) : { frames: [], pointer: { x: .5, y: .5 } } satisfies ScreenContext;
  }

  async function askQuestion(rawQuestion: string) {
    const clean = rawQuestion.trim(); if (!clean) return;
    if (askingRef.current) { setError("Ren is still answering. Try the circle again when the answer finishes."); return; }
    askingRef.current = true;
    stopNativeDictation();
    setQuestion(""); setError(""); setVoiceState("processing"); keepAwake();
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: clean }]);
    try {
      const history = messagesRef.current.slice(-8).map(({ role, content }) => ({ role, content }));
      const response = window.ren ? await (async () => { const context = await captureBurst(clean); return window.ren!.ask({ question: clean, ...context, history }); })() : { answer: "I can see the interaction working in preview mode. The packaged desktop app will use your current screen and cursor as context.", annotations: [], provider: "demo" as const };
      if (!response.reusedVisual) setImageAvailable(!!response.visualLesson && !interactiveSceneFor(response.visualLesson));
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer, provider: response.provider, followUps: response.followUps }]);
      setVoiceState("responding"); suppressSpeechUntilRef.current = Date.now() + Math.min(12_000, response.answer.length * 45);
      void speak(response.answer, () => {
        if (nativeSpeechRef.current && expandedRef.current && !visionOpenRef.current) void startNativeDictation([], true);
        else { setVoiceState("idle"); keepAwake(); }
      });
      if (response.autoIllustrate) void illustrate(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t answer."); setVoiceState("idle"); }
    finally { askingRef.current = false; }
  }

  function submit(event: FormEvent) { event.preventDefault(); void askQuestion(question); }

  async function illustrate(automatic = false) {
    if (!window.ren || imageRenderingRef.current) return;
    imageRenderingRef.current = true;
    setImageRendering(true); setError("");
    setImageAvailable(false);
    try { if (!await window.ren.generateIllustration(automatic)) setImageAvailable(true); }
    catch (reason) { setImageAvailable(true); setError(reason instanceof Error ? reason.message : "Could not render an illustration."); }
    finally { imageRenderingRef.current = false; setImageRendering(false); }
  }

  if (!expanded) return <button className={`ren-pebble state-${voiceState}`} onClick={() => void setExpanded(true)} aria-label={`Open Ren. ${error ? "Needs attention" : imageRendering ? "Rendering your illustration" : permission?.microphone === "granted" ? voiceLabels[voiceState].title : "Microphone setup needed"}`}><span className="pebble-mark"><Spark /></span><span className="pebble-copy"><strong>{error ? "Try again" : imageRendering ? "Rendering visual…" : permission?.microphone === "granted" ? voiceLabels[voiceState].title : "Microphone off"}</strong><small>{error ? /didn't catch/i.test(error) ? "I didn't catch that" : "Open Ren for details" : imageRendering ? "Drawing on your screen" : permission?.microphone === "granted" ? voiceLabels[voiceState].detail : "Open Ren to enable voice"}</small></span><VoiceMeter active={voiceState !== "idle" || imageRendering} /><span className="privacy-dot" aria-hidden="true" /></button>;

  return <main className="ambient-panel">
    <header className={`ambient-header state-${voiceState}`}><div className="companion-orb"><Spark /></div><div className="header-copy"><p><span className="state-dot" /> REN</p><h1>{voiceState === "processing" ? "Looking closely…" : imageRendering ? "Drawing on your screen…" : voiceState === "listening" ? "I’m listening." : voiceState === "responding" ? "Let’s work through it." : "How can I help?"}</h1></div><VoiceMeter active={voiceState !== "idle" || imageRendering} /><button className="collapse-button" onClick={() => void setExpanded(false)} aria-label="Collapse Ren">⌃</button></header>

    {!permission?.ready ? <section className="onboarding-card"><span className="step-kicker">ONE-TIME SETUP</span><h2>Give Ren permission once.</h2><p>Allow microphone, screen recording, and pointer access now. After that, Ren starts quietly with your computer and only captures the screen when you ask a question.</p><div className="permission-row"><span>Microphone</span><b>{permission?.microphone ?? "checking"}</b></div><div className="permission-row"><span>Screen recording</span><b>{permission?.screen ?? "checking"}</b></div><div className="permission-row"><span>Circle shortcut</span><b>{permission?.interaction ?? "checking"}</b></div><button className="allow-button" onClick={() => void requestOneTimePermissions()}>Allow and continue</button>{permission && !permission.ready && <button className="settings-link" onClick={() => void openPermissionSettings()}>Request access and open system settings</button>}</section> : <>
      <div className="ambient-status"><span className="privacy-lock" aria-hidden="true">●</span><span>{vision.mode === "demo" ? "Connect OpenAI for screen answers" : `On-demand · OpenAI ${vision.model}`}</span><em>·</em><span className="display-name">{source?.name ?? "connecting to display"}</span><button className="provider-chip" onClick={openVisionSettings}>{vision.mode === "demo" || deepgram.mode === "demo" ? "Connect AI" : "AI settings"}</button></div>
      {visionOpen ? <form className="vision-settings" onSubmit={(event) => void saveVision(event)}><span className="step-kicker">CLOUD VOICE</span><h2>Connect Deepgram</h2><p>Ren keeps the small “Hey Ren” detector on your Mac. After it wakes, Ren streams your spoken question to Deepgram for transcription and sends reply text to Deepgram for speech. Deepgram may charge for usage.</p><label>Deepgram API key<input aria-label="Deepgram API key" type="password" value={deepgramInput} onChange={(event) => setDeepgramInput(event.target.value)} placeholder={deepgram.mode === "demo" ? "Enter your Deepgram key" : "Deepgram key saved"} autoComplete="off" /></label><div className="vision-actions"><button type="button" className="allow-button" onClick={() => void saveDeepgram()}>Save Deepgram key</button>{deepgram.mode === "connected" && <button type="button" onClick={() => void clearDeepgram()}>Remove Deepgram key</button>}</div><span className="step-kicker">SCREEN-AWARE ANSWERS</span><h2>Connect OpenAI</h2><p>When you ask about your screen, Ren sends your question and an on-demand screen snapshot to OpenAI. OpenAI may charge for requests.</p><label>Model<input aria-label="Vision model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} spellCheck={false} /></label><label>OpenAI API key<input aria-label="OpenAI API key" type="password" value={visionKey} onChange={(event) => setVisionKey(event.target.value)} placeholder={vision.mode === "connected" ? "Leave blank to keep saved key" : "Enter your OpenAI key"} autoComplete="off" /></label><div className="vision-actions"><button type="submit" className="allow-button">Save OpenAI key</button><button type="button" onClick={() => { visionOpenRef.current = false; setVisionOpen(false); setVisionKey(""); setDeepgramInput(""); setError(""); }}>Back to Ren</button>{vision.mode === "connected" && <button type="button" onClick={() => void clearVision()}>Remove OpenAI key</button>}</div><div className="hosted-settings"><span className="step-kicker">REALISTIC ON-SCREEN IMAGES</span><h2>Ren image service</h2><p>{hosted.mode === "demo" ? "Connect the Ren hosted image service once. Your validated lesson part names and connections go to this service when you approve an illustration; no screen screenshot is sent. The service uses your Ren illustration allowance." : `Connected to ${hosted.host}. Illustration requests use your Ren allowance; no screen screenshot is sent.`}</p><label>Ren image service URL<input aria-label="Ren image service URL" value={hostedUrl} onChange={(event) => setHostedUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveHosted(); } }} placeholder="https://images.ren.example/v1" spellCheck={false} /></label><label>Ren access token<input aria-label="Ren access token" type="password" value={hostedToken} onChange={(event) => setHostedToken(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveHosted(); } }} placeholder={hosted.mode === "connected" ? "Leave blank to keep saved token" : "Enter your Ren access token"} autoComplete="off" /></label><div className="vision-actions"><button type="button" className="allow-button" onClick={() => void saveHosted()}>Save image service</button>{hosted.mode === "connected" && <button type="button" onClick={() => void clearHosted()}>Disconnect service</button>}</div></div></form> : <section className="ambient-conversation" aria-live="polite">{permission?.microphone !== "granted" && window.ren && <button className="demo-notice" onClick={() => void enableMicrophone()}>Enable microphone to talk to Ren. I’ll open the macOS setting if needed.</button>}{(vision.mode === "demo" || deepgram.mode === "demo") && <button className="demo-notice" onClick={openVisionSettings}>Connect your OpenAI and Deepgram keys to use screen answers and voice.</button>}{messages.length === 0 && <div className="empty-conversation"><div className="cursor-cue"><Spark /><span /></div><p>Point at anything on your screen</p><strong>“Hey Ren, explain this.”</strong><small>I’ll look, talk it through, and draw when it helps.</small></div>}{messages.map((message, index) => <article key={message.id} className={message.role}><span>{message.role === "assistant" ? `REN${message.provider ? ` · ${message.provider.toUpperCase()}` : ""}` : "YOU"}</span><p>{message.content}</p>{index === messages.length - 1 && message.followUps?.length ? <div className="follow-ups" aria-label="Suggested follow-up questions">{message.followUps.map((prompt) => <button key={prompt} onClick={() => void askQuestion(prompt)} disabled={voiceState === "processing"}>{prompt}<b aria-hidden="true">↗</b></button>)}</div> : null}</article>)}</section>}
      {error && <div className="ambient-error" role="alert">{error}</div>}
      {!visionOpen && <><form className="ambient-composer" onSubmit={submit}><button type="button" className={`listen-button state-${voiceState}`} onClick={() => { if (nativeSpeechRef.current) { if (dictationActiveRef.current) void finishNativeDictation(); else void startNativeDictation(); return; } if (!recognitionRef.current) { setError("Connect Deepgram in AI settings to use voice."); questionRef.current?.focus(); return; } keepAwake(); try { recognitionRef.current.start(); setVoiceState("listening"); } catch { setError("Speech recognition could not start. Check Deepgram settings."); questionRef.current?.focus(); } }} aria-label={dictationActiveRef.current ? "Finish speaking" : "Start listening"}><MicGlyph /></button><textarea ref={questionRef} aria-label="Ask Ren" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askQuestion(question); } }} placeholder="Ask about what you’re pointing at…" rows={1} /><button type="submit" className="ask-button" disabled={!question.trim() || voiceState === "processing"} aria-label="Send question">↑</button></form><footer><span><i aria-hidden="true" /> Say “Hey Ren”{voiceShortcutAvailable ? <> or press {window.ren?.platform === "darwin" ? "⌘⇧Space" : "Ctrl+Shift+Space"}</> : null} to talk</span>{permission?.interaction !== "granted" && <button onClick={() => void enableCircle()}>Enable circle</button>}{imageAvailable && (hosted.mode !== "demo" || vision.host === "api.openai.com") && <button onClick={() => void illustrate()} disabled={imageRendering}>{imageRendering ? "Rendering…" : hosted.mode !== "demo" ? "Illustrate on screen · Ren cloud" : "Illustrate on screen · OpenAI may charge"}</button>}<button onClick={() => { setImageAvailable(false); void window.ren?.clearAnnotations(); }}>Clear drawings</button></footer></>}
    </>}
  </main>;
}
