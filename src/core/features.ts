import { dist, landmarkPx, toUV } from './faceFrame';
import { HI, TIP_INDICES } from './faceIndices';
import type { DetectorConfig } from './detectorConfig';
import type { Calibration, FaceGeom, FrameFeatures, HandObs, UV, ZoneId } from './types';
import { zoneOf } from './zones';
import { HAIR_TOUCH } from './hair';

export interface ThresholdSource {
  rMin: number;
  rMax: number;
  pinchThresh: number;
  zoneAdjust?: Calibration['zoneAdjust'];
}

export function thresholdsFrom(calib: Calibration | null | undefined, cfg: DetectorConfig): ThresholdSource {
  return calib
    ? { rMin: calib.rMin, rMax: calib.rMax, pinchThresh: calib.pinchThresh, zoneAdjust: calib.zoneAdjust }
    : { rMin: cfg.rMinDefault, rMax: cfg.rMaxDefault, pinchThresh: cfg.pinchThreshDefault, zoneAdjust: {} };
}

/** Raw per-hand geometry that does not need a face: scale and pinch. Invariant to image scale. */
export function handShape(hand: HandObs, width: number, height: number) {
  const P = (i: number) => landmarkPx(hand.landmarks[i], width, height);
  const handScale = dist(P(HI.wrist), P(HI.middleMcp));
  const pinch = handScale > 0 ? dist(P(HI.thumbTip), P(HI.indexTip)) / handScale : 99;
  return { handScale, pinch, P };
}

/**
 * Per-hand features for one frame (Section 4.5). `geom` is the face frame (possibly held from an earlier frame).
 * Motion features (speed/jitter) are filled in by the pipeline's MotionTracker.
 */
export function extractHandFeatures(
  t: number,
  hand: HandObs,
  width: number,
  height: number,
  geom: FaceGeom,
  faceHeld: boolean,
  enabled: ZoneId[],
  th: ThresholdSource,
  cfg: DetectorConfig,
): FrameFeatures & { tipsUV: UV[]; indexUV: UV } {
  const { handScale, pinch, P } = handShape(hand, width, height);
  const r = handScale / geom.faceW;
  const tipsUV = TIP_INDICES.map((i) => toUV(P(i), geom));
  let zone: ZoneId | null = null;
  let tipUV: UV | null = null;
  for (const uv of tipsUV) {
    const z = zoneOf(uv, enabled, geom, th);
    if (z && (!zone || PRIORITY_RANK[z] < PRIORITY_RANK[zone])) { zone = z; tipUV = uv; }
  }
  const hairC = hand.hairContact ?? 0;
  // Strands: fingers in hair but not in any scalp zone (e.g. holding a lock beside the face or at the shoulder).
  if (!zone && enabled.includes('strands') && hairC >= HAIR_TOUCH) { zone = 'strands'; tipUV = tipsUV[1]; }
  const tol = cfg.depthTolerance;
  const depthConsistent = r >= th.rMin * (1 - tol) && r <= th.rMax * (1 + tol);
  const isPinch = pinch < th.pinchThresh;

  const w = toUV(P(HI.wrist), geom);
  const m = toUV(P(HI.middleMcp), geom);
  const ov = m.v - w.v, ou = m.u - w.u;
  const olen = Math.hypot(ou, ov) || 1;
  const orientationV = ov / olen;
  // Fingers broadly up, or sideways into the head. Pointing clearly downward is not OK.
  const orientationOK = orientationV > -0.3;

  // Occlusion veto: hand box covers nose/mouth and fingertips are below the brow → drinking/eating.
  const xs = hand.landmarks.map((p) => p[0] * width), ys = hand.landmarks.map((p) => p[1] * height);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const covers = (q: { x: number; y: number }) => q.x >= box.x0 && q.x <= box.x1 && q.y >= box.y0 && q.y <= box.y1;
  const tipsBelowBrow = tipsUV.every((uv) => uv.v < geom.vBrow);
  const occlusionVeto =
    (covers(geom.noseTipPx) || covers(geom.mouthPx)) && tipsBelowBrow && zone !== 'lashes' && zone !== 'brows'
    && !(zone === 'strands' && isPinch); // a pinched strand held across the face is still pulling

  return {
    t, faceMissing: false, faceHeld, hasHand: true, zone, tipUV, handedness: hand.handedness,
    r, pinch, isPinch, depthConsistent, orientationV, orientationOK, occlusionVeto,
    tipSpeed: 0, tipJitter: 0, hairContact: hairC, tipsUV, indexUV: tipsUV[1],
  };
}

const PRIORITY_RANK: Record<ZoneId, number> = { lashes: 0, brows: 1, hairline: 2, sides: 3, crown: 4, beard: 5, strands: 6 };

export function emptyFeatures(t: number, faceMissing: boolean, faceHeld = false): FrameFeatures {
  return {
    t, faceMissing, faceHeld, hasHand: false, zone: null, tipUV: null, handedness: null, r: 0, pinch: 0,
    isPinch: false, depthConsistent: false, orientationV: 0, orientationOK: false, occlusionVeto: false,
    tipSpeed: 0, tipJitter: 0, hairContact: 0,
  };
}

/** Tracks the index-tip position over a 1 s window for speed and jitter (micro-motion, Section 4.5 #6). */
export class MotionTracker {
  private hist: { t: number; u: number; v: number }[] = [];
  constructor(private windowMs = 1000) {}
  push(t: number, uv: UV | null): { speed: number; jitter: number } {
    if (!uv) { this.hist = []; return { speed: 0, jitter: 0 }; }
    const prev = this.hist[this.hist.length - 1];
    this.hist.push({ t, u: uv.u, v: uv.v });
    while (this.hist.length && t - this.hist[0].t > this.windowMs) this.hist.shift();
    const speed = prev && t > prev.t ? (Math.hypot(uv.u - prev.u, uv.v - prev.v) * 1000) / (t - prev.t) : 0;
    const n = this.hist.length;
    const mu = this.hist.reduce((s, p) => s + p.u, 0) / n, mv = this.hist.reduce((s, p) => s + p.v, 0) / n;
    const jitter = Math.sqrt(this.hist.reduce((s, p) => s + (p.u - mu) ** 2 + (p.v - mv) ** 2, 0) / n);
    return { speed, jitter };
  }
  reset() { this.hist = []; }
}

const ZONE_ORDER: ZoneId[] = ['crown', 'hairline', 'sides', 'brows', 'lashes', 'beard', 'strands'];
/** Feature vector for featureSamples / the personal classifier (Section 4.8). Index 8 is the zone (-1 = none). */
export function featureVector(f: FrameFeatures, pSmooth: number): number[] {
  return [
    f.tipUV?.u ?? 0, f.tipUV?.v ?? 0, f.r, f.pinch, f.orientationV, f.tipSpeed, f.tipJitter,
    f.faceMissing ? 1 : 0, f.zone ? ZONE_ORDER.indexOf(f.zone) : -1, f.handedness === 'Left' ? 1 : 0, pSmooth,
    f.depthConsistent ? 1 : 0, f.isPinch ? 1 : 0, f.occlusionVeto ? 1 : 0, f.hairContact,
  ];
}
