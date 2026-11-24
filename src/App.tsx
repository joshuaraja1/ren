import { FormEvent, useEffect, useRef, useState } from "react";
import type { AmbientStatus, AskResponse, ConversationTurn, ScreenContext, ScreenSource, VisionStatus } from "./contracts";

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
  const [visionOpen, setVisionOpen] = useState(false);
  const [visionKey, setVisionKey] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [visionBase, setVisionBase] = useState(demoVision.baseUrl);
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
  useEffect(() => window.ren?.onFocusSelection(() => {
    visionOpenRef.current = false;
    setVisionOpen(false);
    setVisionKey("");
    void setExpanded(true);
    void askQuestion("Explain what is inside the area I circled on my screen. Start with the part I selected, and show me how it connects to what I'm doing.");
  }), []);

  useEffect(() => {
    void (async () => {
      const status = window.ren ? await window.ren.permissionStatus() : readyStatus;
      setPermission(status);
      if (!status.ready || !window.ren) await setExpanded(true);
      if (status.ready) await startAutomaticCapture();
    })();
  }, []);

  useEffect(() => {
    if (!permission?.ready) return;
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
              if (!dictationReadyRef.current) {
                if (pendingAudioRef.current.length < 36) pendingAudioRef.current.push(samples);
                return;
              }
              const now = Date.now();
              const level = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
              if (level > 0.012) {
                voicedFramesRef.current += 1;
                lastVoiceAtRef.current = now;
              }
              if (queuedFeedsRef.current >= 8) {
                setError("Local dictation could not keep up. Type your question instead.");
                stopNativeDictation();
                return;
              }
              queuedFeedsRef.current += 1;
              feedChainRef.current = feedChainRef.current.then(async () => {
                if (!dictationActiveRef.current || !await window.ren!.speechFeed(samples)) throw new Error("Local speech feed stopped");
              }).catch(() => {
                setError("Local dictation stopped. Type your question instead.");
                stopNativeDictation();
              }).finally(() => { queuedFeedsRef.current -= 1; });
              if ((voicedFramesRef.current >= 2 && now - lastVoiceAtRef.current > 1500) || now - dictationStartedAtRef.current > (voicedFramesRef.current ? 28_000 : 8_000)) void finishNativeDictation();
              return;
            }
            if (pending || Date.now() < suppressSpeechUntilRef.current) return;
            recentAudio.push(samples);
            if (recentAudio.length > 24) recentAudio.shift();
            pending = true;
            void window.ren!.wakeFeed(samples).then((woke) => {
              if (woke && !disposed) {
                if (nativeSpeechRef.current) void startNativeDictation(true, recentAudio.slice());
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
  }, [permission?.ready]);

  async function setExpanded(value: boolean) {
    expandedRef.current = value;
    setExpandedState(value);
    if (!value) { stopNativeDictation(); visionOpenRef.current = false; setVisionOpen(false); setVisionKey(""); }
    await window.ren?.setExpanded(value);
  }

  function stopNativeDictation() {
    dictationActiveRef.current = false;
    dictationReadyRef.current = false;
    pendingAudioRef.current = [];
    void window.ren?.speechStop();
  }

  async function startNativeDictation(greeting = false, preRoll: number[][] = []) {
    if (!window.ren || !nativeSpeechRef.current || dictationActiveRef.current) return;
    dictationActiveRef.current = true;
    dictationReadyRef.current = false;
    dictationStartedAtRef.current = Date.now();
    lastVoiceAtRef.current = 0;
    voicedFramesRef.current = 0;
    feedChainRef.current = Promise.resolve();
    queuedFeedsRef.current = 0;
    pendingAudioRef.current = preRoll;
    await setExpanded(true);
    setVoiceState("listening"); keepAwake();
    if (greeting) setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "Hey, I'm here. Ask me about what you're pointing at." }]);
    try {
      if (!await window.ren.speechStart(sampleRateRef.current)) throw new Error("Local dictation could not start");
      for (const samples of pendingAudioRef.current.splice(0)) {
        feedChainRef.current = feedChainRef.current.then(() => window.ren!.speechFeed(samples));
      }
      dictationReadyRef.current = true;
    } catch {
      stopNativeDictation();
      setVoiceState("idle");
      setError("Local dictation is unavailable. Type your question instead.");
    }
  }

  async function finishNativeDictation() {
    if (!dictationActiveRef.current || !window.ren) return;
    dictationActiveRef.current = false;
    dictationReadyRef.current = false;
    setVoiceState("processing");
    try {
      await feedChainRef.current;
      const transcript = (await window.ren.speechFinish()).replace(/^(?:hey\s+)?(?:ren|run)\b[.,:;\s-]*/i, "").trim();
      if (transcript) await askQuestion(transcript);
      else { setVoiceState("idle"); setError("I didn't catch that. Say “Hey Ren” and try again, or type your question."); }
    } catch {
      setVoiceState("idle");
      setError("Local dictation could not finish. Type your question instead.");
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
      if (status.ready) { await startAutomaticCapture(); greet("All set. From now on, just say “Hey Ren.”"); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Permissions could not be completed."); }
  }

  async function enableCircle() {
    if (!window.ren) return;
    const status = await window.ren.enableCircleInput();
    setPermission(status);
    if (status.interaction !== "granted") setError(window.ren.platform === "darwin"
      ? "Allow Ren in Accessibility and Input Monitoring in System Settings, then click Enable circle again."
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
      visionOpenRef.current = false;
      setVisionOpen(false);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the vision provider."); }
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
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setVoiceState(nativeWakeRef.current ? "idle" : "listening");
    speechSynthesis.speak(utterance);
  }

  function handleAmbientTranscript(transcript: string) {
    const wakeMatch = transcript.match(/\b(?:hey\s+(?:ren|run)|ren)\b/i);
    const alreadyAwake = Date.now() < awakeUntilRef.current;
    if (!wakeMatch && !alreadyAwake) return;
    void setExpanded(true); keepAwake(); setVoiceState("listening");
    const remainder = wakeMatch ? transcript.slice((wakeMatch.index ?? 0) + wakeMatch[0].length).replace(/^[,.:;\s-]+/, "") : transcript;
    if (remainder) void askQuestion(remainder);
    else if (nativeWakeRef.current && nativeSpeechRef.current) void startNativeDictation(true);
    else greet(nativeWakeRef.current ? "Hey, I'm here. Type your question about what you're pointing at." : undefined);
  }

  async function captureBurst() {
    return window.ren ? window.ren.captureContext() : { frames: [], pointer: { x: .5, y: .5 } } satisfies ScreenContext;
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
      const response = window.ren ? await (async () => { const context = await captureBurst(); return window.ren!.ask({ question: clean, ...context, history }); })() : { answer: "I can see the interaction working in preview mode. The packaged desktop app will use your current screen and cursor as context.", annotations: [], provider: "demo" as const };
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer, provider: response.provider, followUps: response.followUps }]);
      if (response.annotations.length) await window.ren?.showAnnotations(response.annotations);
      setVoiceState("responding"); suppressSpeechUntilRef.current = Date.now() + Math.min(12_000, response.answer.length * 45);
      const utterance = new SpeechSynthesisUtterance(response.answer); utterance.onend = () => { if (nativeSpeechRef.current && expandedRef.current) void startNativeDictation(); else { setVoiceState("listening"); keepAwake(); } }; speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t answer."); setVoiceState("idle"); }
    finally { askingRef.current = false; }
  }

  function submit(event: FormEvent) { event.preventDefault(); void askQuestion(question); }

  if (!expanded) return <button className={`ren-pebble state-${voiceState}`} onClick={() => void setExpanded(true)} aria-label={`Open Ren. ${voiceLabels[voiceState].title}`}><span className="pebble-mark"><Spark /></span><span className="pebble-copy"><strong>{voiceLabels[voiceState].title}</strong><small>{voiceLabels[voiceState].detail}</small></span><VoiceMeter active={voiceState !== "idle"} /><span className="privacy-dot" aria-hidden="true" /></button>;

  return <main className="ambient-panel">
    <header className={`ambient-header state-${voiceState}`}><div className="companion-orb"><Spark /></div><div className="header-copy"><p><span className="state-dot" /> REN</p><h1>{voiceState === "processing" ? "Looking closely…" : voiceState === "listening" ? "I’m listening." : voiceState === "responding" ? "Let’s work through it." : "How can I help?"}</h1></div><VoiceMeter active={voiceState !== "idle"} /><button className="collapse-button" onClick={() => void setExpanded(false)} aria-label="Collapse Ren">⌃</button></header>

    {!permission?.ready ? <section className="onboarding-card"><span className="step-kicker">ONE-TIME SETUP</span><h2>Give Ren permission once.</h2><p>Allow microphone, screen recording, and pointer access now. After that, Ren starts quietly with your computer and only captures the screen when you ask a question.</p><div className="permission-row"><span>Microphone</span><b>{permission?.microphone ?? "checking"}</b></div><div className="permission-row"><span>Screen recording</span><b>{permission?.screen ?? "checking"}</b></div><div className="permission-row"><span>Circle shortcut</span><b>{permission?.interaction ?? "checking"}</b></div><button className="allow-button" onClick={() => void requestOneTimePermissions()}>Allow and continue</button>{permission && !permission.ready && <button className="settings-link" onClick={() => void window.ren?.openPermissionSettings()}>Open system permission settings</button>}</section> : <>
      <div className="ambient-status"><span className="privacy-lock" aria-hidden="true">●</span><span>{vision.mode === "demo" ? "Demo · screen stays local" : `On-demand · ${vision.host}`}</span><em>·</em><span className="display-name">{source?.name ?? "connecting to display"}</span><button className="provider-chip" onClick={openVisionSettings}>{vision.mode === "demo" ? "Connect AI" : "AI settings"}</button></div>
      {visionOpen ? <form className="vision-settings" onSubmit={(event) => void saveVision(event)}><span className="step-kicker">SCREEN-AWARE ANSWERS</span><h2>Connect a vision model</h2><p>Ren sends your question and a screen snapshot to <strong>{visionBase ? (() => { try { return new URL(visionBase).host; } catch { return "the provider"; } })() : "the provider"}</strong> only when you ask. The microphone stays local. Your provider may charge for requests.</p><label>Provider URL<input aria-label="Provider URL" value={visionBase} onChange={(event) => setVisionBase(event.target.value)} spellCheck={false} /></label><label>Vision model<input aria-label="Vision model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} placeholder="Model name" spellCheck={false} /></label><label>API key<input aria-label="API key" type="password" value={visionKey} onChange={(event) => setVisionKey(event.target.value)} placeholder={vision.mode === "connected" ? "Leave blank to keep saved key" : "Paste your provider key"} autoComplete="off" /></label><div className="vision-actions"><button type="submit" className="allow-button">Save provider</button><button type="button" onClick={() => { visionOpenRef.current = false; setVisionOpen(false); setVisionKey(""); setError(""); }}>Back to Ren</button>{vision.mode === "connected" && <button type="button" onClick={() => void clearVision()}>Remove saved key</button>}</div></form> : <section className="ambient-conversation" aria-live="polite">{vision.mode === "demo" && <button className="demo-notice" onClick={openVisionSettings}>Demo answers cannot inspect your screen. Connect a vision model for specific guidance.</button>}{messages.length === 0 && <div className="empty-conversation"><div className="cursor-cue"><Spark /><span /></div><p>Point at anything on your screen</p><strong>“Hey Ren, explain this.”</strong><small>I’ll look, talk it through, and draw when it helps.</small></div>}{messages.map((message, index) => <article key={message.id} className={message.role}><span>{message.role === "assistant" ? `REN${message.provider ? ` · ${message.provider.toUpperCase()}` : ""}` : "YOU"}</span><p>{message.content}</p>{index === messages.length - 1 && message.followUps?.length ? <div className="follow-ups" aria-label="Suggested follow-up questions">{message.followUps.map((prompt) => <button key={prompt} onClick={() => void askQuestion(prompt)} disabled={voiceState === "processing"}>{prompt}<b aria-hidden="true">↗</b></button>)}</div> : null}</article>)}</section>}
      {error && <div className="ambient-error" role="alert">{error}</div>}
      {!visionOpen && <><form className="ambient-composer" onSubmit={submit}><button type="button" className={`listen-button state-${voiceState}`} onClick={() => { if (nativeSpeechRef.current) { if (dictationActiveRef.current) void finishNativeDictation(); else void startNativeDictation(); return; } if (!recognitionRef.current) { setError("Local speech recognition is unavailable. Type your question here."); questionRef.current?.focus(); return; } keepAwake(); try { recognitionRef.current.start(); setVoiceState("listening"); } catch { setError("Speech recognition could not start. Type your question here."); questionRef.current?.focus(); } }} aria-label={dictationActiveRef.current ? "Finish speaking" : "Start listening"}><MicGlyph /></button><textarea ref={questionRef} aria-label="Ask Ren" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askQuestion(question); } }} placeholder="Ask about what you’re pointing at…" rows={1} /><button type="submit" className="ask-button" disabled={!question.trim() || voiceState === "processing"} aria-label="Send question">↑</button></form><footer><span><i aria-hidden="true" /> Hold {window.ren?.platform === "darwin" ? "Control+Option" : "Control+Alt"} and circle to focus</span>{permission?.interaction !== "granted" && <button onClick={() => void enableCircle()}>Enable circle</button>}<button onClick={() => void window.ren?.clearAnnotations()}>Clear drawings</button></footer></>}
    </>}
  </main>;
}
