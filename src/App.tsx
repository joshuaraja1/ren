import { FormEvent, useEffect, useRef, useState } from "react";
import type { AmbientStatus, AskResponse, ConversationTurn, ScreenSource } from "./contracts";

type VoiceState = "idle" | "listening" | "processing" | "responding";
type Message = ConversationTurn & { id: string; provider?: AskResponse["provider"] };
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
const Spark = () => <svg aria-hidden="true" viewBox="0 0 32 32" className="spark"><path d="M16 2c.8 8.6 5.4 13.2 14 14-8.6.8-13.2 5.4-14 14-.8-8.6-5.4-13.2-14-14 8.6-.8 13.2-5.4 14-14Z" /></svg>;
const MicGlyph = () => <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></svg>;

export function App() {
  const [permission, setPermission] = useState<AmbientStatus | null>(null);
  const [expanded, setExpandedState] = useState(false);
  const [source, setSource] = useState<ScreenSource | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeEnabledRef = useRef(false);
  const awakeUntilRef = useRef(0);
  const suppressSpeechUntilRef = useRef(0);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

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
    const browserWindow = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) { setError("Wake phrase is unavailable on this system; click Ren or use the text box."); return; }
    wakeEnabledRef.current = true;
    const recognition = new Recognition();
    if (!("processLocally" in recognition)) {
      setError("Local wake-word recognition is unavailable here. Click Ren to talk; room audio will not be sent to a cloud wake service.");
      return;
    }
    recognition.processLocally = true;
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
    return () => { wakeEnabledRef.current = false; recognition.stop(); };
  }, [permission?.ready]);

  async function setExpanded(value: boolean) {
    setExpandedState(value);
    await window.ren?.setExpanded(value);
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

  function keepAwake() {
    awakeUntilRef.current = Date.now() + 20_000;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => { if (voiceState === "idle") void setExpanded(false); }, 20_000);
  }

  function greet(text = "Hey—what’s up? How can I help?") {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: text }]);
    setVoiceState("responding"); keepAwake();
    suppressSpeechUntilRef.current = Date.now() + 2_500;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setVoiceState("listening");
    speechSynthesis.speak(utterance);
  }

  function handleAmbientTranscript(transcript: string) {
    const wakeMatch = transcript.match(/\b(?:hey\s+(?:ren|run)|ren)\b/i);
    const alreadyAwake = Date.now() < awakeUntilRef.current;
    if (!wakeMatch && !alreadyAwake) return;
    void setExpanded(true); keepAwake(); setVoiceState("listening");
    const remainder = wakeMatch ? transcript.slice((wakeMatch.index ?? 0) + wakeMatch[0].length).replace(/^[,.:;\s-]+/, "") : transcript;
    if (remainder) void askQuestion(remainder); else greet();
  }

  async function captureBurst() {
    return window.ren ? window.ren.captureContext() : [];
  }

  async function askQuestion(rawQuestion: string) {
    const clean = rawQuestion.trim(); if (!clean || voiceState === "processing") return;
    setQuestion(""); setError(""); setVoiceState("processing"); keepAwake();
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: clean }]);
    try {
      const history = messagesRef.current.slice(-8).map(({ role, content }) => ({ role, content }));
      const response = window.ren ? await window.ren.ask({ question: clean, frames: await captureBurst(), history }) : { answer: "I can see the interaction working in preview mode. The packaged desktop app will use your current screen and cursor as context.", annotations: [], provider: "demo" as const };
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer, provider: response.provider }]);
      if (response.annotations.length) await window.ren?.showAnnotations(response.annotations);
      setVoiceState("responding"); suppressSpeechUntilRef.current = Date.now() + Math.min(12_000, response.answer.length * 45);
      const utterance = new SpeechSynthesisUtterance(response.answer); utterance.onend = () => { setVoiceState("listening"); keepAwake(); }; speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t answer."); setVoiceState("idle"); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void askQuestion(question); }

  if (!expanded) return <button className={`ren-pebble state-${voiceState}`} onClick={() => void setExpanded(true)} aria-label="Open Ren"><span className="pebble-mark"><Spark /></span><span>Ren</span><i /></button>;

  return <main className="ambient-panel">
    <header className="ambient-header"><div className={`companion-orb state-${voiceState}`}><Spark />{voiceState !== "idle" && <div className="voice-bars"><i /><i /><i /></div>}</div><div><p>REN · AMBIENT TEACHER</p><h1>{voiceState === "processing" ? "Looking closely…" : voiceState === "listening" ? "I’m listening." : "How can I help?"}</h1></div><button onClick={() => void setExpanded(false)} aria-label="Collapse Ren">—</button></header>

    {!permission?.ready ? <section className="onboarding-card"><span className="step-kicker">ONE-TIME SETUP</span><h2>Give Ren permission once.</h2><p>Allow microphone and screen recording now. After that, Ren starts quietly with your computer and only captures the screen when you ask a question.</p><div className="permission-row"><span>Microphone</span><b>{permission?.microphone ?? "checking"}</b></div><div className="permission-row"><span>Screen recording</span><b>{permission?.screen ?? "checking"}</b></div><button className="allow-button" onClick={() => void requestOneTimePermissions()}>Allow and continue</button>{permission && !permission.ready && <button className="settings-link" onClick={() => void window.ren?.openPermissionSettings()}>Open system permission settings</button>}</section> : <>
      <div className="ambient-status"><span className="status-live" /> Watching only when asked <em>·</em> {source?.name ?? "connecting to display"}<span className="wake-chip">Say “Hey Ren”</span></div>
      <section className="ambient-conversation" aria-live="polite">{messages.length === 0 && <div className="empty-conversation"><Spark /><p>Point with your cursor, then say:</p><strong>“Hey Ren, explain this to me.”</strong></div>}{messages.map((message) => <article key={message.id} className={message.role}><span>{message.role === "assistant" ? "REN" : "YOU"}</span><p>{message.content}</p></article>)}</section>
      {error && <div className="ambient-error" role="alert">{error}</div>}
      <form className="ambient-composer" onSubmit={submit}><button type="button" className={`listen-button state-${voiceState}`} onClick={() => { void setExpanded(true); keepAwake(); setVoiceState("listening"); }} aria-label="Listen"><MicGlyph /></button><textarea aria-label="Ask Ren" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askQuestion(question); } }} placeholder="Or type a question…" rows={2} /><button type="submit" className="ask-button" disabled={!question.trim() || voiceState === "processing"}>↑</button></form>
      <footer><span>Cursor position adds pointing context</span><button onClick={() => void window.ren?.clearAnnotations()}>Clear drawings</button></footer>
    </>}
  </main>;
}
