import { FormEvent, useEffect, useRef, useState } from "react";
import type { AmbientStatus, AskResponse, ConversationTurn, DeepgramStatus, HostedImageStatus, ScreenContext, VisionStatus, VoiceMode } from "./contracts";
import { PcmStreamPlayer } from "./pcm-player";
import { interactiveSceneFor } from "../electron/interactive-scene";
import { wantsVisualCreation } from "../electron/visual-intent";
import { detectAgentJobIntent } from "../electron/agent-job-intent";
import type { AgentJobSnapshot } from "../electron/agent-jobs";

type VoiceState = "idle" | "listening" | "processing" | "responding";
type PanelTab = "home" | "agents" | "connections";
type PromptMode = "ask" | "agent" | "chat";
type Message = ConversationTurn & { id: string; provider?: AskResponse["provider"]; followUps?: string[]; sources?: { title: string; url: string }[] };
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
  listening: { title: "Listening", detail: "Follow up without saying Hey Ren" },
  processing: { title: "Thinking", detail: "Reading your screen" },
  responding: { title: "Speaking", detail: "Working it through" },
};
const Spark = () => <svg aria-hidden="true" viewBox="0 0 32 32" className="spark"><path d="M16 2c.8 8.6 5.4 13.2 14 14-8.6.8-13.2 5.4-14 14-.8-8.6-5.4-13.2-14-14 8.6-.8 13.2-5.4 14-14Z" /></svg>;
const VoiceMeter = ({ active = false }: { active?: boolean }) => <span className={`voice-meter${active ? " is-active" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;

export function App() {
  const [permission, setPermission] = useState<AmbientStatus | null>(null);
  const previousMicrophonePermissionRef = useRef<string | undefined>(undefined);
  const [expanded, setExpandedState] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [dictationActive, setDictationActive] = useState(false);
  const voiceStateRef = useRef<VoiceState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [homePrompt, setHomePrompt] = useState("");
  const [panelTab, setPanelTab] = useState<PanelTab>("home");
  const [promptMode, setPromptMode] = useState<PromptMode>("ask");
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
  const [voiceMode, setVoiceMode] = useState<VoiceMode>({ paused: false, alwaysOn: false });
  const [agentJob, setAgentJob] = useState<AgentJobSnapshot | null>(null);
  const agentJobIdRef = useRef<string | null>(null);
  const ignoredAgentJobIdsRef = useRef(new Set<string>());
  const voicePausedRef = useRef(false);
  const alwaysOnRef = useRef(false);
  const imageRenderingRef = useRef(false);
  const queuedIllustrationRef = useRef(false);
  const speechCancelRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeEnabledRef = useRef(false);
  const awakeUntilRef = useRef(0);
  const suppressSpeechUntilRef = useRef(0);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<Message[]>([]);
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
  const conversationOpenRef = useRef(false);
  const awaitingFollowUpRef = useRef(false);
  const pendingAudioRef = useRef<number[][]>([]);
  const expandedRef = useRef(false);
  const askingRef = useRef(false);
  const askGenerationRef = useRef(0);
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
    const previous = previousMicrophonePermissionRef.current;
    previousMicrophonePermissionRef.current = permission?.microphone;
    if (previous && previous !== "granted" && expandedRef.current && permission?.microphone === "granted" && !visionOpenRef.current) {
      void setExpanded(false);
    }
  }, [permission?.ready, permission?.microphone]);
  useEffect(() => {
    void window.ren?.voiceModeStatus?.().then(applyVoiceMode).catch(() => {});
    return window.ren?.onVoiceModeChanged?.(applyVoiceMode);
  }, []);
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
    if (nativeSpeechRef.current) void startNativeDictation();
    else {
      setError("Voice is unavailable. Open Ren to check microphone and Deepgram settings, then circle again.");
      showCompanion();
      hideCompanionSoon();
    }
  }), []);
  useEffect(() => window.ren?.onActivateVoice?.(() => {
    if (voicePausedRef.current) return;
    if (nativeSpeechRef.current) void startNativeDictation();
    else {
      setError("Voice is unavailable. Open Ren manually to check the microphone and Deepgram settings.");
      showCompanion();
      hideCompanionSoon();
    }
  }), []);
  useEffect(() => window.ren?.onOpenPanel?.(() => { openVisionSettings(); }), []);
  useEffect(() => window.ren?.onOpenHome?.(() => {
    visionOpenRef.current = false;
    setVisionOpen(false);
    setPanelTab("home");
    void setExpanded(true);
  }), []);
  useEffect(() => window.ren?.onAgentJobUpdate?.(handleAgentJobUpdate), []);

  useEffect(() => {
    void (async () => {
      const status = window.ren ? await window.ren.permissionStatus() : readyStatus;
      setPermission(status);
      if (status.microphone !== "granted") await setExpanded(true);
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
    if (!permission || voiceMode.paused || (window.ren ? permission.microphone !== "granted" : !permission.ready)) return;
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
          let wasAwaitingFollowUp = false;
          let followUpVoiceFrames = 0;
          processor.onaudioprocess = (event) => {
            if (disposed || visionOpenRef.current || voicePausedRef.current) return;
            const samples = Array.from(event.inputBuffer.getChannelData(0));
            if (dictationActiveRef.current) {
              wasAwaitingFollowUp = false;
              followUpVoiceFrames = 0;
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
                conversationOpenRef.current = false;
                awaitingFollowUpRef.current = false;
                stopNativeDictation();
                setVoiceState("idle");
                hideCompanionSoon();
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
                conversationOpenRef.current = false;
                awaitingFollowUpRef.current = false;
                stopNativeDictation();
                setVoiceState("idle");
                hideCompanionSoon();
              }).finally(() => { if (session === dictationSessionRef.current) queuedFeedsRef.current -= 1; });
              if ((voicedFramesRef.current >= 2 && now - lastVoiceAtRef.current > 2000) || now - dictationStartedAtRef.current > (voicedFramesRef.current ? 30_000 : 10_000)) void finishNativeDictation();
              return;
            }
            if (conversationOpenRef.current) {
              const interruptible = Boolean(speechCancelRef.current) || askingRef.current;
              if ((!awaitingFollowUpRef.current && !interruptible) || (!interruptible && Date.now() < suppressSpeechUntilRef.current)) {
                wasAwaitingFollowUp = false;
                followUpVoiceFrames = 0;
                return;
              }
              if (!wasAwaitingFollowUp) { recentAudio.length = 0; wasAwaitingFollowUp = true; }
              recentAudio.push(samples);
              if (recentAudio.length > 24) recentAudio.shift();
              const level = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
              followUpVoiceFrames = level > 0.012 ? followUpVoiceFrames + 1 : 0;
              if (followUpVoiceFrames >= 5) {
                followUpVoiceFrames = 0;
                awaitingFollowUpRef.current = false;
                void startNativeDictation(recentAudio.slice(), true);
              }
              return;
            }
            wasAwaitingFollowUp = false;
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
    if (!Recognition) { setError("Wake phrase is unavailable on this system. Open Ren to check voice settings."); return; }
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
      if (!transcript || disposed || voicePausedRef.current || Date.now() < suppressSpeechUntilRef.current) return;
      if (alwaysOnRef.current) {
        if (/^(?:stop listening|that(?:'|’)s all|goodbye|bye(?: ren)?|cancel)[.!\s]*$/i.test(transcript)) void endVoiceConversation();
        else void askQuestion(transcript);
      }
      else handleAmbientTranscript(transcript);
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
      conversationOpenRef.current = alwaysOnRef.current && !voicePausedRef.current;
      awaitingFollowUpRef.current = conversationOpenRef.current;
      pendingAudioRef.current = [];
      wakeEnabledRef.current = false;
      recognitionRef.current?.stop();
      processor?.disconnect();
      media?.getTracks().forEach((track) => track.stop());
      void context?.close();
      void window.ren?.wakeStop();
      void window.ren?.speechStop();
    };
  }, [permission?.ready, permission?.microphone, voiceMode.paused]);

  function applyVoiceMode(mode: VoiceMode) {
    if (!mode || typeof mode.paused !== "boolean" || typeof mode.alwaysOn !== "boolean") return;
    const wasAlwaysOn = alwaysOnRef.current;
    const wasPaused = voicePausedRef.current;
    voicePausedRef.current = mode.paused;
    alwaysOnRef.current = mode.alwaysOn;
    setVoiceMode(mode);
    if (mode.paused || (wasAlwaysOn && !mode.alwaysOn)) {
      conversationOpenRef.current = false;
      awaitingFollowUpRef.current = false;
      if (dictationActiveRef.current) stopNativeDictation();
      if (mode.paused) interruptCurrentResponse();
      setVoiceState("idle");
      if (!expandedRef.current) void window.ren?.setCompanionVisible?.(false);
    } else if (mode.alwaysOn && (!wasAlwaysOn || wasPaused)) {
      conversationOpenRef.current = true;
      awaitingFollowUpRef.current = true;
      setVoiceState("idle");
      showCompanion();
      hideCompanionSoon();
    }
  }

  async function endVoiceConversation() {
    interruptCurrentResponse();
    stopNativeDictation();
    conversationOpenRef.current = false;
    awaitingFollowUpRef.current = false;
    alwaysOnRef.current = false;
    if (window.ren?.stopVoiceConversation) await window.ren.stopVoiceConversation();
    await setExpanded(false);
  }

  function handleAgentJobUpdate(job: AgentJobSnapshot) {
    if (!job || typeof job.id !== "string") return;
    if (ignoredAgentJobIdsRef.current.has(job.id)) return;
    if (agentJobIdRef.current && agentJobIdRef.current !== job.id) return;
    setAgentJob(job);
    if (job.status === "running") {
      agentJobIdRef.current = job.id;
      conversationOpenRef.current = nativeSpeechRef.current;
      awaitingFollowUpRef.current = nativeSpeechRef.current;
      setVoiceState("processing");
      return;
    }
    if (agentJobIdRef.current !== job.id) return;
    agentJobIdRef.current = null;
    const answer = job.answer || job.error || (job.status === "cancelled" ? "I stopped that job." : "The job ended without a result.");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: answer, sources: job.sources }]);
    if (voicePausedRef.current) { setVoiceState("idle"); return; }
    setVoiceState("responding");
    void speak(answer, () => {
      if (conversationOpenRef.current && nativeSpeechRef.current) { awaitingFollowUpRef.current = true; setVoiceState("idle"); }
      else setVoiceState("idle");
      hideCompanionSoon();
    });
  }

  async function setExpanded(value: boolean) {
    expandedRef.current = value;
    setExpandedState(value);
    if (!value) {
      visionOpenRef.current = false; setVisionOpen(false); setVisionKey("");
    }
    await window.ren?.setExpanded(value, value);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    const active = dictationActiveRef.current || askingRef.current || imageRenderingRef.current || voiceStateRef.current === "processing" || voiceStateRef.current === "responding";
    await window.ren?.setCompanionVisible?.(value || active);
    if (!value && !active) hideCompanionSoon();
  }

  function showCompanion() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    void window.ren?.setCompanionVisible?.(true);
  }

  function hideCompanionSoon() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!expandedRef.current && !dictationActiveRef.current && !askingRef.current && !imageRenderingRef.current && voiceStateRef.current !== "responding" && voiceStateRef.current !== "processing") {
        void window.ren?.setCompanionVisible?.(false);
      }
    }, 1_800);
  }

  function stopNativeDictation() {
    dictationSessionRef.current += 1;
    dictationActiveRef.current = false;
    setDictationActive(false);
    dictationReadyRef.current = false;
    automaticDictationRef.current = false;
    pendingAudioRef.current = [];
    void window.ren?.speechStop();
  }

  function interruptCurrentResponse() {
    const wasAsking = askingRef.current;
    const currentJob = agentJobIdRef.current;
    askGenerationRef.current += 1;
    askingRef.current = false;
    if (wasAsking) void window.ren?.cancelAsk?.();
    if (currentJob) {
      agentJobIdRef.current = null;
      ignoredAgentJobIdsRef.current.add(currentJob);
      setAgentJob(null);
      void window.ren?.cancelAgentJob?.(currentJob);
    }
    speechCancelRef.current?.();
    suppressSpeechUntilRef.current = 0;
  }

  async function startNativeDictation(preRoll: number[][] = [], automatic = false) {
    if (!window.ren || !nativeSpeechRef.current || dictationActiveRef.current) return;
    interruptCurrentResponse();
    conversationOpenRef.current = true;
    awaitingFollowUpRef.current = false;
    showCompanion();
    setError("");
    dictationActiveRef.current = true;
    setDictationActive(true);
    if (expandedRef.current && !visionOpenRef.current) void setExpanded(false);
    automaticDictationRef.current = automatic;
    const session = ++dictationSessionRef.current;
    dictationReadyRef.current = false;
    dictationStartedAtRef.current = Date.now();
    lastVoiceAtRef.current = preRoll.length ? Date.now() : 0;
    voicedFramesRef.current = preRoll.length ? 3 : 0;
    feedChainRef.current = Promise.resolve();
    queuedFeedsRef.current = 0;
    pendingAudioRef.current = preRoll;
    if (session !== dictationSessionRef.current) return;
    setVoiceState("listening"); keepAwake();
    try {
      if (!await window.ren.speechStart(sampleRateRef.current)) throw new Error("Deepgram dictation could not start");
      if (session !== dictationSessionRef.current) return;
      // Opening the speech stream can overlap a visibility update from the
      // previous answer. Keep the notch visible once this session is ready.
      showCompanion();
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
      conversationOpenRef.current = false;
      setVoiceState("idle");
      setError(reason instanceof Error ? reason.message : "Deepgram is unavailable. Check your key and network in AI settings.");
      hideCompanionSoon();
    }
  }

  async function finishNativeDictation() {
    if (!dictationActiveRef.current || !window.ren) return;
    const session = dictationSessionRef.current;
    const automatic = automaticDictationRef.current;
    automaticDictationRef.current = false;
    dictationActiveRef.current = false;
    setDictationActive(false);
    dictationReadyRef.current = false;
    setVoiceState("processing");
    try {
      await feedChainRef.current;
      if (session !== dictationSessionRef.current) return;
      const transcript = (await window.ren.speechFinish()).replace(/^(?:hey\s+)?(?:ren|run)\b[.,:;\s-]*/i, "").trim();
      if (session !== dictationSessionRef.current) return;
      if (/^(?:stop listening|that(?:'|’)s all|goodbye|bye(?: ren)?|cancel)[.!\s]*$/i.test(transcript)) { await endVoiceConversation(); return; }
      if (transcript) await askQuestion(transcript);
      else {
        if (conversationOpenRef.current) {
          awaitingFollowUpRef.current = true;
          setVoiceState("idle");
          hideCompanionSoon();
        } else {
          setVoiceState("idle");
          if (!automatic || voicedFramesRef.current >= 2) setError("I didn't catch that. Tap the microphone and try again.");
          keepAwake();
          hideCompanionSoon();
        }
      }
    } catch (reason) {
      if (session !== dictationSessionRef.current) return;
      setVoiceState("idle");
      setError(reason instanceof Error ? reason.message : "Deepgram could not finish dictation. Try again.");
      conversationOpenRef.current = false;
      awaitingFollowUpRef.current = false;
      stopNativeDictation();
      hideCompanionSoon();
    }
  }

  async function requestOneTimePermissions() {
    setError("");
    try {
      const status = window.ren ? await window.ren.requestPermissions() : readyStatus;
      setPermission(status);
      if (status.ready) greet(status.microphone === "granted" ? "All set. From now on, just say “Hey Ren.”" : "Screen access is ready. Enable the microphone to begin.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Permissions could not be completed."); }
  }

  async function openPermissionSettings() {
    if (!window.ren) return;
    try {
      // A capture attempt registers Ren with macOS before opening the list.
      const status = await window.ren.requestPermissions();
      setPermission(status);
      if (status.ready) greet(status.microphone === "granted" ? "All set. From now on, just say “Hey Ren.”" : "Screen access is ready. Enable the microphone to begin.");
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
    const bridge = window.ren;
    if (!bridge) return;
    const status = await bridge.enableCircleInput();
    setPermission(status);
    if (status.interaction !== "granted") setError(bridge.platform === "darwin"
      ? "Allow Ren in Accessibility in System Settings, then return to Ren. If it is already on, remove the old Ren entry and add this signed Ren app."
      : "The global circle shortcut is unavailable on this desktop. You can still point and ask Ren.");
    else setError("");
  }

  function openVisionSettings() {
    conversationOpenRef.current = false;
    awaitingFollowUpRef.current = false;
    stopNativeDictation();
    setVoiceState("idle");
    visionOpenRef.current = true;
    setVisionOpen(true);
    setError("");
    void setExpanded(true);
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
      await setExpanded(false);
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
      suppressSpeechUntilRef.current = Date.now() + 300;
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
    speechCancelRef.current = () => {
      void window.ren?.cancelSpeech?.(id);
      finish(undefined, false);
    };
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
    void speak(text, () => { setVoiceState(nativeWakeRef.current ? "idle" : "listening"); if (nativeWakeRef.current) hideCompanionSoon(); });
  }

  function handleAmbientTranscript(transcript: string) {
    const wakeMatch = transcript.match(/\b(?:hey\s+(?:ren|run)|ren)\b/i);
    const alreadyAwake = Date.now() < awakeUntilRef.current;
    if (!wakeMatch && !alreadyAwake) return;
    showCompanion();
    keepAwake(); setVoiceState("listening");
    const remainder = wakeMatch ? transcript.slice((wakeMatch.index ?? 0) + wakeMatch[0].length).replace(/^[,.:;\s-]+/, "") : transcript;
    if (remainder) void askQuestion(remainder);
    else if (nativeWakeRef.current && nativeSpeechRef.current) void startNativeDictation();
    else greet(nativeWakeRef.current ? "Hey, I'm here. Ask me about what you're pointing at." : undefined);
  }

  async function captureBurst(question: string) {
    return window.ren ? window.ren.captureContext(!wantsVisualCreation(question), question) : { frames: [], pointer: { x: .5, y: .5 }, contextToken: undefined } satisfies ScreenContext;
  }

  async function askQuestion(rawQuestion: string) {
    const clean = rawQuestion.trim(); if (!clean) return;
    if (/^(?:cancel|stop) (?:the |my )?(?:agent )?job[.!?]*$/i.test(clean) && agentJobIdRef.current && window.ren?.cancelAgentJob) {
      interruptCurrentResponse();
      setMessages((current) => [...current,
        { id: crypto.randomUUID(), role: "user", content: clean },
        { id: crypto.randomUUID(), role: "assistant", content: "I stopped that job." },
      ]);
      awaitingFollowUpRef.current = conversationOpenRef.current;
      setVoiceState("idle");
      hideCompanionSoon();
      return;
    }
    interruptCurrentResponse();
    const generation = ++askGenerationRef.current;
    const history = messagesRef.current.slice(-8).map(({ role, content }) => ({ role, content }));
    queuedIllustrationRef.current = false;
    askingRef.current = true;
    showCompanion();
    if (expandedRef.current && !visionOpenRef.current && promptMode !== "chat") void setExpanded(false);
    awaitingFollowUpRef.current = false;
    stopNativeDictation();
    setError(""); setVoiceState("processing"); keepAwake();
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: clean }]);
    try {
      const jobTask = detectAgentJobIntent(clean);
      if (jobTask && window.ren?.startAgentJob) {
        const context = await captureBurst(clean);
        if (generation !== askGenerationRef.current) return;
        if (!context.contextToken) throw new Error("Ren could not capture the screen for this job.");
        const started = await window.ren.startAgentJob({ task: jobTask, contextToken: context.contextToken });
        agentJobIdRef.current = started.id;
        setAgentJob(started);
        setVoiceState("processing");
        return;
      }
      const response = window.ren ? await (async () => { const context = await captureBurst(clean); if (generation !== askGenerationRef.current) return null; return window.ren!.ask({ question: clean, ...context, history }); })() : { answer: "I can see the interaction working in preview mode. The packaged desktop app will use your current screen and cursor as context.", annotations: [], provider: "demo" as const };
      if (!response || generation !== askGenerationRef.current) return;
      if (!response.reusedVisual) setImageAvailable(!!response.visualLesson && !interactiveSceneFor(response.visualLesson));
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer, provider: response.provider, followUps: response.followUps }]);
      setVoiceState("responding"); suppressSpeechUntilRef.current = Date.now() + Math.min(12_000, response.answer.length * 45);
      void speak(response.answer, () => {
        if (generation !== askGenerationRef.current) return;
        if (nativeSpeechRef.current && conversationOpenRef.current && !visionOpenRef.current) {
          awaitingFollowUpRef.current = true;
          setVoiceState("idle");
          hideCompanionSoon();
        }
        else { setVoiceState("idle"); keepAwake(); hideCompanionSoon(); }
      });
      if (response.autoIllustrate && generation === askGenerationRef.current) void illustrate(true);
    } catch (reason) {
      if (generation !== askGenerationRef.current) return;
      setError(reason instanceof Error ? reason.message : "Ren couldn’t answer.");
      if (conversationOpenRef.current && nativeSpeechRef.current) {
        awaitingFollowUpRef.current = true;
        setVoiceState("idle");
        hideCompanionSoon();
      } else { setVoiceState("idle"); hideCompanionSoon(); }
    }
    finally { if (generation === askGenerationRef.current) askingRef.current = false; }
  }

  async function illustrate(automatic = false) {
    if (!window.ren) return;
    if (imageRenderingRef.current) { if (automatic) queuedIllustrationRef.current = true; return; }
    imageRenderingRef.current = true;
    setImageRendering(true); setError("");
    showCompanion();
    if (expandedRef.current && !visionOpenRef.current) void setExpanded(false);
    setImageAvailable(false);
    try { if (!await window.ren.generateIllustration(automatic)) setImageAvailable(true); }
    catch (reason) { setImageAvailable(true); setError(reason instanceof Error ? reason.message : "Could not render an illustration."); }
    finally {
      imageRenderingRef.current = false;
      setImageRendering(false);
      if (queuedIllustrationRef.current) {
        queuedIllustrationRef.current = false;
        void illustrate(true);
      } else hideCompanionSoon();
    }
  }

  function toggleListening() {
    if (nativeSpeechRef.current) {
      if (dictationActiveRef.current) void finishNativeDictation();
      else void startNativeDictation();
      return;
    }
    if (!recognitionRef.current) { setError("Connect Deepgram in AI settings to use voice."); return; }
    keepAwake();
    try { recognitionRef.current.start(); setVoiceState("listening"); }
    catch { setError("Speech recognition could not start. Check Deepgram settings."); }
  }

  const stripStatus = voiceMode.paused ? "Paused"
    : error ? "Needs attention"
    : agentJob?.status === "running" ? "Running job"
    : imageRendering ? "Drawing"
    : dictationActive ? "Listening"
    : permission?.microphone !== "granted" ? "Mic off"
    : voiceLabels[voiceState].title;

  if (!expanded) return <button className={`ren-pebble state-${voiceState}`} onClick={() => { if (dictationActive || voiceState !== "idle") toggleListening(); else void setExpanded(true); }} onContextMenu={(event) => { event.preventDefault(); openVisionSettings(); }} aria-label={dictationActive ? "Finish speaking to Ren" : voiceState === "idle" ? "Open Ren" : "Start speaking to Ren"} title={error || "Open Ren. Right-click for connections."}><span className="pebble-mark"><span className="clicky-triangle" /></span><span className="pebble-copy"><strong>{stripStatus}</strong></span><VoiceMeter active={dictationActive || voiceState === "processing" || voiceState === "responding" || imageRendering} /></button>;

  const needsSetup = Boolean(window.ren) ? permission?.microphone !== "granted" : !permission?.ready;
  return <main className="ambient-panel">
    <header className="ambient-header"><span className="panel-grip" aria-hidden="true">⋮⋮</span><button className={`panel-tab ${!visionOpen && panelTab === "home" ? "selected" : ""}`} onClick={() => { setVisionOpen(false); visionOpenRef.current = false; setPanelTab("home"); }}>⌂ <span>Home</span></button><button className={`panel-tab ${!visionOpen && panelTab === "agents" ? "selected" : ""}`} onClick={() => { setVisionOpen(false); visionOpenRef.current = false; setPanelTab("agents"); }}>◈ <span>Agents</span></button><button className={`panel-tab ${!visionOpen && panelTab === "connections" ? "selected" : ""}`} onClick={() => { setVisionOpen(false); visionOpenRef.current = false; setPanelTab("connections"); }}>⌁ <span>Connect</span></button><button className={`panel-chrome ${visionOpen ? "selected" : ""}`} onClick={openVisionSettings} aria-label="Open Ren settings">⚙</button><button className="panel-chrome" onClick={() => void setExpanded(false)} aria-label="Collapse Ren">×</button></header>

    {needsSetup ? <section className="onboarding-card"><span className="step-kicker">ONE-TIME SETUP</span><h2>Give Ren permission once.</h2><p>Allow microphone, screen recording, and pointer access now. After that, Ren starts quietly with your computer and only captures the screen when you ask a question.</p><div className="permission-row"><span>Microphone</span><b>{permission?.microphone ?? "checking"}</b></div><div className="permission-row"><span>Screen recording</span><b>{permission?.screen ?? "checking"}</b></div><div className="permission-row"><span>Circle shortcut</span><b>{permission?.interaction ?? "checking"}</b></div>{permission?.ready && permission.microphone !== "granted" ? <button className="allow-button" onClick={() => void enableMicrophone()}>Enable microphone</button> : <button className="allow-button" onClick={() => void requestOneTimePermissions()}>Allow and continue</button>}{permission && !permission.ready && <button className="settings-link" onClick={() => void openPermissionSettings()}>Request access and open system settings</button>}</section> : <>
      {!visionOpen && panelTab === "home" && <section className="panel-home">
        <div className="panel-hero"><div className="hero-heading"><span className="hero-kicker">ASK REN</span><span className="hero-symbol" aria-hidden="true">✦</span></div><h1>What can I help with?</h1><p>Ask about what’s on your screen, or start a conversation.</p>
          <div className="panel-conversation">{messages.length ? messages.slice(-4).map((message) => <article key={message.id} className={message.role}><b>{message.role === "user" ? "YOU" : "REN"}</b><p>{message.content}</p>{message.role === "assistant" && message.followUps?.length ? <div className="panel-followups">{message.followUps.slice(0, 2).map((followUp) => <button key={followUp} onClick={() => void askQuestion(followUp)}>{followUp} ↗</button>)}</div> : null}</article>) : <div className="panel-suggestions"><span>TRY ASKING</span><button onClick={() => { setHomePrompt("Explain what’s on my screen"); }}>Explain what’s on my screen <b>↗</b></button><button onClick={() => { setHomePrompt("Help me understand this step by step"); }}>Help me understand this step by step <b>↗</b></button></div>}</div>
          <form className="panel-prompt" onSubmit={(event) => { event.preventDefault(); const text = homePrompt.trim(); if (!text) return; setHomePrompt(""); void askQuestion(promptMode === "agent" ? `spawn agent to ${text}` : text); }}><textarea rows={2} aria-label="Ask Ren" value={homePrompt} onChange={(event) => setHomePrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={promptMode === "agent" ? "Give an agent a task…" : promptMode === "chat" ? "Continue the conversation…" : "Ask Ren anything…"} /><button type="button" className="prompt-mic" aria-label={dictationActive ? "Finish speaking to Ren" : "Start speaking to Ren"} onClick={toggleListening}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-4 0h8" /></svg></button><button type="submit" aria-label="Send Ren prompt" disabled={!homePrompt.trim()}>➤</button></form>
          <div className="prompt-modes"><button type="button" className={promptMode === "ask" ? "active" : ""} aria-pressed={promptMode === "ask"} onClick={() => setPromptMode("ask")}>✦ Ask</button><button type="button" className={promptMode === "agent" ? "active" : ""} aria-pressed={promptMode === "agent"} onClick={() => setPromptMode("agent")}>◈ Agent</button><button type="button" className={promptMode === "chat" ? "active" : ""} aria-pressed={promptMode === "chat"} onClick={() => setPromptMode("chat")}>▤ Chat</button></div>
        </div>
        <div className="panel-status"><span>◈ {agentJob?.status === "running" ? "1 running" : "Agents ready"}</span><span>◇ {permission?.microphone === "granted" ? "Permissions" : "Needs permissions"}</span><span>◉ {stripStatus}</span></div>
        {error && <p className="panel-error" role="alert">{error}</p>}
      </section>}
      {!visionOpen && panelTab === "agents" && <section className="panel-list"><div className="list-heading"><span className="hero-kicker">AGENT WORK</span><h1>Agents</h1><p>Longer tasks appear here while Ren works.</p></div>{agentJob ? <article className="agent-summary"><span className="agent-status">{agentJob.status}</span><h2>{agentJob.task || "Current task"}</h2><p>{agentJob.answer || agentJob.error || "Ren is working on this task."}</p>{agentJob.status === "running" && <button onClick={() => { if (agentJobIdRef.current) void window.ren?.cancelAgentJob?.(agentJobIdRef.current); }}>Stop task</button>}</article> : <div className="panel-empty"><span>◈</span><strong>No agent tasks yet</strong><p>Ask Ren to research, build, or work on a larger task.</p></div>}</section>}
      {!visionOpen && panelTab === "connections" && <section className="panel-list"><div className="list-heading"><span className="hero-kicker">LOCAL CONNECTIONS</span><h1>Connections</h1><p>Connect the services Ren uses for voice and screen-aware answers.</p></div><button className="connection-row" onClick={openVisionSettings}><span>◉</span><span><strong>Deepgram voice</strong><small>{deepgram.mode === "connected" ? "Connected" : "Connect to use voice"}</small></span><b>↗</b></button><button className="connection-row" onClick={openVisionSettings}><span>✦</span><span><strong>OpenAI vision</strong><small>{vision.mode === "connected" ? "Connected" : "Connect for screen-aware answers"}</small></span><b>↗</b></button></section>}
      {visionOpen ? <form className="vision-settings" onSubmit={(event) => void saveVision(event)}><span className="step-kicker">CLOUD VOICE</span><h2>Connect Deepgram</h2><p>Ren keeps the small “Hey Ren” detector on your Mac. After it wakes, Ren streams your spoken question to Deepgram for transcription and sends reply text to Deepgram for speech. While the conversation stays open, Ren detects follow-ups locally and streams audio only when you speak. Deepgram may charge for usage.</p><label>Deepgram API key<input aria-label="Deepgram API key" type="password" value={deepgramInput} onChange={(event) => setDeepgramInput(event.target.value)} placeholder={deepgram.mode === "demo" ? "Enter your Deepgram key" : "Deepgram key saved"} autoComplete="off" /></label><div className="vision-actions"><button type="button" className="allow-button" onClick={() => void saveDeepgram()}>Save Deepgram key</button>{deepgram.mode === "connected" && <button type="button" onClick={() => void clearDeepgram()}>Remove Deepgram key</button>}</div><span className="step-kicker">SCREEN-AWARE ANSWERS</span><h2>Connect OpenAI</h2><p>When you ask about your screen, Ren sends your question and an on-demand screen snapshot to OpenAI. OpenAI may charge for requests.</p><label>Model<input aria-label="Vision model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} spellCheck={false} /></label><label>OpenAI API key<input aria-label="OpenAI API key" type="password" value={visionKey} onChange={(event) => setVisionKey(event.target.value)} placeholder={vision.mode === "connected" ? "Leave blank to keep saved key" : "Enter your OpenAI key"} autoComplete="off" /></label><div className="vision-actions"><button type="submit" className="allow-button">Save OpenAI key</button><button type="button" onClick={() => { setDeepgramInput(""); setError(""); void setExpanded(false); }}>Back to Ren</button>{vision.mode === "connected" && <button type="button" onClick={() => void clearVision()}>Remove OpenAI key</button>}</div><div className="hosted-settings"><span className="step-kicker">REALISTIC ON-SCREEN IMAGES</span><h2>Ren image service</h2><p>{hosted.mode === "demo" ? "Connect the Ren hosted image service once. Your validated lesson part names and connections go to this service when you approve an illustration; no screen screenshot is sent. The service uses your Ren illustration allowance." : `Connected to ${hosted.host}. Illustration requests use your Ren allowance; no screen screenshot is sent.`}</p><label>Ren image service URL<input aria-label="Ren image service URL" value={hostedUrl} onChange={(event) => setHostedUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveHosted(); } }} placeholder="https://images.ren.example/v1" spellCheck={false} /></label><label>Ren access token<input aria-label="Ren access token" type="password" value={hostedToken} onChange={(event) => setHostedToken(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveHosted(); } }} placeholder={hosted.mode === "connected" ? "Leave blank to keep saved token" : "Enter your Ren access token"} autoComplete="off" /></label><div className="vision-actions"><button type="button" className="allow-button" onClick={() => void saveHosted()}>Save image service</button>{hosted.mode === "connected" && <button type="button" onClick={() => void clearHosted()}>Disconnect service</button>}</div></div></form>
      : null}
      {visionOpen && <section className="shortcut-settings"><span className="step-kicker">MAC SHORTCUTS</span><h2>Voice and screen access</h2><div className="permission-row"><span>Accessibility · triple Control and circle</span><b>{permission?.interaction ?? "checking"}</b></div><div className="permission-row"><span>Screen Recording · on-demand context</span><b>{permission?.screen ?? "checking"}</b></div><div className="vision-actions">{permission?.interaction !== "granted" && <button type="button" className="allow-button" onClick={() => void enableCircle()}>Enable keyboard shortcut</button>}{permission?.screen !== "granted" && <button type="button" onClick={() => void openPermissionSettings()}>Enable screen context</button>}</div></section>}
    </>}
  </main>;
}
