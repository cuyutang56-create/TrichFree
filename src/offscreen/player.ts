// Web Audio playback in the offscreen document: pre-decoded clips + a synthesised two-note chime.
import { dbToAmp } from '../core/audioProcess';

export const CHIME_MS = 400;
const CHIME_PEAK = 0.6 * dbToAmp(-3); // 60% of the clips' normalised peak

export class Player {
  ctx = new AudioContext({ latencyHint: 'interactive' });
  private buffers = new Map<string, AudioBuffer>();
  private active: AudioScheduledSourceNode[] = [];

  async resume() { if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {}); return this.ctx.state; }

  async load(clips: { id: string; blob: Blob }[]) {
    this.buffers.clear();
    await Promise.all(clips.map(async (c) => {
      try { this.buffers.set(c.id, await this.ctx.decodeAudioData(await c.blob.arrayBuffer())); }
      catch (e) { console.warn('[player] could not decode clip', c.id, e); }
    }));
  }
  has(id: string) { return this.buffers.has(id); }

  /** Soft two-note chime (no asset), 400 ms. Returns the audio start time in epoch ms. */
  chime(): number {
    const t0 = this.ctx.currentTime + 0.01;
    const notes: [number, number][] = [[659.25, 0], [880, 0.2]];
    for (const [freq, off] of notes) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + off);
      g.gain.linearRampToValueAtTime(CHIME_PEAK, t0 + off + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + off + 0.2);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0 + off);
      osc.stop(t0 + off + 0.21);
      this.track(osc);
    }
    return Date.now() + 10;
  }

  clip(id: string, delayMs: number): number | null {
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(this.ctx.currentTime + delayMs / 1000);
    this.track(src);
    return Date.now() + delayMs;
  }

  stopAll() { for (const n of this.active) { try { n.stop(); } catch { /* already stopped */ } } this.active = []; }
  private track(n: AudioScheduledSourceNode) {
    this.active.push(n);
    n.onended = () => { this.active = this.active.filter((x) => x !== n); };
  }
  async close() { this.stopAll(); await this.ctx.close().catch(() => {}); }
}
