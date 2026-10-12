// Shared types for the platform-agnostic core. No DOM-only APIs, no chrome.*.

/** Normalised landmark [x, y, z] as produced by MediaPipe (x, y in 0..1 of the frame). */
export type Vec3 = [number, number, number];
export interface Vec2 { x: number; y: number }
export interface UV { u: number; v: number }

/** Face landmarks by mesh index. A full 478-element array or a sparse record of the indices we use. */
export type FaceLandmarks = Record<number, Vec3>;

export interface HandObs {
  handedness: 'Left' | 'Right';
  landmarks: Vec3[]; // 21 points
  /** Fraction of hair around the fingertips (0..1), from the hair segmenter; absent if it didn't run. */
  hairContact?: number;
}

/** One processed camera frame: landmarks only, never pixels. This is also the recorder/replay format. */
export interface FrameInput {
  t: number; // ms
  width: number;
  height: number;
  hands: HandObs[];
  face: FaceLandmarks | null; // null when FaceLandmarker was not run or found nothing this frame
  faceRan?: boolean; // false when the face model was skipped this frame (every-Nth-frame)
}

// 'strands' = fingers holding hair anywhere outside the scalp zones (lengths and ends beside the face/shoulders).
export type ZoneId = 'crown' | 'hairline' | 'sides' | 'strands' | 'brows' | 'lashes' | 'beard';
export const ALL_ZONES: ZoneId[] = ['crown', 'hairline', 'sides', 'strands', 'brows', 'lashes', 'beard'];

/** Per-zone widening in face units, learned in calibration. */
export interface ZoneAdjust { du: number; dvUp: number; dvDown: number }

export interface Calibration {
  id: string;
  createdAt: number;
  zones: ZoneId[];
  rMin: number;
  rMax: number;
  pinchThresh: number;
  zoneAdjust: Partial<Record<ZoneId, ZoneAdjust>>;
  extraDwellMs: number;
  riskyNegatives: string[];
  validationPos?: number;
  validationNeg?: number;
  faceIndicesVersion: number;
}

export interface FaceGeom {
  origin: Vec2; // px
  faceW: number; // px
  up: Vec2; // unit, image space
  right: Vec2; // unit, image space
  v10: number;
  vBrow: number;
  eyes: { u: number; v: number }[]; // lash line per eye
  noseTipPx: Vec2;
  mouthPx: Vec2;
  faceBoxPx: { x0: number; y0: number; x1: number; y1: number };
}

export interface FrameFeatures {
  t: number;
  faceMissing: boolean;
  faceHeld: boolean; // using a previous frame's face
  hasHand: boolean;
  zone: ZoneId | null;
  tipUV: UV | null;
  handedness: 'Left' | 'Right' | null;
  r: number;
  pinch: number;
  isPinch: boolean;
  depthConsistent: boolean;
  orientationV: number;
  orientationOK: boolean;
  occlusionVeto: boolean;
  tipSpeed: number; // face units / s
  tipJitter: number; // std of index tip over 1 s, face units
  hairContact: number; // 0..1, hair around the fingertips (0 when unknown)
}

export interface EpisodeStats {
  zone: ZoneId | null;
  pinchFraction: number;
  rMedian: number;
  pSmoothMax: number;
}

export type DetectorEvent =
  | { type: 'candidateStart'; t: number; zone: ZoneId | null }
  | { type: 'alertThresholdReached'; t: number; stats: EpisodeStats }
  | { type: 'handLeft'; t: number; leftAt: number; stats: EpisodeStats };

// VISUAL: the user chose a visual-only reminder (no sound). Like FORCED_CHIME it never uses a pilot block slot.
export type Arm = 'SILENT' | 'CHIME' | 'VOICE' | 'FORCED_CHIME' | 'VISUAL';
export type Outcome = 'brief_touch' | 'interrupted' | 'interrupted_after_2' | 'not_interrupted' | 'false_alarm';
export type ClipCategory = 'notice' | 'need' | 'instead' | 'reason' | 'compassion' | 'custom';
export type OutputMode = 'speakers' | 'earbuds' | 'chime_only' | 'visual' | 'silent_log';
export type Sensitivity = 'relaxed' | 'balanced' | 'sensitive';

export interface ClipMeta {
  id: string;
  category: ClipCategory;
  createdAt: number;
  lastPlayedAt?: number;
  playCount: number;
}

export interface Episode {
  id: string;
  sessionId: string;
  participantCode?: string;
  startedAt: number;
  alertAt?: number;
  endedAt: number;
  zone: ZoneId | null;
  arm: Arm | null; // null when no alert was reached (brief_touch)
  pilotDay?: number;
  clipIds: string[];
  outcome: Outcome;
  secondsToHandDown?: number;
  pinchFraction: number;
  rMedian: number;
  pSmoothMax: number;
  pulledDuring?: boolean;
}
