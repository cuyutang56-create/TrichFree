// The release-audit challenge scenes (see scene.ts). Positions in face units: u to image-right, v up from the nose
// bridge, 1 = face width. Hairline ≈ v 0.62–0.75; top of the head ≈ v 1.0–1.15; temples ≈ |u| 0.6, v 0.3–0.5;
// brows ≈ v 0.17; ears ≈ |u| 0.6, v −0.1–0.1; chin ≈ v −0.95; desk ≈ v −2.6.
import type { HandSpec, Pose, Scene } from './scene';

const A: Pose = { cx: 320, cy: 230, faceWpx: 150, rollDeg: 0, width: 640, height: 480 }; // typical laptop webcam
const B: Pose = { cx: 700, cy: 330, faceWpx: 200, rollDeg: 12, width: 1280, height: 720 }; // 16:9, head tilted
const C: Pose = { cx: 280, cy: 220, faceWpx: 100, rollDeg: -8, width: 640, height: 480 }; // sitting further back
const DEFAULT_ZONES: Scene['zones'] = ['crown', 'hairline', 'strands'];
const during = (s: number, a: number, b: number, h: HandSpec | HandSpec[]): HandSpec[] => (s >= a && s < b ? ([] as HandSpec[]).concat(h) : []);
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
const desk = (u: number): HandSpec => ({ tip: [u, -2.6], dirDeg: 90, size: 0.7, hair: 0 });

export const PULLS: Scene[] = [
  { name: 'crown pinch, left hand, head tilted, 16:9', kind: 'pull', seconds: 7, pose: B, zones: DEFAULT_ZONES, onset: 1.6,
    hands: (s) => during(s, 1, 5, { tip: [0.1, lerp(-1.5, 1.0, (s - 1) / 0.6)], dirDeg: 100, pinch: s >= 1.6, handedness: 'Left', hair: s >= 1.6 ? 0.7 : 0 }) },
  { name: 'hairline twirl, sitting further back', kind: 'pull', seconds: 7, pose: C, zones: DEFAULT_ZONES, onset: 1,
    hands: (s) => during(s, 1, 5, { tip: [-0.15 + 0.03 * Math.cos(s * 6), 0.68 + 0.03 * Math.sin(s * 6)], dirDeg: 80, pinch: true, hair: 0.6 }) },
  { name: 'eyebrow pull (brows zone on)', kind: 'pull', seconds: 6, pose: A, zones: ['crown', 'hairline', 'brows'], onset: 1,
    hands: (s) => during(s, 1, 4, { tip: [0.25, 0.19], dirDeg: 120, pinch: true, hair: 0.1 }) },
  { name: 'temple twirl (sides zone on), 16:9 tilted', kind: 'pull', seconds: 7, pose: B, zones: ['crown', 'hairline', 'sides'], onset: 1,
    hands: (s) => during(s, 1, 5, { tip: [0.62 + 0.02 * Math.cos(s * 7), 0.35], dirDeg: 95, pinch: true, hair: 0.7 }) },
  { name: 'two hands: one typing, one pulling at the crown', kind: 'pull', seconds: 7, pose: A, zones: DEFAULT_ZONES, onset: 1,
    hands: (s) => [desk(-0.6), ...during(s, 1, 5, { tip: [-0.05, 1.05], dirDeg: 85, pinch: true, hair: 0.7 })] },
  { name: 'slow approach, then pinching at the hairline', kind: 'pull', seconds: 8, pose: A, zones: DEFAULT_ZONES, onset: 3,
    hands: (s) => during(s, 1, 6, { tip: [0.1, lerp(-2.4, 0.7, (s - 1) / 2)], dirDeg: 90, pinch: s >= 3, hair: s >= 3 ? 0.6 : 0 }) },
  { name: 'strand held beside the face (long hair)', kind: 'pull', seconds: 7, pose: A, zones: DEFAULT_ZONES, onset: 1,
    hands: (s) => during(s, 1, 5, { tip: [-0.82, -0.55], dirDeg: 70, pinch: true, hair: 0.7 }) },
];

/** Continuous pulling for a full minute: one reminder plus at most the single follow-up, never a stream. */
export const PROLONGED: Scene = { name: 'one continuous pull for 60 s', kind: 'pull', seconds: 64, pose: A, zones: DEFAULT_ZONES, onset: 1,
  hands: (s) => during(s, 1, 61, { tip: [0.05 + 0.01 * Math.sin(s * 3), 1.0], dirDeg: 90, pinch: true, hair: 0.7 }) };

export const EVERYDAY: Scene[] = [
  { name: 'typing (hands at the desk)', kind: 'everyday', seconds: 10, pose: A, zones: DEFAULT_ZONES, hands: () => [desk(-0.6), desk(0.6)] },
  { name: 'chin on hand', kind: 'everyday', seconds: 9, pose: A, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 8, { tip: [0.3, -0.5], dirDeg: 80, hair: 0 }) },
  { name: 'drinking from a cup (hand near the camera)', kind: 'everyday', seconds: 6, pose: A, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 4, { tip: [0.05, -0.45], dirDeg: 95, size: 1.1, hair: 0 }) },
  { name: 'adjusting glasses twice', kind: 'everyday', seconds: 7, pose: A, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 1.6, { tip: [0, 0.03], dirDeg: 90, hair: 0 }).concat(during(s, 4, 4.6, { tip: [0.02, 0.03], dirDeg: 90, hair: 0 })) },
  { name: 'scratching the nose', kind: 'everyday', seconds: 5, pose: A, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 2.2, { tip: [0.02 + 0.02 * Math.sin(s * 25), -0.25], dirDeg: 100, hair: 0 }) },
  { name: 'phone call (hand at the ear, 10 s)', kind: 'everyday', seconds: 12, pose: B, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 11, { tip: [0.6, -0.05], dirDeg: 95, size: 0.7, hair: 0.2 }) },
  { name: 'stretching, arms briefly above the head', kind: 'everyday', seconds: 5, pose: A, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 1.8, [{ tip: [-0.3, 1.7], dirDeg: 90, hair: 0 }, { tip: [0.3, 1.7], dirDeg: 90, hair: 0, handedness: 'Left' }]) },
  { name: 'reaching up while turned away (no face in view)', kind: 'everyday', seconds: 7, pose: A, zones: DEFAULT_ZONES, hands: (s) => during(s, 1, 5, { tip: [0.05, 1.0], dirDeg: 90, pinch: true, hair: 0.7 }) },
];

export const TOUCHES: Scene[] = [
  { name: 'tucking hair behind the ear', kind: 'touch', seconds: 5, pose: A, zones: DEFAULT_ZONES,
    hands: (s) => during(s, 1, 1.7, { tip: [lerp(0.5, 0.7, (s - 1) / 0.7), lerp(0.45, 0.05, (s - 1) / 0.7)], dirDeg: 110, hair: 0.6 }) },
  { name: 'running fingers through the hair', kind: 'touch', seconds: 5, pose: A, zones: DEFAULT_ZONES,
    hands: (s) => during(s, 1, 2.2, { tip: [0.05, lerp(0.62, 1.15, (s - 1) / 1.2)], dirDeg: 90, hair: 0.7 }) },
  { name: 'head resting on a hand at the temple (10 s)', kind: 'touch', seconds: 12, pose: A, zones: DEFAULT_ZONES,
    hands: (s) => during(s, 1, 11, { tip: [0.58, 0.45], dirDeg: 100, hair: 0.6 }) },
  { name: 'gathering hair into a ponytail', kind: 'touch', seconds: 7, pose: A, zones: DEFAULT_ZONES,
    hands: (s) => during(s, 1, 5, [{ tip: [-0.15, 1.12], dirDeg: 70, pinch: true, hair: 0.8 }, { tip: [0.15, 1.12], dirDeg: 110, pinch: true, hair: 0.8, handedness: 'Left' }]) },
  { name: 'scratching the scalp (3 s)', kind: 'touch', seconds: 6, pose: A, zones: DEFAULT_ZONES,
    hands: (s) => during(s, 1, 4, { tip: [0.1 + 0.04 * Math.sin(s * 28), 0.98 + 0.03 * Math.sin(s * 21)], dirDeg: 95, hair: 0.7 }) },
  { name: 'putting on headphones', kind: 'touch', seconds: 5, pose: A, zones: DEFAULT_ZONES,
    hands: (s) => during(s, 1, 2.5, [{ tip: [-0.62, 0.5], dirDeg: 80, hair: 0.5 }, { tip: [0.62, 0.5], dirDeg: 100, hair: 0.5, handedness: 'Left' }]) },
];
