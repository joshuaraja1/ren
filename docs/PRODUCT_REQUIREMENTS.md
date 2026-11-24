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
3. **Zero-configuration intelligence.** The learner asks naturally. Ren chooses
   how to interpret and explain the screen without exposing tools, modes, or
   capability setup.
4. **Local-first privacy.** Screenshots are ephemeral by default. No analytics,
   recording, or cloud upload is enabled without explicit consent.
5. **Honest capability.** Ren states uncertainty and never claims to understand
   unsupported application state or hidden geometry.
6. **Accessible by construction.** Keyboard, voice, reduced-motion, contrast,
   and screen-reader flows are release requirements.

## Release 0.1 — complete learning loop

### R1. Ambient desktop shell

- macOS, Windows, and Linux Electron application.
- One-time permission onboarding for screen capture, microphone, and local
  speech recognition; OS grants are reused and revalidated on later launches.
- A small always-on-top top-edge “Ren pebble” starts with the computer, stays
  out of the dock/taskbar, joins every workspace, and expands without stealing
  focus from the learner's work.
- “Hey Ren” wakes the pebble into a listening teacher panel. Wake detection must
  run on-device; when local recognition is unavailable, Ren fails closed and
  offers click/keyboard activation rather than streaming ambient audio remotely.
- App state survives a renderer refresh without leaking secrets.

### R2. Deliberate screen context

- Ren automatically uses the display currently containing the learner's cursor;
  there is no source picker during normal use.
- An on-demand visual context burst is captured when a question is submitted;
  the learner does not need to pause, crop, identify the subject, or pick a
  specialized tool.
- Ren's own overlay windows are hidden from captures.
- Password managers and explicitly configured apps can be excluded.

### R3. Multimodal conversation

- Text questions work everywhere.
- Push-to-talk uses operating-system/browser speech recognition when available.
- Requests contain the current question, a bounded conversation history, and
  the current visual context burst.
- Ren infers the subject and teaching strategy automatically. Chemistry on a
  video, algebra on a worksheet, code in an editor, and geometry in a CAD app
  all use the same ask-and-teach interaction.
- OpenAI-compatible vision endpoints are supported through an adapter.
- A deterministic demo provider makes the complete app usable without an API
  key and keeps tests offline.
- Responses stream into the panel and can be read aloud on request.

### R4. Visual guidance overlay

- Ren can return typed teaching visuals: arrow, rectangle, point, text, freehand
  path, and a small diagram card.
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

- **Circle-to-focus gesture:** Hold Ctrl+Shift while tracing a closed region
  with the cursor. Ren previews the path, captures only after release, adds a
  crop as visual context, and asks for an explanation automatically. Open
  strokes, clicks, Escape, and crossing displays cancel the gesture. Native
  global input permission is requested during one-time onboarding where the
  operating system requires it.
- **0.2 Automatic context engine:** temporal video context, optional system-audio
  transcript, OCR, math structure recognition, and subject-aware teaching plans.
- **0.3 Collaborative canvas:** multi-step lessons, editable annotations,
  checkpoints, and exportable learning notes.
- **0.4 Local intelligence:** local vision/language adapters and offline voice.
- **1.0 Trustworthy extensibility:** invisible sandboxed capabilities selected by
  Ren, permissions based on data access rather than subjects, and reproducible
  signed releases. Users never install or select a chemistry/math/CAD “tool.”

## Acceptance scenario

A learner opens a math worksheet, points at a term, and says, “Hey Ren, why is
this term moved to the other side?” The top-edge pebble expands, Ren captures a
short burst from the cursor's display, explains the operation, and draws an
arrow between the relevant regions. The learner clears the arrow and asks a
follow-up by text. The
same automatic interaction works on a chemistry video, CAD viewport, code,
design, or slicer without changing modes or installing anything.

