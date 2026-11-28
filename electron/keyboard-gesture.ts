/** A tap is a complete physical Control down/up cycle, not a key repeat. */
export class TripleControlGesture {
  private pressed = new Set<number>();
  private eligible = false;
  private taps = 0;
  private lastRelease = 0;
  private pressedAt = 0;

  constructor(
    private readonly controlKeys: ReadonlySet<number>,
    private readonly onTripleControl: () => void,
    private readonly maxGapMs = 900,
    private readonly maxTapMs = 650,
  ) {}

  keyDown(event: { keycode: number; altKey: boolean; metaKey: boolean; shiftKey: boolean }, now = Date.now()) {
    const isControl = this.controlKeys.has(event.keycode);
    if (!isControl) { this.resetSequence(); return; }
    if (this.pressed.has(event.keycode)) return;
    if (this.pressed.size || event.altKey || event.metaKey || event.shiftKey) {
      this.resetSequence();
      this.eligible = false;
    } else {
      if (this.taps && now - this.lastRelease > this.maxGapMs) this.resetSequence();
      this.eligible = true;
      this.pressedAt = now;
    }
    this.pressed.add(event.keycode);
  }

  keyUp(event: { keycode: number }, now = Date.now()) {
    if (!this.controlKeys.has(event.keycode)) return;
    if (!this.pressed.delete(event.keycode)) return;
    if (!this.eligible || this.pressed.size || now - this.pressedAt > this.maxTapMs) { this.resetSequence(); return; }
    this.eligible = false;
    if (this.taps && now - this.lastRelease > this.maxGapMs) this.taps = 0;
    this.taps += 1;
    this.lastRelease = now;
    if (this.taps === 3) {
      this.resetSequence();
      this.onTripleControl();
    }
  }

  reset() {
    this.pressed.clear();
    this.resetSequence();
  }

  private resetSequence() {
    this.eligible = false;
    this.taps = 0;
    this.lastRelease = 0;
    this.pressedAt = 0;
  }
}
