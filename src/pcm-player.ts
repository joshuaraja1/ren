/** Plays Deepgram's headerless 24 kHz, signed 16-bit PCM as chunks arrive. */
export class PcmStreamPlayer {
  private pending = new Uint8Array(0);
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private done = false;
  private disposed = false;
  private receivedAudio = false;

  constructor(private readonly context: AudioContext, private readonly onEnded: () => void) {}

  get remainingPlaybackMs() {
    return Math.max(0, Math.ceil((this.nextStart - this.context.currentTime) * 1000));
  }

  push(chunk: Uint8Array) {
    if (this.disposed || this.done || !chunk.length) return;
    const merged = new Uint8Array(this.pending.length + chunk.length);
    merged.set(this.pending);
    merged.set(chunk, this.pending.length);
    this.pending = merged;
    // Roughly 85 ms per buffer keeps the audio queue small without waiting
    // for Deepgram to finish the whole response.
    while (this.pending.length >= 4096) this.schedule(this.take(4096));
  }

  complete() {
    if (this.disposed || this.done) return;
    this.done = true;
    if (this.pending.length % 2) throw new Error("Deepgram returned an incomplete audio frame.");
    if (this.pending.length) this.schedule(this.take(this.pending.length));
    if (!this.receivedAudio) throw new Error("Deepgram returned no speech audio.");
    this.maybeFinish();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* It may already have ended. */ }
      source.disconnect();
    }
    this.sources.clear();
    void this.context.close().catch(() => {});
  }

  private take(length: number) {
    const part = this.pending.slice(0, length);
    this.pending = this.pending.slice(length);
    return part;
  }

  private schedule(bytes: Uint8Array) {
    const samples = bytes.length / 2;
    const buffer = this.context.createBuffer(1, samples, 24_000);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < samples; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      this.maybeFinish();
    };
    this.sources.add(source);
    const start = Math.max(this.context.currentTime + 0.06, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration;
    this.receivedAudio = true;
  }

  private maybeFinish() {
    if (this.done && this.sources.size === 0 && !this.disposed) this.onEnded();
  }
}
