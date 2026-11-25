# Architecture

## System shape

```text
┌──────────────── Renderer (untrusted) ────────────────┐
│ Ambient pebble · transcript · local wake UI · text UI  │
└───────────────────────┬───────────────────────────────┘
                        │ narrow, typed IPC
┌──────────────── Electron main (trusted) ─────────────┐
│ source capture · provider adapter · policy · overlay  │
└──────────────┬────────────────────────┬───────────────┘
               │ HTTPS                  │ validated draw commands
        ┌──────▼──────┐          ┌──────▼────────┐
        │ AI provider │          │ Overlay window │
        └─────────────┘          └───────────────┘
```

The renderer handles a key only while the learner enters it. Main encrypts the
key with Electron safeStorage, saves only ciphertext, and never returns a saved
key over IPC. Electron context isolation and sandboxing are enabled, Node
integration is disabled, and every IPC method is exposed explicitly through
the preload bridge.

## Request lifecycle

1. One-time onboarding obtains OS screen/microphone permission and persists the
   operating system grant; routine launches do not show a source picker.
2. An on-device wake gate expands the top-edge pebble after “Hey Ren.” A separate
   local model transcribes the following English question. Neither ambient nor
   dictated audio is sent to the answer provider.
3. On a question, main hides Ren's windows and captures a lossless image from the
   display containing the learner's cursor. It adds a circled crop and up to
   two compressed short-interval frames only when screen motion is detected.
4. Main keeps captured frames in memory and gives the renderer a one-use
   context token. It validates the question, consumes that token, and sends the
   captured frames to the configured provider without round-tripping them
   through renderer IPC.
5. The provider returns prose plus normalized overlay commands and, for a
   requested visual explanation, a bounded connected-parts lesson.
6. Main validates and forwards commands and lesson geometry to the transparent
   click-through overlay window on the captured display.
7. Main rejects a late visual if its captured display or context changed. The
   renderer shows the answer and has no IPC method for forging draw commands.

The cursor's normalized position is added as a pointing hint. It is never
treated as permission to click, type, or control the underlying application.
For circle-to-focus, a local native hook reads only Control/Option state and cursor
movement. It retains points during the gesture, rejects open strokes, and
passes a bounded focus rectangle and close crop into one on-demand question.
No key contents or mouse actions are stored or transmitted.

## Automatic capability seam

`AssistantProvider` is the initial capability boundary. Ren's orchestrator may
later invoke internal, permission-scoped context enrichers automatically; these
are implementation details, never modes or add-ons the learner must configure.
The default experience remains “point, ask, learn.” A future CAD enricher, for
example, may use a documented host API after one data-access permission, while
Ren still presents a single teacher interface and never asks the learner to
choose a CAD tool.

## Threat model summary

- Screen content is untrusted and may contain prompt injection.
- A compromised renderer could capture a newly typed API key, so the setup
  screen is part of the trusted user path. Saved keys cannot be read back over
  IPC and arbitrary Node APIs remain unavailable to the renderer.
- All structured model output is parsed and range-checked before rendering.
- Navigation, popups, downloads, and unexpected permissions are denied.
- The screen is never continuously captured. Ambient microphone access is
  permitted only through a verified on-device wake gate; otherwise it is off.
- Autonomous input requires a separate future review.

