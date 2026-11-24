# Ambient assistant reference notes

Ren reviewed two MIT-licensed open-source projects for architectural evidence.
No source code or visual identity was copied.

## Clicky

Source: https://github.com/farzaa/clicky

- A central companion state machine owns the listening → processing → responding
  flow. The on-screen buddy visibly morphs between waveform, spinner, response,
  and pointing states instead of opening a conventional chat app.
- Transparent non-activating windows join every desktop space and ignore mouse
  events, so teaching visuals do not block the learner's application.
- Screen capture excludes the assistant's own windows, labels pixel dimensions,
  sorts the cursor's monitor first, and maps model coordinates back across
  multiple displays.
- Permissions are revalidated but their successful one-time state persists.
- Visual context is captured only for an invoked question, not recorded in the
  background.

## OpenClicky

Source: https://github.com/jasonkneen/openclicky

- The wake-word gate requires on-device speech recognition and refuses to use a
  remote always-listening fallback. Ren adopts this fail-closed privacy rule.
- Voice activation is modeled separately from the response model, allowing wake
  listening to stay local even when an answer uses cloud vision.
- Cursor-screen, focused-window, and selected-region capture are separate context
  strategies. Ren begins with cursor-screen capture; focused-window and a
  circle-while-speaking gesture are strong follow-up milestones.
- Visual context is skipped for text-only turns to reduce latency and cost.
- A local-only overlay bridge makes screenshot, pointer, caption, speech, and
  clear operations independently testable without mutating normal conversation.

## Ren decisions

- Keep the four visible states and transient overlay behavior.
- Automatically choose context; never expose subject tools or modes.
- Use structured, validated annotations rather than free-form point tags.
- Never warp the real system cursor and never synthesize clicks in the teaching
  release.
- Keep telemetry off by default and avoid a mandatory hosted proxy. A future
  public service may proxy secrets, but local/BYOK and local-model paths remain.
- Add focused-window capture, circle-to-focus, a local overlay test bridge, and
  native local wake providers as explicit roadmap work.
