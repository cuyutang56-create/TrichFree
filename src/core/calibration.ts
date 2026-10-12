import type { DetectorConfig } from './detectorConfig';
import { distToZone, inZone } from './zones';
import type { Calibration, FaceGeom, UV, ZoneAdjust, ZoneId } from './types';
import { FACE_INDICES_VERSION } from './faceIndices';

/** One calibration frame's measurements (face units), collected while a pose prompt is on screen. */
export interface CalibFrame {
  label: 0 | 1;
  pose: string; // e.g. "crown", "crown-pinch", "chin-rest"
  zone?: ZoneId; // for positives
  pinchPose?: boolean;
  tipsUV: UV[];
  r: number;
  pinch: number;
  geom: Pick<FaceGeom, 'v10' | 'vBrow' | 'eyes'>;
}

export const percentile = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, (p / 100) * (s.length - 1)));
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
};
const median = (xs: number[]) => percentile(xs, 50);

/** Derive per-user thresholds (Section 7.4). */
export function deriveCalibration(frames: CalibFrame[], zones: ZoneId[], cfg: DetectorConfig, id: string, now: number): Calibration {
  const pos = frames.filter((f) => f.label === 1);
  const neg = frames.filter((f) => f.label === 0);
  const rs = pos.map((f) => f.r).filter((r) => r > 0);
  let rMin = rs.length >= 5 ? percentile(rs, 10) : cfg.rMinDefault;
  let rMax = rs.length >= 5 ? percentile(rs, 90) : cfg.rMaxDefault;
  if (rMax < rMin) [rMin, rMax] = [rMax, rMin];

  const pinchPos = pos.filter((f) => f.pinchPose).map((f) => f.pinch);
  const openPos = pos.filter((f) => !f.pinchPose).map((f) => f.pinch);
  const pinchThresh = pinchPos.length && openPos.length
    ? Math.min(0.5, Math.max(0.2, (median(pinchPos) + median(openPos)) / 2))
    : cfg.pinchThreshDefault;

  // Zone adjustment: expand toward missed points, up to 0.15 face units per direction.
  const zoneAdjust: Partial<Record<ZoneId, ZoneAdjust>> = {};
  for (const z of zones) {
    if (z === 'strands') continue; // no position bounds to widen
    const zf = pos.filter((f) => f.zone === z);
    if (!zf.length) continue;
    const bestTip = (f: CalibFrame) => f.tipsUV.reduce((b, uv) => {
      const d = distToZone(z, uv, f.geom);
      return d.d < b.d ? d : b;
    }, { d: Infinity, du: 0, dv: 0 });
    const misses = zf.map(bestTip).filter((d) => d.d > 0);
    if (misses.length / zf.length <= 0.2) continue;
    const cap = (xs: number[]) => Math.min(0.15, xs.length ? percentile(xs, 80) : 0);
    zoneAdjust[z] = {
      du: cap(misses.map((m) => Math.abs(m.du))),
      dvUp: cap(misses.filter((m) => m.dv > 0).map((m) => m.dv)),
      dvDown: cap(misses.filter((m) => m.dv < 0).map((m) => -m.dv)),
    };
  }

  // Risky negatives: > 20% of a pose's frames inside an enabled zone at face depth.
  const tol = cfg.depthTolerance;
  const riskyNegatives: string[] = [];
  const byPose = new Map<string, CalibFrame[]>();
  for (const f of neg) byPose.set(f.pose, [...(byPose.get(f.pose) ?? []), f]);
  for (const [pose, fs] of byPose) {
    const hits = fs.filter((f) =>
      f.r >= rMin * (1 - tol) && f.r <= rMax * (1 + tol) &&
      f.tipsUV.some((uv) => zones.some((z) => inZone(z, uv, f.geom, { zoneAdjust }))),
    ).length;
    if (fs.length && hits / fs.length > 0.2) riskyNegatives.push(pose);
  }

  return {
    id, createdAt: now, zones, rMin, rMax, pinchThresh, zoneAdjust,
    extraDwellMs: Math.min(900, 300 * riskyNegatives.length), riskyNegatives, faceIndicesVersion: FACE_INDICES_VERSION,
  };
}

/** Validation pass rule (Section 7.5). */
export function validationPassed(pos: number, neg: number): boolean {
  return pos >= 4 && neg <= 1;
}
