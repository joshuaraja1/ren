# Ren

Ren is an open-source, screen-aware learning companion. Talk to it about what
is on your screen, ask it to explain what you are seeing, and let it place
visual guidance directly over your work.

The first desktop prototype supports deliberate screen/window sharing, voice or
text questions, automatic subject understanding, and validated teaching visuals
in a transparent overlay. It includes a deterministic demo teacher so the full
interaction can be explored without credentials.

## Run locally

Requirements: Node.js 22+ and the screen-recording permission for your OS.

```bash
npm install
npm run dev
```

To connect a vision model, copy `.env.example` to `.env` and provide
`OPENAI_API_KEY` plus `REN_MODEL`. Ren uses the OpenAI-compatible chat
completions contract and never exposes the key to the renderer. Environment
files are ignored by git.

```bash
npm run check
```

## Current boundary

Ren 0.1 captures a three-frame visual burst only when a question is submitted.
It does not continuously record, click, type, or control other applications.
System-audio transcript and richer temporal video understanding are on the 0.2
roadmap.

## License

MIT
