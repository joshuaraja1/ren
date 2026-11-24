# Ren product requirements

Status: v0.1 approved for implementation

## Product promise

Ren is a privacy-conscious desktop learning companion that can understand the
screen a user deliberately shares, discuss it by voice or text, and place
temporary visual guidance over the user's work. It should help a learner think
and act, not silently take control of their computer.

## Principles

1. **User-directed context.** Ren only observes a source the user selects and
   makes the active sharing state unmistakable.
2. **Teach before doing.** Explanations, questions, and reversible visual hints
   are preferred to hidden automation.
3. **Provider-neutral.** Models, OCR engines, and domain tools are adapters, not
   assumptions embedded in the interface.
4. **Local-first privacy.** Screenshots are ephemeral by default. No analytics,
   recording, or cloud upload is enabled without explicit consent.
5. **Honest capability.** Ren states uncertainty and never claims to understand
   unsupported application state or hidden geometry.
6. **Accessible by construction.** Keyboard, voice, reduced-motion, contrast,
   and screen-reader flows are release requirements.

## Release 0.1 — complete learning loop

### R1. Desktop shell

- macOS, Windows, and Linux Electron application.
- Compact always-on-top assistant panel with a clear quit path.
- Permission onboarding for screen capture and microphone.
- App state survives a renderer refresh without leaking secrets.

### R2. Deliberate screen context

- User chooses a display or application window.
- The selected source is shown with a visible sharing indicator and preview.
- A still frame is captured only when a question is submitted in v0.1.
- Capture can be stopped immediately from the main panel.
- Password managers and explicitly configured apps can be excluded.

### R3. Multimodal conversation

- Text questions work everywhere.
- Push-to-talk uses operating-system/browser speech recognition when available.
- Requests contain the current question, a bounded conversation history, and
  the current captured frame.
- OpenAI-compatible vision endpoints are supported through an adapter.
- A deterministic demo provider makes the complete app usable without an API
  key and keeps tests offline.
- Responses stream into the panel and can be read aloud on request.

### R4. Visual guidance overlay

- Ren can return typed annotation commands: arrow, rectangle, point, and text.
- Commands are validated, bounded to normalized coordinates, and rendered in a
  transparent click-through window over the chosen display.
- The user can clear or hide every annotation instantly.
- The overlay never synthesizes input or clicks on the user's behalf in v0.1.

### R5. Safety, privacy, and trust

- API keys are read from the OS process environment in v0.1 and never sent to
  the renderer or written to logs.
- Requests disclose whether a frame will leave the device.
- Captured frames are held in memory and discarded after the request.
- Logs redact image data, authorization headers, and common credential shapes.
- Prompt-injection text visible on screen is treated as untrusted content.
- Destructive, medical, legal, or high-stakes guidance includes appropriate
  uncertainty and asks the user to verify consequential actions.

### R6. Quality and staging

- Type checking, unit tests, renderer tests, and build smoke tests run in CI.
- Pull requests receive a packaged web preview artifact for UI review.
- Main produces unsigned desktop staging artifacts on all three operating
  systems. Releases require signed and notarized artifacts.
- Architecture decisions and contributor setup are documented.

## Non-goals for 0.1

- Autonomous clicking, typing, shell execution, or file modification.
- Continuous screen recording or background surveillance.
- Guaranteed comprehension of proprietary CAD scene graphs or 3D meshes.
- Replacing qualified professional advice.
- A hosted account, billing system, or telemetry backend.

## Capability roadmap

- **0.2 Domain tools:** OCR, math structure recognition, browser DOM context,
  CAD file/selection adapters, slicer and G-code inspection.
- **0.3 Collaborative canvas:** multi-step lessons, editable annotations,
  checkpoints, and exportable learning notes.
- **0.4 Local intelligence:** local vision/language adapters and offline voice.
- **1.0 Trustworthy extensibility:** signed capability manifests, sandboxed
  plugins, permissions per tool, and reproducible signed releases.

## Acceptance scenario

A learner opens a math worksheet, chooses that window, holds the microphone
button and asks, “Why is this term moved to the other side?” Ren captures one
frame, explains the operation, and draws an arrow between the relevant regions.
The learner clears the arrow, asks a follow-up by text, and stops sharing. The
same request/annotation protocol can later serve CAD, code, design, or slicer
tools without changing the core UI.

