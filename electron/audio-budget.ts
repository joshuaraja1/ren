export class RealtimeAudioBudget {
  private readonly startedAt: number;
  private accepted = 0;

  constructor(private readonly sampleRate: number, private readonly now: () => number = Date.now) { this.startedAt = now(); }

  accept(samples: number) {
    if (!Number.isInteger(samples) || samples < 1 || samples > 8192) return false;
    const elapsedSeconds = Math.max(0, this.now() - this.startedAt) / 1000;
    const allowance = Math.min(this.sampleRate * 30, this.sampleRate * (3.5 + elapsedSeconds * 1.2));
    if (this.accepted + samples > allowance) return false;
    this.accepted += samples;
    return true;
  }
}
