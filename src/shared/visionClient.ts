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

export class VisionClient {
  private worker: Worker;
  constructor(opts: VisionClientOptions) {
    this.worker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => opts.onMessage(e.data);
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

  /** Transfer a camera track's frame stream to the worker. The frame arrival drives the loop. */
  attach(track: MediaStreamTrack) {
    const proc = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 });
    this.worker.postMessage({ type: 'stream', readable: proc.readable } satisfies WorkerIn, [proc.readable as unknown as Transferable]);
  }

  post(m: WorkerIn) { this.worker.postMessage(m); }
  update(p: { cfg?: DetectorConfig; calib?: Calibration | null; zones?: ZoneId[]; emitFrames?: boolean; model?: PersonalModel | null }) { this.post({ type: 'update', ...p }); }
  terminate() { this.post({ type: 'stop' }); setTimeout(() => this.worker.terminate(), 200); }
}

export async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
    audio: false,
  });
}
