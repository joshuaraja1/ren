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

The renderer never receives provider credentials. Electron context isolation
and sandboxing are enabled, Node integration is disabled, and every IPC method
is exposed explicitly through the preload bridge.

## Request lifecycle

1. One-time onboarding obtains OS screen/microphone permission and persists the
   operating system grant; routine launches do not show a source picker.
2. An on-device wake gate expands the top-edge pebble after “Hey Ren.”
3. On a question, main hides Ren's windows and captures a short JPEG burst from
   the display containing the learner's cursor.
4. Main validates the payload and delegates to the configured provider.
5. The provider returns prose plus normalized overlay commands.
6. Main validates and forwards commands to the transparent overlay window.
7. The renderer discards the frame and shows the answer.

The cursor's normalized position is added as a pointing hint. It is never
treated as permission to click, type, or control the underlying application.

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
- Renderer compromise must not reveal API keys or arbitrary Node APIs.
- All structured model output is parsed and range-checked before rendering.
- Navigation, popups, downloads, and unexpected permissions are denied.
- The screen is never continuously captured. Ambient microphone access is
  permitted only through a verified on-device wake gate; otherwise it is off.
- Autonomous input requires a separate future review.

