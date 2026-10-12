// Detection evaluation harness (pure). Runs the real pipeline + engine over landmark recordings, optionally
// degraded the way real cameras and slow computers degrade them, and reports alerts, latency and false alerts.
// It measures behaviour on SYNTHETIC fixtures: it says nothing about real-world or clinical accuracy.
import { configFor, type DetectorConfig } from './detectorConfig';
import { mulberry32 } from './arms';
import { runReplay, type LandmarkRecording } from './replay';
import type { FrameInput, Sensitivity } from './types';

/** positive: should remind · negative: should stay quiet · limitation: ordinary touching the detector cannot
 *  tell from a reach (known false positive) · loop: repeated drifting back, used to check the quiet time. */
export type Category = 'positive' | 'negative' | 'limitation' | 'loop';
export interface EvalRecording extends LandmarkRecording {
  meta: LandmarkRecording['meta'] & { category?: Category; onsetMs?: number };
}

export interface Degradation {
  label: string;
  /** Simulated processing rate (frames are subsampled to this rate). */
  fps?: number;
  /** Gaussian landmark noise, in normalised image units (0.004 ≈ 2.6 px on a 640 px frame). */
  noise?: number;
  /** Probability that the hand detector misses the hand in a frame. */
  handDropout?: number;
  seed?: number;
}

export const CONDITIONS: Degradation[] = [
  { label: '15 fps' },
  { label: '8 fps', fps: 8 },
  { label: '5 fps', fps: 5 },
  { label: '3 fps', fps: 3 },
  { label: '15 fps + noise', noise: 0.004 },
  { label: '15 fps + 20% hand misses', handDropout: 0.2 },
  { label: '3 fps + noise + 20% misses', fps: 3, noise: 0.004, handDropout: 0.2 },
];

function gauss(rnd: () => number) {
  const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function degrade(rec: EvalRecording, d: Degradation): EvalRecording {
  const rnd = mulberry32(d.seed ?? 12345);
  const frames: FrameInput[] = [];
  let nextT = -Infinity;
  const gap = d.fps ? 1000 / d.fps : 0;
  for (const f of rec.frames) {
    if (gap) {
      if (f.t < nextT) continue;
      nextT = f.t + gap - 1;
    }
    const n = d.noise ?? 0;
    const jitter = (p: [number, number, number]): [number, number, number] => (n ? [p[0] + gauss(rnd) * n, p[1] + gauss(rnd) * n, p[2]] : p);
    const missed = (d.handDropout ?? 0) > 0 && rnd() < (d.handDropout ?? 0);
    frames.push({
      ...f,
      hands: missed ? [] : f.hands.map((h) => ({ ...h, landmarks: h.landmarks.map((p) => jitter(p as [number, number, number])) })),
      face: f.face && n ? Object.fromEntries(Object.entries(f.face).map(([k, p]) => [k, jitter(p as [number, number, number])])) : f.face,
      // At low rates the face model still runs on (roughly) every 3rd processed frame.
      faceRan: gap ? frames.length % 3 === 0 : f.faceRan,
    });
  }
  // Keep a face on frames where the subsampled face model would have run.
  if (gap) {
    let lastFace = null as FrameInput['face'];
    for (const f of frames) {
      if (f.face) lastFace = f.face;
      if (f.faceRan && !f.face) f.face = lastFace;
      if (!f.faceRan) f.face = null;
    }
  }
  return { ...rec, frames };
}

export interface EvalResult {
  name: string;
  category: Category | 'unlabelled';
  condition: string;
  expected: number;
  alerts: number;
  /** ms from the hand arriving at the hair to the first reminder (positives only). */
  latencyMs: number | null;
}

export function evaluate(rec: EvalRecording, d: Degradation, sensitivity: Sensitivity = 'balanced', cfgOverrides: Partial<DetectorConfig> = {}): EvalResult {
  const cfg = configFor(sensitivity, 0, cfgOverrides);
  const r = runReplay(degrade(rec, d), { cfg });
  const first = r.detectorEvents.find((e) => e.type === 'alertThresholdReached');
  return {
    name: rec.meta.name ?? 'recording',
    category: rec.meta.category ?? 'unlabelled',
    condition: d.label,
    expected: rec.meta.expect?.alerts ?? 0,
    alerts: r.alerts,
    latencyMs: first && rec.meta.onsetMs != null ? first.t - rec.meta.onsetMs : null,
  };
}

export interface Summary {
  condition: string;
  /** Reaches (expected reminders in positive fixtures) that got a reminder, out of all reaches. */
  positivesCaught: number;
  positives: number;
  falseAlerts: number;
  medianLatencyMs: number | null;
  maxLatencyMs: number | null;
}

export function summarise(results: EvalResult[]): Summary[] {
  const byCond = new Map<string, EvalResult[]>();
  for (const r of results) byCond.set(r.condition, [...(byCond.get(r.condition) ?? []), r]);
  return [...byCond.entries()].map(([condition, rs]) => {
    const pos = rs.filter((r) => r.category === 'positive');
    const lat = pos.map((r) => r.latencyMs).filter((x): x is number => x != null).sort((a, b) => a - b);
    return {
      condition,
      positivesCaught: pos.reduce((n, r) => n + Math.min(r.alerts, r.expected), 0),
      positives: pos.reduce((n, r) => n + r.expected, 0),
      falseAlerts: rs.filter((r) => r.category === 'negative').reduce((s, r) => s + Math.max(0, r.alerts - r.expected), 0),
      medianLatencyMs: lat.length ? lat[Math.floor(lat.length / 2)] : null,
      maxLatencyMs: lat.length ? lat[lat.length - 1] : null,
    };
  });
}
