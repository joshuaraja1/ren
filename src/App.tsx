const Spark = () => (
  <svg aria-hidden="true" viewBox="0 0 32 32" className="spark">
    <path d="M16 2c.8 8.6 5.4 13.2 14 14-8.6.8-13.2 5.4-14 14-.8-8.6-5.4-13.2-14-14 8.6-.8 13.2-5.4 14-14Z" />
  </svg>
);

const ScreenGlyph = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const MicGlyph = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <rect x="8" y="3" width="8" height="12" rx="4" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
  </svg>
);

export function App() {
  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Ren navigation">
        <div className="brand-mark"><Spark /><span>ren</span></div>
        <nav>
          <button className="rail-button active" aria-label="Learn now"><Spark /></button>
          <button className="rail-button" aria-label="Past sessions">↺</button>
        </nav>
        <button className="avatar" aria-label="Settings">JR</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">LIVE LEARNING SPACE</p>
            <h1>Learn right where you are.</h1>
          </div>
          <div className="privacy-pill"><span /> Private by default</div>
        </header>

        <div className="stage" aria-label="Shared screen preview">
          <div className="stage-grid" />
          <div className="stage-note note-one">share a window</div>
          <div className="stage-note note-two">ask naturally</div>
          <div className="empty-lesson">
            <div className="orb"><ScreenGlyph /></div>
            <p className="step-number">01</p>
            <h2>Show Ren what<br />you’re learning.</h2>
            <p>Choose any screen or app. Ren understands the visible context—no subject setup required.</p>
            <button className="primary-button"><ScreenGlyph /> Choose a screen</button>
          </div>
          <div className="annotation-demo" aria-hidden="true">
            <svg viewBox="0 0 180 100">
              <path d="M8 82C62 86 85 60 142 22" />
              <path d="m130 20 16 0-4 15" />
            </svg>
            <span>Ren draws here</span>
          </div>
        </div>
      </section>

      <aside className="teacher-panel" aria-label="Conversation with Ren">
        <div className="teacher-heading">
          <div className="ren-face"><Spark /></div>
          <div><p>YOUR TEACHER</p><h2>Ask Ren</h2></div>
          <span className="online-dot" title="Ready" />
        </div>

        <div className="conversation" aria-live="polite">
          <div className="message ren-message">
            <span className="message-label">REN</span>
            <p>I’m ready when you are. Share what you’re looking at, then ask me about anything on screen.</p>
          </div>
          <div className="suggestions">
            <button>“Explain what’s happening here”</button>
            <button>“Point out the important part”</button>
            <button>“Teach me this step by step”</button>
          </div>
        </div>

        <div className="composer">
          <label htmlFor="question">Ask about your screen</label>
          <textarea id="question" placeholder="What don’t you understand?" rows={3} />
          <div className="composer-actions">
            <button className="mic-button" aria-label="Hold to talk"><MicGlyph /></button>
            <span>Hold to talk</span>
            <button className="send-button" aria-label="Send question">↑</button>
          </div>
        </div>
        <p className="panel-footnote">Ren can make mistakes. Think together and verify important work.</p>
      </aside>
    </main>
  );
}

