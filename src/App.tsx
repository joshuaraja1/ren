import { FormEvent, useEffect, useRef, useState } from "react";
import type { AmbientStatus, AskResponse, ConversationTurn, DeepgramStatus, HostedImageStatus, ScreenContext, VisionStatus, VoiceMode } from "./contracts";
import { PcmStreamPlayer } from "./pcm-player";
import { interactiveSceneFor } from "../electron/interactive-scene";
import { wantsVisualCreation } from "../electron/visual-intent";
import { wantsCurrentScreen } from "../electron/screen-intent";
import { confirmedWakeQuestion } from "./wake-confirmation";
import { detectAgentJobIntent } from "../electron/agent-job-intent";
import { continuesGuidedWorkflow, guidedHistory, wantsGuidedWorkflow, wantsToDelegateCurrentTask } from "../electron/guided-workflow";
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
  processing: { title: "Thinking", detail: "Working on your request" },
  responding: { title: "Speaking", detail: "Working it through" },
};
export function friendlyAskError(reason: unknown): string {
  const raw = (reason instanceof Error ? reason.message : String(reason ?? ""))
    .replace(/^Error invoking remote method '[^']+': Error: /, "");
  if (/visible app changed|active app changed/i.test(raw)) return "The visible app changed while Ren was working. Please try again.";
  if (/Accessibility permission|Enable Accessibility/i.test(raw)) return "Enable Accessibility for Ren in macOS Settings, then try again.";
  if (/\bfetch failed\b/i.test(raw)) return "The AI request could not be sent. Please try again.";
  if (/Error invoking remote method|Command failed|ren-input\.swift|\/usr\/bin\/swift|\/Users\//i.test(raw)) return "Ren couldn't complete that action. Please try again.";
  return raw.replace(/\s+/g, " ").slice(0, 240) || "Ren couldn’t answer. Please try again.";
}
const Spark = () => <svg aria-hidden="true" viewBox="0 0 32 32" className="spark"><path d="M16 2c.8 8.6 5.4 13.2 14 14-8.6.8-13.2 5.4-14 14-.8-8.6-5.4-13.2-14-14 8.6-.8 13.2-5.4 14-14Z" /></svg>;
const VoiceMeter = ({ active = false }: { active?: boolean }) => <span className={`voice-meter${active ? " is-active" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;

export function App() {
  const [permission, setPermission] = useState<AmbientStatus | null>(null);
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
  const [microphoneRevision, setMicrophoneRevision] = useState(0);
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
  const guidedTaskRef = useRef<string | null>(null);
  const nativeWakeRef = useRef(false);
  const nativeSpeechRef = useRef(false);
  const microphoneContextRef = useRef<AudioContext | null>(null);
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
  const wakeCandidateRef = useRef(false);
  const conversationOpenRef = useRef(false);
  const awaitingFollowUpRef = useRef(false);
  const pendingAudioRef = useRef<number[][]>([]);
  const expandedRef = useRef(false);
  const askingRef = useRef(false);
  const askGenerationRef = useRef(0);
  const activeAskTokenRef = useRef<string | null>(null);
  const captureInFlightRef = useRef<Promise<ScreenContext> | null>(null);
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
    else showVoiceError("Voice is unavailable. Check microphone and Deepgram settings, then circle again.");
  }), []);
  useEffect(() => window.ren?.onActivateVoice?.(() => {
    if (voicePausedRef.current) return;
    if (nativeSpeechRef.current) {
      if (dictationActiveRef.current) void finishNativeDictation();
      else void startNativeDictation();
    }
    else showVoiceError("Voice is unavailable. Check the microphone and Deepgram settings.");
  }), []);
  useEffect(() => window.ren?.onOpenPanel?.(() => { openVisionSettings(); }), []);
  useEffect(() => window.ren?.onOpenHome?.(() => {
    visionOpenRef.current = false;
    setVisionOpen(false);
    setPanelTab("home");
    setPromptMode("ask");
    void setExpanded(true);
  }), []);
  useEffect(() => window.ren?.onAgentJobUpdate?.(handleAgentJobUpdate), []);
  useEffect(() => window.ren?.onSpeechInput?.((input) => {
    if (!dictationActiveRef.current) return;
    if (input.error) {
      stopNativeDictation();
      conversationOpenRef.current = false;
      awaitingFollowUpRef.current = false;
      showVoiceError(input.error);
    } else if (input.transcript?.trim()) void finishNativeDictation();
  }), []);

  useEffect(() => {
    void (async () => {
      const status = window.ren ? await window.ren.permissionStatus() : readyStatus;
      setPermission(status);
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
      const wakeAvailable = await window.ren?.wakeAvailable?.().catch(() => false);
      const speechAvailable = await window.ren?.speechAvailable?.().catch(() => { setError("Ren could not unlock Deepgram. Reconnect the key in settings."); return false; });
      if (window.ren && speechAvailable) {
        try {
          media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
          if (disposed) { media.getTracks().forEach((track) => track.stop()); return; }
          context = new AudioContext();
          microphoneContextRef.current = context;
          sampleRateRef.current = context.sampleRate;
          nativeWakeRef.current = Boolean(wakeAvailable && await window.ren.wakeStart(context.sampleRate).catch(() => false));
          if (!nativeWakeRef.current) setError("Hey Ren wake detection could not start. Click the sliver to talk, or reopen Ren.");
          const source = context.createMediaStreamSource(media);
          processor = context.createScriptProcessor(2048, 1, 1);
          const recentAudio: number[][] = [];
          const wakeQueue: number[][] = [];
          let drainingWake = false;
          const wakePreRollFrames = Math.min(72, Math.max(12, Math.floor(context.sampleRate * 3 / 2048)));
          const drainWakeQueue = async () => {
            if (drainingWake) return;
            drainingWake = true;
            try {
              while (wakeQueue.length && !disposed && !voicePausedRef.current && !dictationActiveRef.current && !alwaysOnRef.current) {
                // Preserve consecutive audio while the native detector works.
                // Batching four frames also avoids one IPC round trip per frame.
                const batch = wakeQueue.splice(0, 4).flat();
                if (await window.ren!.wakeFeed(batch)) {
                  wakeQueue.length = 0;
                  if (nativeSpeechRef.current) void startNativeDictation(recentAudio.slice(), false, true);
                  else handleAmbientTranscript("Hey Ren");
                  break;
                }
              }
            } catch { setError("Local wake engine stopped. Click Ren to ask."); }
            finally { drainingWake = false; }
          };
          let wasAwaitingFollowUp = false;
          let followUpVoiceFrames = 0;
          processor.onaudioprocess = (event) => {
            if (disposed || voicePausedRef.current || (visionOpenRef.current && !dictationActiveRef.current)) return;
            const samples = Array.from(event.inputBuffer.getChannelData(0));
            if (dictationActiveRef.current) {
              wakeQueue.length = 0;
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
                // The socket can take a moment to open. Keep enough pre-roll
                // for the beginning of the question without sending a long
                // burst that exceeds the realtime stream's audio budget.
                if (pendingAudioRef.current.length >= 64) pendingAudioRef.current.shift();
                pendingAudioRef.current.push(samples);
                return;
              }
              if (queuedFeedsRef.current >= 24) {
                conversationOpenRef.current = false;
                awaitingFollowUpRef.current = false;
                stopNativeDictation();
                showVoiceError("Deepgram audio stream could not keep up. Try again.");
                return;
              }
              const session = dictationSessionRef.current;
              queuedFeedsRef.current += 1;
              feedChainRef.current = feedChainRef.current.then(async () => {
                if (session !== dictationSessionRef.current) return;
                if (!await window.ren!.speechFeed(samples)) throw new Error("Ren lost the microphone audio stream. Please try again.");
              }).catch((reason) => {
                if (session !== dictationSessionRef.current) return;
                conversationOpenRef.current = false;
                awaitingFollowUpRef.current = false;
                stopNativeDictation();
                showVoiceError(reason instanceof Error ? reason.message : "Ren lost the microphone audio stream. Please try again.");
              }).finally(() => { if (session === dictationSessionRef.current) queuedFeedsRef.current -= 1; });
              if ((voicedFramesRef.current >= 2 && now - lastVoiceAtRef.current > 2000) || now - dictationStartedAtRef.current > (voicedFramesRef.current ? 30_000 : 10_000)) void finishNativeDictation();
              return;
            }
            if (conversationOpenRef.current && alwaysOnRef.current) {
              wakeQueue.length = 0;
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
            if (!nativeWakeRef.current || Date.now() < suppressSpeechUntilRef.current) { wakeQueue.length = 0; return; }
            recentAudio.push(samples);
            if (recentAudio.length > wakePreRollFrames) recentAudio.shift();
            wakeQueue.push(samples);
            if (wakeQueue.length > wakePreRollFrames) wakeQueue.shift();
            void drainWakeQueue();
          };
          source.connect(processor);
          processor.connect(context.destination);
          nativeSpeechRef.current = true;
          return;
        } catch {
          nativeSpeechRef.current = false;
          nativeWakeRef.current = false;
          if (microphoneContextRef.current === context) microphoneContextRef.current = null;
          setError("Microphone input could not start. Check Ren's macOS Microphone permission and reopen the app.");
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
        else void askQuestion(transcript, true);
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
      microphoneContextRef.current = null;
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
  }, [permission?.ready, permission?.microphone, voiceMode.paused, deepgram.mode, microphoneRevision]);

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
      if (mode.paused || (wasAlwaysOn && !mode.alwaysOn)) interruptCurrentResponse();
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

  function returnToWakeMode() {
    conversationOpenRef.current = alwaysOnRef.current && !voicePausedRef.current;
    awaitingFollowUpRef.current = conversationOpenRef.current;
    setVoiceState("idle");
    hideCompanionSoon();
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
    void speak(answer, returnToWakeMode);
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
      if (!expandedRef.current && !alwaysOnRef.current && !dictationActiveRef.current && !askingRef.current && !imageRenderingRef.current && voiceStateRef.current !== "responding" && voiceStateRef.current !== "processing") {
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
    wakeCandidateRef.current = false;
    pendingAudioRef.current = [];
    void window.ren?.speechStop();
  }

  function showVoiceError(message: string) {
    setVoiceState("idle");
    setError(message);
    visionOpenRef.current = false;
    setVisionOpen(false);
    setPanelTab("home");
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
    showCompanion();
  }

  function interruptCurrentResponse() {
    const wasAsking = askingRef.current;
    const oldAskToken = activeAskTokenRef.current;
    const currentJob = agentJobIdRef.current;
    askGenerationRef.current += 1;
    askingRef.current = false;
    activeAskTokenRef.current = null;
    if (wasAsking && oldAskToken) void window.ren?.cancelAsk?.(oldAskToken);
    if (currentJob) {
      agentJobIdRef.current = null;
      ignoredAgentJobIdsRef.current.add(currentJob);
      setAgentJob(null);
      void window.ren?.cancelAgentJob?.(currentJob);
    }
    speechCancelRef.current?.();
    suppressSpeechUntilRef.current = 0;
  }

  async function startNativeDictation(preRoll: number[][] = [], automatic = false, wakeCandidate = false) {
    if (!window.ren || !nativeSpeechRef.current || dictationActiveRef.current) return;
    const inputContext = microphoneContextRef.current;
    if (!inputContext || inputContext.state === "closed") { showVoiceError("Microphone input is not ready. Reopen Ren and try again."); return; }
    interruptCurrentResponse();
    conversationOpenRef.current = true;
    awaitingFollowUpRef.current = false;
    showCompanion();
    setError("");
    dictationActiveRef.current = true;
    setDictationActive(true);
    if (expandedRef.current && !visionOpenRef.current) void setExpanded(false);
    automaticDictationRef.current = automatic;
    wakeCandidateRef.current = wakeCandidate;
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
      if (inputContext.state === "suspended") await inputContext.resume();
      if (!await window.ren.speechStart(sampleRateRef.current)) throw new Error("Deepgram dictation could not start");
      if (session !== dictationSessionRef.current) return;
      // Opening the speech stream can overlap a visibility update from the
      // previous answer. Keep the notch visible once this session is ready.
      showCompanion();
      dictationStartedAtRef.current = Date.now();
      for (const samples of pendingAudioRef.current.splice(0)) {
        feedChainRef.current = feedChainRef.current.then(async () => {
          if (session !== dictationSessionRef.current) return;
          if (!await window.ren!.speechFeed(samples)) throw new Error("Ren lost the microphone audio stream. Please try again.");
        });
      }
      dictationReadyRef.current = true;
    } catch (reason) {
      if (session !== dictationSessionRef.current) return;
      stopNativeDictation();
      conversationOpenRef.current = false;
      showVoiceError(reason instanceof Error ? reason.message : "Deepgram is unavailable. Check your key and network in AI settings.");
    }
  }

  async function finishNativeDictation() {
    if (!dictationActiveRef.current || !window.ren) return;
    const session = dictationSessionRef.current;
    const automatic = automaticDictationRef.current;
    const wakeCandidate = wakeCandidateRef.current;
    automaticDictationRef.current = false;
    wakeCandidateRef.current = false;
    dictationActiveRef.current = false;
    setDictationActive(false);
    dictationReadyRef.current = false;
    setVoiceState("processing");
    try {
      await feedChainRef.current;
      if (session !== dictationSessionRef.current) return;
      const rawTranscript = (await window.ren.speechFinish()).trim();
      if (session !== dictationSessionRef.current) return;
      const confirmedQuestion = wakeCandidate ? confirmedWakeQuestion(rawTranscript) : null;
      if (wakeCandidate && confirmedQuestion === null) { returnToWakeMode(); return; }
      if (wakeCandidate && !confirmedQuestion) { void startNativeDictation(); return; }
      const transcript = wakeCandidate ? confirmedQuestion! : rawTranscript.replace(/^(?:hey\s+)?(?:ren|run)\b[.,:;\s-]*/i, "").trim();
      if (/^(?:stop listening|that(?:'|’)s all|goodbye|bye(?: ren)?|cancel)[.!\s]*$/i.test(transcript)) { await endVoiceConversation(); return; }
      if (transcript) await askQuestion(transcript, true);
      else {
        returnToWakeMode();
        if (!automatic || voicedFramesRef.current >= 2) setError("I didn't catch that. Tap the microphone and try again.");
      }
    } catch (reason) {
      if (session !== dictationSessionRef.current) return;
      conversationOpenRef.current = false;
      awaitingFollowUpRef.current = false;
      stopNativeDictation();
      showVoiceError(reason instanceof Error ? reason.message : "Deepgram could not finish dictation. Try again.");
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
      setMicrophoneRevision((current) => current + 1);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the Deepgram key."); }
  }

  async function clearDeepgram() {
    if (!window.ren) return;
    try {
      setDeepgram(await window.ren.clearDeepgramKey());
      setMicrophoneRevision((current) => current + 1);
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
    let progressTimer: ReturnType<typeof setTimeout> | null = null;
    let player: PcmStreamPlayer | null = null;
    const finish = (reason?: string, notify = true) => {
      if (finished) return;
      finished = true;
      if (startTimer) clearTimeout(startTimer);
      if (progressTimer) clearTimeout(progressTimer);
      unsubscribe();
      player?.dispose();
      speechCancelRef.current = null;
      if (reason) { setError(reason); showCompanion(); }
      suppressSpeechUntilRef.current = Date.now() + 300;
      if (notify) onEnd();
    };
    const expectProgressWithin = (ms: number) => {
      if (progressTimer) clearTimeout(progressTimer);
      progressTimer = setTimeout(() => {
        void window.ren?.cancelSpeech?.(id);
        finish("Ren's voice stopped responding. Please try again.");
      }, ms);
    };
    player = new PcmStreamPlayer(context, () => finish());
    unsubscribe = window.ren.onSpeechData((data) => {
      if (data.id !== id || finished) return;
      if (data.error) { finish(data.error); return; }
      try {
        if (data.chunk) {
          player?.push(Uint8Array.from(atob(data.chunk), (character) => character.charCodeAt(0)));
          expectProgressWithin(20_000);
        }
        if (data.done) {
          player?.complete();
          if (!finished) expectProgressWithin(10_000 + (player?.remainingPlaybackMs ?? 0));
        }
      } catch (reason) { finish(reason instanceof Error ? reason.message : "Deepgram speech could not play."); }
    });
    speechCancelRef.current = () => {
      void window.ren?.cancelSpeech?.(id);
      finish(undefined, false);
    };
    startTimer = setTimeout(() => {
      if (context.state !== "running") finish("Audio playback did not start. Click Ren’s microphone button and try again.");
    }, 10_000);
    expectProgressWithin(20_000);
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
    void speak(text, returnToWakeMode);
  }

  function handleAmbientTranscript(transcript: string) {
    const remainder = confirmedWakeQuestion(transcript);
    if (remainder === null) return;
    showCompanion();
    keepAwake(); setVoiceState("listening");
    if (remainder) void askQuestion(remainder, true);
    else if (nativeWakeRef.current && nativeSpeechRef.current) void startNativeDictation();
    else greet(nativeWakeRef.current ? "Hey, I'm here. Ask me about what you're pointing at." : undefined);
  }

  async function captureBurst(question: string) {
    if (!window.ren) return { frames: [], pointer: { x: .5, y: .5 }, contextToken: undefined } satisfies ScreenContext;
    // A spoken interruption can arrive while the prior screenshot is still in
    // flight. Let it finish before issuing the replacement capture.
    if (captureInFlightRef.current) await captureInFlightRef.current.catch(() => {});
    const capture = window.ren.captureContext(!wantsVisualCreation(question), question);
    captureInFlightRef.current = capture;
    try { return await capture; }
    finally { if (captureInFlightRef.current === capture) captureInFlightRef.current = null; }
  }

  async function askQuestion(rawQuestion: string, fromVoice = false) {
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
    if (wantsGuidedWorkflow(clean)) guidedTaskRef.current = clean;
    else if (!continuesGuidedWorkflow(clean) && !wantsToDelegateCurrentTask(clean) && !/^(?:why|how|what about|and|can you explain|tell me more)\b/i.test(clean)) guidedTaskRef.current = null;
    const history = guidedHistory(clean, messagesRef.current.slice(-8).map(({ role, content }) => ({ role, content })), guidedTaskRef.current);
    queuedIllustrationRef.current = false;
    askingRef.current = true;
    // Room audio may be playing while the user types. Only an active voice
    // conversation can use voice activity to interrupt an in-flight answer.
    conversationOpenRef.current = fromVoice && alwaysOnRef.current && nativeSpeechRef.current && !voicePausedRef.current;
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
      const response = window.ren ? await (async () => {
        if (!wantsCurrentScreen(clean, history)) {
          const contextToken = crypto.randomUUID();
          activeAskTokenRef.current = contextToken;
          return window.ren!.ask({ question: clean, frames: [], contextToken, history });
        }
        const context = await captureBurst(clean);
        if (generation !== askGenerationRef.current) return null;
        activeAskTokenRef.current = context.contextToken ?? null;
        return window.ren!.ask({ question: clean, ...context, history });
      })() : { answer: "I can see the interaction working in preview mode. The packaged desktop app will use your current screen and cursor as context.", annotations: [], provider: "demo" as const };
      if (!response || generation !== askGenerationRef.current) return;
      if (!response.reusedVisual) setImageAvailable(!!response.visualLesson && !interactiveSceneFor(response.visualLesson));
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer, provider: response.provider, followUps: response.followUps }]);
      setVoiceState("responding"); suppressSpeechUntilRef.current = Date.now() + Math.min(12_000, response.answer.length * 45);
      void speak(response.answer, () => {
        if (generation !== askGenerationRef.current) return;
        returnToWakeMode();
      });
      if (response.autoIllustrate && generation === askGenerationRef.current) void illustrate(true);
    } catch (reason) {
      if (generation !== askGenerationRef.current) return;
      setError(friendlyAskError(reason));
      returnToWakeMode();
    }
    finally { if (generation === askGenerationRef.current) { askingRef.current = false; activeAskTokenRef.current = null; } }
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
    if (!recognitionRef.current) { showVoiceError("Connect Deepgram in AI settings to use voice."); return; }
    keepAwake();
    try { recognitionRef.current.start(); setVoiceState("listening"); }
    catch { showVoiceError("Speech recognition could not start. Check Deepgram settings."); }
  }

  const stripStatus = voiceMode.paused ? "Paused"
    : error ? "Needs attention"
    : agentJob?.status === "running" ? "Running job"
    : imageRendering ? "Drawing"
    : dictationActive ? "Listening"
    : voiceMode.alwaysOn && voiceState === "idle" ? "Hands-free on"
    : permission?.microphone !== "granted" ? "Mic off"
    : voiceLabels[voiceState].title;

  if (!expanded) return <button className={`ren-pebble state-${voiceState}`} onClick={(event) => { if (event.shiftKey) { setPanelTab("home"); setPromptMode("ask"); void setExpanded(true); } else toggleListening(); }} onContextMenu={(event) => { event.preventDefault(); openVisionSettings(); }} aria-label={dictationActive ? "Finish speaking to Ren" : "Start speaking to Ren"} title={error || "Click to talk. Shift-click for the full panel; right-click for settings."}><span className="pebble-mark"><span className="clicky-triangle" /></span><span className="pebble-copy"><strong>{stripStatus}</strong></span><VoiceMeter active={dictationActive || voiceState === "processing" || voiceState === "responding" || imageRendering} />{error && <span className="screen-reader-only" role="alert">{error}</span>}</button>;

  const needsSetup = Boolean(window.ren) ? permission?.microphone !== "granted" : !permission?.ready;
  return <main className="ambient-panel">
    <header className="ambient-header"><span className="panel-grip" aria-hidden="true">⋮⋮</span><button className={`panel-tab ${!visionOpen && panelTab === "home" ? "selected" : ""}`} onClick={() => { setVisionOpen(false); visionOpenRef.current = false; setPanelTab("home"); }}>⌂ <span>Home</span></button><button className={`panel-tab ${!visionOpen && panelTab === "agents" ? "selected" : ""}`} onClick={() => { setVisionOpen(false); visionOpenRef.current = false; setPanelTab("agents"); }}>◈ <span>Agents</span></button><button className={`panel-tab ${!visionOpen && panelTab === "connections" ? "selected" : ""}`} onClick={() => { setVisionOpen(false); visionOpenRef.current = false; setPanelTab("connections"); }}>⌁ <span>Connect</span></button><button className={`panel-chrome ${visionOpen ? "selected" : ""}`} onClick={openVisionSettings} aria-label="Open Ren settings">⚙</button><button className="panel-chrome" onClick={() => void setExpanded(false)} aria-label="Collapse Ren">×</button></header>

    {needsSetup ? <section className="onboarding-card"><span className="step-kicker">ONE-TIME SETUP</span><h2>Give Ren permission once.</h2><p>Allow microphone, screen recording, and pointer access now. After that, Ren starts quietly with your computer and only captures the screen when you ask a question.</p><div className="permission-row"><span>Microphone</span><b>{permission?.microphone ?? "checking"}</b></div><div className="permission-row"><span>Screen recording</span><b>{permission?.screen ?? "checking"}</b></div><div className="permission-row"><span>Circle shortcut</span><b>{permission?.interaction ?? "checking"}</b></div>{permission?.ready && permission.microphone !== "granted" ? <button className="allow-button" onClick={() => void enableMicrophone()}>Enable microphone</button> : <button className="allow-button" onClick={() => void requestOneTimePermissions()}>Allow and continue</button>}{permission && !permission.ready && <button className="settings-link" onClick={() => void openPermissionSettings()}>Request access and open system settings</button>}</section> : <>
      {!visionOpen && panelTab === "home" && <section className="panel-home">
        <div className="panel-hero"><div className="hero-heading"><span className="hero-kicker">{promptMode === "agent" ? "AGENT WORK" : promptMode === "chat" ? "CHAT WITH REN" : "ASK REN"}</span><span className="hero-symbol" aria-hidden="true">✦</span></div><h1>{promptMode === "agent" ? "Task an agent" : promptMode === "chat" ? "Chat inside Ren" : "Ask Ren"}</h1><p>{promptMode === "agent" ? "Write a task and let Ren work on it in the background." : promptMode === "chat" ? "Continue the conversation in this panel." : "Ask with your voice, or type a quick question."}</p>
          {promptMode === "chat" ? <div className="panel-conversation" aria-label="Ren conversation">{messages.length ? messages.slice(-8).map((message) => <article key={message.id} className={message.role}><b>{message.role === "user" ? "YOU" : "REN"}</b><p>{message.content}</p>{message.role === "assistant" && message.followUps?.length ? <div className="panel-followups">{message.followUps.slice(0, 2).map((followUp) => <button key={followUp} onClick={() => void askQuestion(followUp)}>{followUp} ↗</button>)}</div> : null}</article>) : <p className="chat-empty">Your conversation will appear here.</p>}</div> : <div className="home-actions">{promptMode === "ask" && <button className="voice-guide" onClick={toggleListening}><span className="voice-guide-icon" aria-hidden="true">⌃</span><span><strong>Talk to Ren</strong><small>Click to speak. Three Control taps toggle hands-free mode on or off.</small></span><span aria-hidden="true">↗</span></button>}<div className="panel-suggestions"><span>✦ &nbsp; SUGGESTIONS</span><div className="suggestion-grid"><button onClick={() => { setPromptMode("ask"); setHomePrompt("Summarise what’s on my screen"); }}>▣ &nbsp; Summarise screen</button><button onClick={() => { setPromptMode("agent"); setHomePrompt("Look at my screen and help with the current task"); }}>◈ &nbsp; Start an agent</button><button onClick={openVisionSettings}>⚙ &nbsp; Open settings</button></div></div></div>}
          <div className="home-prompt-dock"><form className="panel-prompt" onSubmit={(event) => { event.preventDefault(); const text = homePrompt.trim(); if (!text) return; setHomePrompt(""); void askQuestion(promptMode === "agent" ? `spawn agent to ${text}` : text); }}><span className="prompt-symbol" aria-hidden="true">{promptMode === "agent" ? "◈" : promptMode === "chat" ? "▤" : "✦"}</span><input aria-label="Ask Ren" value={homePrompt} onChange={(event) => setHomePrompt(event.target.value)} placeholder={promptMode === "agent" ? "Task an agent…" : promptMode === "chat" ? "Chat with Ren…" : "Ask Ren…"} /><button type="button" className="prompt-mic" aria-label={dictationActive ? "Finish speaking to Ren" : "Start speaking to Ren"} onClick={toggleListening}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-4 0h8" /></svg></button><button type="submit" aria-label="Send Ren prompt" disabled={!homePrompt.trim()}>➤</button></form>
          <div className="prompt-modes"><button type="button" className={promptMode === "ask" ? "active" : ""} aria-pressed={promptMode === "ask"} onClick={() => setPromptMode("ask")}>✦ Ask</button><button type="button" className={promptMode === "agent" ? "active" : ""} aria-pressed={promptMode === "agent"} onClick={() => setPromptMode("agent")}>◈ Agent</button><button type="button" className={promptMode === "chat" ? "active" : ""} aria-pressed={promptMode === "chat"} onClick={() => setPromptMode("chat")}>▤ Chat</button></div>
          </div>
        </div>
        <div className="panel-status"><span>◈ {agentJob?.status === "running" ? "1 running" : "Agents ready"}</span><span>◇ {voiceMode.alwaysOn ? "Always on" : "Hey Ren only"}</span><span>◉ {stripStatus}</span></div>
        {error && <p className="panel-error" role="alert">{error}</p>}
      </section>}
      {!visionOpen && panelTab === "agents" && <section className="panel-list"><div className="list-heading"><span className="hero-kicker">AGENT WORK</span><h1>Agents</h1><p>Longer tasks appear here while Ren works.</p></div>{agentJob ? <article className="agent-summary"><span className="agent-status">{agentJob.status}</span><h2>{agentJob.task || "Current task"}</h2><p>{agentJob.answer || agentJob.error || "Ren is working on this task."}</p>{agentJob.status === "running" && <button onClick={() => { if (agentJobIdRef.current) void window.ren?.cancelAgentJob?.(agentJobIdRef.current); }}>Stop task</button>}</article> : <div className="panel-empty"><span>◈</span><strong>No agent tasks yet</strong><p>Ask Ren to research, build, or work on a larger task.</p></div>}</section>}
      {!visionOpen && panelTab === "connections" && <section className="panel-list"><div className="list-heading"><span className="hero-kicker">LOCAL CONNECTIONS</span><h1>Connections</h1><p>Connect the services Ren uses for voice and screen-aware answers.</p></div><button className="connection-row" onClick={openVisionSettings}><span>◉</span><span><strong>Deepgram voice</strong><small>{deepgram.mode === "connected" ? "Connected" : "Connect to use voice"}</small></span><b>↗</b></button><button className="connection-row" onClick={openVisionSettings}><span>✦</span><span><strong>OpenAI vision</strong><small>{vision.mode === "connected" ? "Connected" : "Connect for screen-aware answers"}</small></span><b>↗</b></button></section>}
      {visionOpen ? <form className="vision-settings" onSubmit={(event) => void saveVision(event)}><span className="step-kicker">CLOUD VOICE</span><h2>Connect Deepgram</h2><p>Ren keeps the small “Hey Ren” detector on your Mac. After it wakes, Ren streams your spoken question to Deepgram for transcription and sends reply text to Deepgram for speech. While Ren answers, you can interrupt by speaking. After the answer, say “Hey Ren” again for a follow-up. Deepgram may charge for usage.</p><label>Deepgram API key<input aria-label="Deepgram API key" type="password" value={deepgramInput} onChange={(event) => setDeepgramInput(event.target.value)} placeholder={deepgram.mode === "demo" ? "Enter your Deepgram key" : "Deepgram key saved"} autoComplete="off" /></label><div className="vision-actions"><button type="button" className="allow-button" onClick={() => void saveDeepgram()}>Save Deepgram key</button>{deepgram.mode === "connected" && <button type="button" onClick={() => void clearDeepgram()}>Remove Deepgram key</button>}</div><span className="step-kicker">SCREEN-AWARE ANSWERS</span><h2>Connect OpenAI</h2><p>When you ask about your screen, Ren sends your question and an on-demand screen snapshot to OpenAI. OpenAI may charge for requests.</p><label>Model<input aria-label="Vision model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} spellCheck={false} /></label><label>OpenAI API key<input aria-label="OpenAI API key" type="password" value={visionKey} onChange={(event) => setVisionKey(event.target.value)} placeholder={vision.mode === "connected" ? "Leave blank to keep saved key" : "Enter your OpenAI key"} autoComplete="off" /></label><div className="vision-actions"><button type="submit" className="allow-button">Save OpenAI key</button><button type="button" onClick={() => { setDeepgramInput(""); setError(""); void setExpanded(false); }}>Back to Ren</button>{vision.mode === "connected" && <button type="button" onClick={() => void clearVision()}>Remove OpenAI key</button>}</div><div className="hosted-settings"><span className="step-kicker">REALISTIC ON-SCREEN IMAGES</span><h2>Ren image service</h2><p>{hosted.mode === "demo" ? "Connect the Ren hosted image service once. Your validated lesson part names and connections go to this service when you approve an illustration; no screen screenshot is sent. The service uses your Ren illustration allowance." : `Connected to ${hosted.host}. Illustration requests use your Ren allowance; no screen screenshot is sent.`}</p><label>Ren image service URL<input aria-label="Ren image service URL" value={hostedUrl} onChange={(event) => setHostedUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveHosted(); } }} placeholder="https://images.ren.example/v1" spellCheck={false} /></label><label>Ren access token<input aria-label="Ren access token" type="password" value={hostedToken} onChange={(event) => setHostedToken(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveHosted(); } }} placeholder={hosted.mode === "connected" ? "Leave blank to keep saved token" : "Enter your Ren access token"} autoComplete="off" /></label><div className="vision-actions"><button type="button" className="allow-button" onClick={() => void saveHosted()}>Save image service</button>{hosted.mode === "connected" && <button type="button" onClick={() => void clearHosted()}>Disconnect service</button>}</div></div></form>
      : null}
      {visionOpen && <section className="shortcut-settings"><span className="step-kicker">MAC SHORTCUTS</span><h2>Voice and screen access</h2><div className="permission-row"><span>Accessibility · triple Control and circle</span><b>{permission?.interaction ?? "checking"}</b></div><div className="permission-row"><span>Screen Recording · on-demand context</span><b>{permission?.screen ?? "checking"}</b></div><div className="vision-actions">{permission?.interaction !== "granted" && <button type="button" className="allow-button" onClick={() => void enableCircle()}>Enable keyboard shortcut</button>}{permission?.screen !== "granted" && <button type="button" onClick={() => void openPermissionSettings()}>Enable screen context</button>}</div></section>}
    </>}
  </main>;
}
