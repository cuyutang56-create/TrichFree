import type { DetectorConfig } from '../core/detectorConfig';
import type { PersonalModel } from '../core/classifier';
import type { Calibration, DetectorEvent, ZoneId } from '../core/types';
import type { OverlayFrame } from '../shared/messages';

export type WorkerIn =
  | { type: 'init'; wasmBase: string; handModel: string; faceModel: string; hairModel?: string; cfg: DetectorConfig; calib: Calibration | null; zones: ZoneId[]; emitFrames: boolean }
  | { type: 'stream'; readable: ReadableStream<VideoFrame> }
  | { type: 'update'; cfg?: DetectorConfig; calib?: Calibration | null; zones?: ZoneId[]; emitFrames?: boolean; model?: PersonalModel | null }
  | { type: 'stop' };

export interface WorkerStats { fps: number; delegate: 'GPU' | 'CPU'; faceSeenRatio: number; inferMs: number; frames: number; hairRuns: number; hair: boolean }

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU'; loadMs: number }
  | { type: 'events'; events: DetectorEvent[] }
  | { type: 'stats'; stats: WorkerStats }
  | { type: 'frame'; data: OverlayFrame }
  | { type: 'streamEnded' }
  | { type: 'error'; message: string };
