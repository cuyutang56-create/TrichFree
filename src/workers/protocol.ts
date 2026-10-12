import type { DetectorConfig } from '../core/detectorConfig';
import type { PersonalModel } from '../core/classifier';
import type { Calibration, DetectorEvent, ZoneId } from '../core/types';
import type { OverlayFrame } from '../shared/messages';

export type WorkerIn =
  /** delegate: 'auto' (default) picks CPU when WebGL is software-emulated, else GPU; either falls back to the other. */
  | { type: 'init'; wasmBase: string; handModel: string; faceModel: string; hairModel?: string; cfg: DetectorConfig; calib: Calibration | null; zones: ZoneId[]; emitFrames: boolean; delegate?: 'auto' | 'GPU' | 'CPU' }
  | { type: 'stream'; readable: ReadableStream<VideoFrame> }
  /** Fallback for browsers without MediaStreamTrackProcessor: one frame at a time. */
  | { type: 'bitmap'; bitmap: ImageBitmap }
  | { type: 'update'; cfg?: DetectorConfig; calib?: Calibration | null; zones?: ZoneId[]; emitFrames?: boolean; model?: PersonalModel | null }
  | { type: 'stop' };

export interface WorkerStats { fps: number; delegate: 'GPU' | 'CPU'; faceSeenRatio: number; inferMs: number; frames: number; hairRuns: number; hair: boolean }

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU'; loadMs: number }
  | { type: 'events'; events: DetectorEvent[] }
  | { type: 'stats'; stats: WorkerStats }
  | { type: 'frame'; data: OverlayFrame }
  | { type: 'streamEnded' }
  /** A 'bitmap' frame was processed; the page may send the next one. */
  | { type: 'done' }
  | { type: 'error'; message: string };
