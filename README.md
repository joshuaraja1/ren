# Ren

Ren is an open-source, screen-aware learning companion. Talk to it about what
is on your screen, ask it to explain what you are seeing, and let it place
visual guidance directly over your work.

The first desktop prototype lives in a small top-edge overlay. After one-time OS
permission onboarding, point with the cursor and say “Hey Ren,” or click the Ren
pebble. The bundled wake model recognizes “Hey Ren” on-device. Ren then
streams the spoken question to Deepgram for transcription, or accepts a typed question. Ren
captures the cursor's display automatically for every submitted question, infers the subject
automatically, and can place validated teaching visuals in a click-through
overlay. A deterministic
demo teacher keeps the interaction testable without credentials.

To focus on one part of the screen, hold **Control+Option** (Control+Alt on Windows/Linux), move the cursor in a
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

Open **Connect AI** in Ren and enter a Deepgram API key for voice and an OpenAI API key for answers. Ren encrypts both keys with operating-system secure storage and does not display them again. The small “Hey Ren” wake detector stays on-device. After wake, spoken audio goes to Deepgram for transcription. Ren sends the reply text to Deepgram for speech. Ren automatically sends a fresh screen image with every submitted question to OpenAI (`gpt-6-sol` by default), so questions can refer to visible content without special wording. Both services may charge for usage. On Linux, saving keys requires a system keyring. Ren does not run Ollama or a local speech model.

For development, `.env.example` supports `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, and optional `REN_MODEL`. Environment files are ignored by git. Without configured keys, Ren shows a setup notice and cannot use cloud voice or inspect screen contents.

For realistic on-screen illustrations, Ren can connect once to a
[project-hosted image service](docs/HOSTED_IMAGES.md). The desktop sends only
the approved lesson manifest to that service; the provider credential and
image-generation compute stay on the server. The hosted service currently
requires a Ren access token for staging and has not been deployed publicly.

```bash
npm run check
```

Merges to `main` produce unsigned macOS, Windows, and Linux staging artifacts.
See [the release guide](docs/RELEASE.md) for the production signing gates.

## Current boundary

Ren 0.1 captures a full-display image for every submitted question. It
adds a circled-region crop when available and extra frames when the screen is
visibly changing. It does not understand video before the captured moment.
It does not continuously record the screen. Ren can attempt bounded click, drag,
scroll, type, and key actions in the visible app when explicitly asked, checking
the display before and after each action; this does not guarantee every app or
task can be completed. Wake recognition runs on-device and sends no ambient audio to Deepgram. After the wake phrase, Ren streams the spoken question to Deepgram and submits it after a pause; the mic button can finish it sooner. Deepgram Flux currently supports English in Ren, and typing remains available if it mishears. If the wake
engine cannot start, the pebble stays clickable. System-audio
transcript and richer temporal video understanding remain on the roadmap.
Long-running agent jobs currently investigate the screen and, when needed,
research the web. They do not operate other apps. The screen operator is a
separate path for explicit action requests.
Connected parts diagrams and realistic generated lesson images, composed
directly over the user's current screen, are specified in
[the visual teaching plan](docs/VISUAL_TEACHING.md). Current drawings remain
on-screen schematic overlays. The draft branch can also generate a realistic
image with the OpenAI Image API, directly or through the Ren-hosted service.
Ren only
places image callouts when every part passes the location check; otherwise it
keeps the schematic.
When a screen changes during an answer, Ren withholds spatial drawings and
asks for a fresh question rather than placing callouts on stale content.

## License

MIT
