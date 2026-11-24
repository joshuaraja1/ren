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

To focus on one part of the screen, hold **Ctrl+Shift**, move the cursor in a
circle around it, and release. Ren opens, captures that display on demand,
includes a close crop of the selected region, and explains it. The gesture
does not click or alter the app underneath. On macOS, the one-time setup also
requests Accessibility access for the global shortcut; Input Monitoring may
need to be enabled in System Settings.

## Run locally

Requirements: Node.js 22+ and the screen-recording permission for your OS.

```bash
npm install
npm run dev
```

To get screen-specific answers in the desktop app, open **Connect AI** in Ren
and enter an HTTPS provider URL, a vision-capable model name, and its API key
once. Ren stores the key encrypted with the operating system's secure storage,
and sends screenshots to that provider only when you ask. The provider may
charge for requests. On Linux, saving a key requires a system keyring.

For development, `.env.example` still supports `OPENAI_API_KEY`, `REN_MODEL`,
and an optional `REN_API_BASE`. Ren uses the OpenAI-compatible chat completions
contract. Environment files are ignored by git. Without a configured provider,
Ren shows an explicit demo notice and cannot inspect screen contents.

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
