import { FormEvent, useEffect, useRef, useState } from "react";
import type { Annotation, AskResponse, ConversationTurn, ScreenSource } from "./contracts";

const Spark = () => <svg aria-hidden="true" viewBox="0 0 32 32" className="spark"><path d="M16 2c.8 8.6 5.4 13.2 14 14-8.6.8-13.2 5.4-14 14-.8-8.6-5.4-13.2-14-14 8.6-.8 13.2-5.4 14-14Z" /></svg>;
const ScreenGlyph = () => <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
const MicGlyph = () => <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></svg>;

type Message = ConversationTurn & { id: string; provider?: AskResponse["provider"] };
type SpeechRecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
};

const starter: Message = { id: "welcome", role: "assistant", content: "I’m ready when you are. Share what you’re looking at, then ask me about anything on screen." };

function InlineAnnotations({ annotations }: { annotations: Annotation[] }) {
  return <svg className="inline-annotations" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs><marker id="inline-arrow" markerWidth="12" markerHeight="12" refX="9" refY="4" orient="auto"><path d="M0,0 L0,8 L10,4 z" /></marker></defs>
    {annotations.map((item) => {
      const color = item.color || "#e7653a";
      if (item.type === "arrow") return <line key={item.id} x1={item.from.x * 1000} y1={item.from.y * 1000} x2={item.to.x * 1000} y2={item.to.y * 1000} markerEnd="url(#inline-arrow)" style={{ color }} />;
      if (item.type === "rectangle") return <rect key={item.id} x={item.at.x * 1000} y={item.at.y * 1000} width={item.width * 1000} height={item.height * 1000} rx="18" style={{ color }} />;
      if (item.type === "path") return <polyline key={item.id} points={item.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")} style={{ color }} />;
      return null;
    })}
  </svg>;
}

export function App() {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [selected, setSelected] = useState<ScreenSource | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<Message[]>([starter]);
  const [question, setQuestion] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  async function openSourcePicker() {
    setError("");
    try {
      if (!window.ren) setSources([{ id: "preview", name: "Browser preview", thumbnail: "" }]);
      else setSources(await window.ren.listSources());
      setShowSources(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t list screens. Check screen-recording permission.");
    }
  }

  async function chooseSource(source: ScreenSource) {
    setShowSources(false);
    stream?.getTracks().forEach((track) => track.stop());
    if (source.id === "preview") { setSelected(source); return; }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: source.id, maxFrameRate: 12 } } as MediaTrackConstraints });
      setSelected(source); setStream(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Screen sharing was not allowed."); }
  }

  async function stopSharing() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null); setSelected(null); setAnnotations([]);
    await window.ren?.clearAnnotations();
  }

  async function captureBurst() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return [];
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return [];
    const frames: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height); frames.push(canvas.toDataURL("image/jpeg", .82));
      if (index < 2) await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return frames;
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const clean = question.trim();
    if (!clean || busy) return;
    setQuestion(""); setBusy(true); setError("");
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: clean };
    setMessages((current) => [...current, userMessage]);
    try {
      const request = { question: clean, frames: await captureBurst(), history: messages.filter((message) => message.id !== "welcome").map(({ role, content }) => ({ role, content })) };
      const response = window.ren ? await window.ren.ask(request) : { answer: "Preview mode is ready. Launch Ren as a desktop app to let me see and teach from your screen.", annotations: [], provider: "demo" as const };
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer, provider: response.provider }]);
      setAnnotations(response.annotations);
      if (response.annotations.length) await window.ren?.showAnnotations(response.annotations);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ren couldn’t answer. Try again."); }
    finally { setBusy(false); }
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const browserWindow = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) { setError("Voice recognition isn’t available on this system yet. You can still type your question."); return; }
    const recognition = new Recognition();
    recognition.continuous = false; recognition.interimResults = true; recognition.lang = navigator.language;
    recognition.onresult = (event) => setQuestion(Array.from(event.results).map((result) => result[0].transcript).join(""));
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition; recognition.start(); setListening(true);
  }

  function speak(answer: string) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(answer)); }

  return <main className="app-shell">
    <aside className="rail" aria-label="Ren navigation"><div className="brand-mark"><Spark /><span>ren</span></div><nav><button className="rail-button active" aria-label="Learn now"><Spark /></button><button className="rail-button" aria-label="Past sessions">↺</button></nav><button className="avatar" aria-label="Settings">JR</button></aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">LIVE LEARNING SPACE</p><h1>Learn right where you are.</h1></div><div className={`privacy-pill ${selected ? "sharing" : ""}`}><span /> {selected ? `Seeing ${selected.name}` : "Private by default"}</div></header>
      <div className={`stage ${selected ? "is-sharing" : ""}`} aria-label="Shared screen preview">
        {stream && <video ref={videoRef} className="screen-video" autoPlay muted playsInline />}
        {selected?.id === "preview" && <div className="preview-placeholder">Desktop preview mode</div>}
        <InlineAnnotations annotations={annotations} />
        {!selected && <><div className="stage-grid" /><div className="stage-note note-one">share a window</div><div className="stage-note note-two">ask naturally</div><div className="empty-lesson"><div className="orb"><ScreenGlyph /></div><p className="step-number">01</p><h2>Show Ren what<br />you’re learning.</h2><p>Choose any screen or app. Ren understands the visible context—no subject setup required.</p><button className="primary-button" onClick={openSourcePicker}><ScreenGlyph /> Choose a screen</button></div><div className="annotation-demo" aria-hidden="true"><svg viewBox="0 0 180 100"><path d="M8 82C62 86 85 60 142 22" /><path d="m130 20 16 0-4 15" /></svg><span>Ren draws here</span></div></>}
        {selected && <div className="sharing-controls"><button onClick={openSourcePicker}>Change screen</button><button onClick={() => void stopSharing()}>Stop sharing</button><button onClick={() => { setAnnotations([]); void window.ren?.clearAnnotations(); }}>Clear drawings</button></div>}
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
    <aside className="teacher-panel" aria-label="Conversation with Ren">
      <div className="teacher-heading"><div className="ren-face"><Spark /></div><div><p>YOUR TEACHER</p><h2>Ask Ren</h2></div><span className="online-dot" title="Ready" /></div>
      <div className="conversation" aria-live="polite">
        {messages.map((message) => <div key={message.id} className={`message ${message.role === "assistant" ? "ren-message" : "user-message"}`}><span className="message-label">{message.role === "assistant" ? "REN" : "YOU"}{message.provider === "demo" ? " · DEMO" : ""}</span><p>{message.content}</p>{message.role === "assistant" && message.id !== "welcome" && <button className="speak-button" onClick={() => speak(message.content)} aria-label="Read answer aloud">◖))</button>}</div>)}
        {messages.length === 1 && <div className="suggestions">{["Explain what’s happening here", "Point out the important part", "Teach me this step by step"].map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)}>“{prompt}”</button>)}</div>}
        {busy && <div className="thinking"><i /><i /><i /> Looking closely…</div>}
      </div>
      <form className="composer" onSubmit={submit}><label htmlFor="question">Ask about your screen</label><textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="What don’t you understand?" rows={3} /><div className="composer-actions"><button type="button" className={`mic-button ${listening ? "listening" : ""}`} onClick={toggleVoice} aria-label={listening ? "Stop listening" : "Hold to talk"}><MicGlyph /></button><span>{listening ? "Listening…" : "Tap to talk"}</span><button type="submit" className="send-button" aria-label="Send question" disabled={!question.trim() || busy}>↑</button></div></form>
      <p className="panel-footnote">Ren can make mistakes. Think together and verify important work.</p>
    </aside>
    {showSources && <div className="source-backdrop" role="presentation" onMouseDown={() => setShowSources(false)}><section className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="source-title" onMouseDown={(event) => event.stopPropagation()}><div><p className="eyebrow">WHAT SHOULD REN SEE?</p><h2 id="source-title">Choose a screen or window</h2><p>Ren only captures a short visual burst when you ask a question.</p></div><div className="source-grid">{sources.map((source) => <button key={source.id} onClick={() => void chooseSource(source)}>{source.thumbnail ? <img src={source.thumbnail} alt="" /> : <div className="source-fallback"><ScreenGlyph /></div>}<span>{source.name}</span></button>)}</div><button className="dialog-close" onClick={() => setShowSources(false)}>Cancel</button></section></div>}
  </main>;
}
