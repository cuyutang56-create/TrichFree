// Independent challenge scenes for the release audit. Deliberately NOT built from scripts/make-fixtures.mjs: faces
// and hands come from general anthropometric proportions (face width ≈ 14 cm, hand ≈ 9–10 cm wrist to knuckles,
// hairline ≈ 0.6 face widths above the nose bridge), with head roll, distance, image size and handedness varied.
// Expectations are what a user would want, not what the code happens to do.
import type { FaceLandmarks, FrameInput, HandObs, Vec3 } from '../../src/core/types';

export interface Pose { cx: number; cy: number; faceWpx: number; rollDeg: number; width: number; height: number }

/** Face landmark positions in face units: u to image-right, v up, origin at the nose bridge, 1 = face width. */
const FACE_UV: Record<number, [number, number]> = {
  168: [0, 0], 10: [0, 0.62], 152: [0, -0.95], 234: [-0.5, -0.05], 454: [0.5, -0.05], 1: [0, -0.3], 13: [0, -0.52],
  70: [-0.38, 0.14], 63: [-0.31, 0.18], 105: [-0.24, 0.2], 66: [-0.16, 0.19], 107: [-0.09, 0.16],
  336: [0.09, 0.16], 296: [0.16, 0.19], 334: [0.24, 0.2], 293: [0.31, 0.18], 300: [0.38, 0.14],
  159: [-0.22, 0.06], 33: [-0.36, 0.02], 133: [-0.1, 0.02], 386: [0.22, 0.06], 263: [0.36, 0.02], 362: [0.1, 0.02],
};

export function uvToNorm(p: Pose, u: number, v: number): [number, number] {
  const a = (p.rollDeg * Math.PI) / 180;
  // up = (sin a, -cos a) in image pixels (y down); right = (cos a, sin a)
  const x = p.cx + (u * Math.cos(a) + v * Math.sin(a)) * p.faceWpx;
  const y = p.cy + (u * Math.sin(a) - v * Math.cos(a)) * p.faceWpx;
  return [x / p.width, y / p.height];
}

export function face(p: Pose, jitter = 0, rnd: () => number = Math.random): FaceLandmarks {
  const out: FaceLandmarks = {};
  for (const [i, [u, v]] of Object.entries(FACE_UV)) {
    const [x, y] = uvToNorm(p, u + (rnd() - 0.5) * jitter, v + (rnd() - 0.5) * jitter);
    out[Number(i)] = [x, y, 0];
  }
  return out;
}

export interface HandSpec {
  /** Where the index fingertip is, in face units. */
  tip: [number, number];
  /** Direction from wrist to fingertips in face units, degrees (90 = straight up the face). */
  dirDeg: number;
  /** Wrist → middle knuckle length in face widths (≈ 0.65 at head depth; larger when nearer the camera). */
  size?: number;
  pinch?: boolean;
  handedness?: 'Left' | 'Right';
  hair?: number;
}

/** A 21-point hand (MediaPipe topology) in a local frame: x along the hand, y across (thumb side negative). */
const HAND_LOCAL: [number, number][] = [
  [0, 0], // wrist
  [0.22, -0.3], [0.42, -0.5], [0.62, -0.6], [0.8, -0.66], // thumb
  [0.95, -0.24], [1.3, -0.29], [1.5, -0.31], [1.67, -0.33], // index
  [1, 0], [1.4, 0], [1.62, 0], [1.8, 0], // middle
  [0.95, 0.22], [1.32, 0.24], [1.52, 0.25], [1.67, 0.26], // ring
  [0.84, 0.41], [1.1, 0.46], [1.26, 0.49], [1.4, 0.51], // pinky
];

export function hand(p: Pose, h: HandSpec, jitter = 0, rnd: () => number = Math.random): HandObs {
  const size = h.size ?? 0.65;
  const local = HAND_LOCAL.map(([x, y]) => [x, y] as [number, number]);
  if (h.pinch) {
    // Index curls down and the thumb comes across: tips meet.
    local[8] = [1.28, -0.5]; local[7] = [1.38, -0.42]; local[4] = [1.24, -0.53]; local[3] = [0.98, -0.6];
  }
  const mirror = (h.handedness ?? 'Right') === 'Left' ? -1 : 1;
  const a = (h.dirDeg * Math.PI) / 180;
  const along: [number, number] = [Math.cos(a), Math.sin(a)];
  const across: [number, number] = [Math.sin(a) * mirror, -Math.cos(a) * mirror];
  const toUV = ([x, y]: [number, number]): [number, number] => [x * size * along[0] + y * size * across[0], x * size * along[1] + y * size * across[1]];
  const tipNow = toUV(local[8]);
  const wrist: [number, number] = [h.tip[0] - tipNow[0], h.tip[1] - tipNow[1]];
  const landmarks: Vec3[] = local.map((pt) => {
    const [du, dv] = toUV(pt);
    const [x, y] = uvToNorm(p, wrist[0] + du + (rnd() - 0.5) * jitter, wrist[1] + dv + (rnd() - 0.5) * jitter);
    return [x, y, 0];
  });
  return { handedness: h.handedness ?? 'Right', landmarks, ...(h.hair != null ? { hairContact: h.hair } : {}) };
}

/** Deterministic random numbers (seeded), so every run of the challenge is identical. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export interface Scene {
  name: string;
  /** 'pull' = a reminder is wanted; 'everyday' = should stay quiet; 'touch' = ordinary hair touching (ambiguous). */
  kind: 'pull' | 'everyday' | 'touch';
  seconds: number;
  pose: Pose;
  zones: import('../../src/core/types').ZoneId[];
  hands: (s: number) => HandSpec[];
  /** Seconds at which the hand first reaches the hair (pulls only), for latency. */
  onset?: number;
}

/** Renders a scene at `fps` with optional timing jitter and landmark jitter. Face model runs every 3rd frame. */
export function render(sc: Scene, opts: { fps?: number; timingJitterMs?: number; landmarkJitter?: number; seed?: number } = {}): FrameInput[] {
  const fps = opts.fps ?? 15;
  const rnd = rng(opts.seed ?? 7);
  const frames: FrameInput[] = [];
  let t = 0;
  for (let k = 0; t <= sc.seconds * 1000; k++) {
    const faceRan = k % 3 === 0;
    frames.push({
      t: Math.round(t), width: sc.pose.width, height: sc.pose.height, faceRan,
      face: faceRan ? face(sc.pose, opts.landmarkJitter ?? 0, rnd) : null,
      hands: sc.hands(t / 1000).map((h) => hand(sc.pose, h, opts.landmarkJitter ?? 0, rnd)),
    });
    t += 1000 / fps + (opts.timingJitterMs ? (rnd() - 0.5) * 2 * opts.timingJitterMs : 0);
  }
  return frames;
}
