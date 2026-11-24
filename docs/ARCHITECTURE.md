# Architecture

## System shape

```text
┌──────────────── Renderer (untrusted) ────────────────┐
│ Assistant panel · source picker · transcript · mic UI │
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

1. The user selects a source returned by Electron's desktop capture API.
2. The renderer previews the source stream locally.
3. On submit, the renderer grabs a JPEG still and sends it with the question.
4. Main validates the payload and delegates to the configured provider.
5. The provider returns prose plus normalized overlay commands.
6. Main validates and forwards commands to the transparent overlay window.
7. The renderer discards the frame and shows the answer.

## Automatic capability seam

`AssistantProvider` is the initial capability boundary. Ren's orchestrator may
later invoke internal, permission-scoped context enrichers automatically; these
are implementation details, never modes or add-ons the learner must configure.
The default experience remains “share, ask, learn.” A future CAD enricher, for
example, may use a documented host API after one data-access permission, while
Ren still presents a single teacher interface and never asks the learner to
choose a CAD tool.

## Threat model summary

- Screen content is untrusted and may contain prompt injection.
- Renderer compromise must not reveal API keys or arbitrary Node APIs.
- All structured model output is parsed and range-checked before rendering.
- Navigation, popups, downloads, and unexpected permissions are denied.
- Continuous capture and autonomous input require separate future reviews.

