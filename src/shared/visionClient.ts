// Runs the vision worker on a camera track. Works in any extension page or plain web page (no chrome.* calls).
import type { DetectorConfig } from '../core/detectorConfig';
import type { PersonalModel } from '../core/classifier';
import type { Calibration, ZoneId } from '../core/types';
import type { WorkerIn, WorkerOut } from '../workers/protocol';

export interface VisionClientOptions {
  cfg: DetectorConfig;
  calib: Calibration | null;
  zones: ZoneId[];
  emitFrames: boolean;
  onMessage: (m: WorkerOut) => void;
}

declare class MediaStreamTrackProcessor<T = VideoFrame> {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<T>;
}

/** Chrome/Edge stream camera frames straight into the worker; other browsers use the ImageBitmap fallback. */
export const hasTrackProcessor = () => typeof (globalThis as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor === 'function';

export class VisionClient {
  private worker: Worker;
  private fallback: { video: HTMLVideoElement; stop: () => void } | null = null;
  private waiting: (() => void) | null = null;

  constructor(private opts: VisionClientOptions) {
    this.worker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'done') { const w = this.waiting; this.waiting = null; w?.(); return; }
      opts.onMessage(e.data);
    };
    this.worker.onerror = (e) => opts.onMessage({ type: 'error', message: e.message || 'Vision worker crashed' });
    const base = new URL('/mediapipe/', location.origin).href;
    this.post({
      type: 'init',
      wasmBase: `${base}wasm`,
      handModel: `${base}models/hand_landmarker.task`,
      faceModel: `${base}models/face_landmarker.task`,
      hairModel: `${base}models/hair_segmenter.tflite`,
      cfg: opts.cfg, calib: opts.calib, zones: opts.zones, emitFrames: opts.emitFrames,
    });
  }

  /** Feed a camera track to the worker. Frame arrival drives detection. */
  attach(track: MediaStreamTrack) {
    if (hasTrackProcessor()) {
      const proc = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 });
      this.worker.postMessage({ type: 'stream', readable: proc.readable } satisfies WorkerIn, [proc.readable as unknown as Transferable]);
      return;
    }
    void this.attachFallback(track);
  }

  /** Grab frames from a hidden <video> as ImageBitmaps, at most targetFps, never more than one in flight. */
  private async attachFallback(track: MediaStreamTrack) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    await video.play().catch(() => {});
    let stopped = false;
    const minGap = 1000 / this.opts.cfg.targetFps;
    let last = 0;
    const tick = async () => {
      if (stopped) return;
      const now = performance.now();
      if (video.readyState >= 2 && video.videoWidth && now - last >= minGap) {
        last = now;
        try {
          const bitmap = await createImageBitmap(video);
          if (stopped) { bitmap.close(); return; }
          const done = new Promise<void>((r) => { this.waiting = r; });
          this.worker.postMessage({ type: 'bitmap', bitmap } satisfies WorkerIn, [bitmap]);
          await done;
        } catch { /* frame not ready: try again */ }
      }
      if (!stopped) setTimeout(tick, 5);
    };
    track.addEventListener('ended', () => this.opts.onMessage({ type: 'streamEnded' }));
    this.fallback = { video, stop: () => { stopped = true; video.srcObject = null; } };
    void tick();
  }

  post(m: WorkerIn) { this.worker.postMessage(m); }
  update(p: { cfg?: DetectorConfig; calib?: Calibration | null; zones?: ZoneId[]; emitFrames?: boolean; model?: PersonalModel | null }) { this.post({ type: 'update', ...p }); }
  terminate() {
    this.fallback?.stop();
    this.waiting?.();
    this.post({ type: 'stop' });
    setTimeout(() => this.worker.terminate(), 200);
  }
}

export async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
    audio: false,
  });
}
