// MediaRecorder wrapper with a live level meter and post-processing to a normalised WAV.
import { processClip } from '../core/audioProcess';
import { MAX_RECORD_MS } from '../shared/prompts';

export function pickMimeType(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

export class ClipRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private timer = 0;
  mimeType = '';

  async start(onLevel: (rms: number) => void, onAutoStop: () => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    this.mimeType = pickMimeType();
    this.rec = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    const buf = new Float32Array(this.analyser.fftSize);
    const tick = () => {
      this.analyser!.getFloatTimeDomainData(buf);
      let s = 0; for (const x of buf) s += x * x;
      onLevel(Math.sqrt(s / buf.length));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    this.rec.start(250);
    this.timer = window.setTimeout(onAutoStop, MAX_RECORD_MS);
  }

  /** Stops recording and returns the processed WAV, or null if nothing audible was recorded. */
  async stop(): Promise<{ blob: Blob; durationMs: number; sourceMimeType: string } | null> {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    const rec = this.rec;
    if (!rec) return null;
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    if (rec.state !== 'inactive') rec.stop();
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    const raw = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
    const decodeCtx = this.ctx ?? new AudioContext();
    try {
      const audio = await decodeCtx.decodeAudioData(await raw.arrayBuffer());
      const chans = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
      const out = processClip(chans, audio.sampleRate);
      if (!out) return null;
      return { blob: new Blob([out.wav as BlobPart], { type: 'audio/wav' }), durationMs: out.durationMs, sourceMimeType: this.mimeType };
    } finally {
      await decodeCtx.close().catch(() => {});
      this.rec = null; this.ctx = null; this.stream = null;
    }
  }

  cancel() { void this.stop().catch(() => {}); }
}

export async function micPermission(): Promise<PermissionState | 'unknown'> {
  try { return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state; } catch { return 'unknown'; }
}
export async function cameraPermission(): Promise<PermissionState | 'unknown'> {
  try { return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state; } catch { return 'unknown'; }
}
