# Ren

Ren is an open-source, screen-aware learning companion. Talk to it about what
is on your screen, ask it to explain what you are seeing, and let it place
visual guidance directly over your work.

The first desktop prototype lives in a small top-edge overlay. After one-time OS
permission onboarding, point with the cursor and say “Hey Ren,” or click the Ren
pebble. The bundled wake model recognizes “Hey Ren” on-device. Ren then
transcribes an English question locally, or accepts a typed question. Ren
captures the cursor's display only when a question is asked, infers the subject
automatically, and can place validated teaching visuals in a click-through
overlay. A deterministic
demo teacher keeps the interaction testable without credentials.

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

Merges to `main` produce unsigned macOS, Windows, and Linux staging artifacts.
See [the release guide](docs/RELEASE.md) for the production signing gates.

## Current boundary

Ren 0.1 captures a three-frame visual burst only when a question is submitted.
It does not continuously record the screen, click, type, or control other
applications. Wake recognition runs on-device and sends no ambient audio to the
answer provider. After the wake phrase, Ren listens for a question and submits
it after a pause; the mic button can finish it sooner. Local dictation currently
supports English, and typing remains available if it mishears. If the wake
engine cannot start, the pebble stays clickable. System-audio
transcript and richer temporal video understanding remain on the roadmap.

## License

MIT
