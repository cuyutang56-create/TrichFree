import { computeFaceGeom } from './faceFrame';
import { blend, modelInput, predict, type PersonalModel } from './classifier';
import { emptyFeatures, extractHandFeatures, featureVector, MotionTracker, thresholdsFrom } from './features';
import type { DetectorConfig } from './detectorConfig';
import { scoreFrame } from './scorer';
import { initialTemporal, temporalStep, type TemporalState } from './temporal';
import type { Calibration, DetectorEvent, FaceGeom, FrameFeatures, FrameInput, UV, ZoneId } from './types';

export interface PipelineOutput {
  features: FrameFeatures;
  p: number;
  pSmooth: number;
  phase: TemporalState['phase'];
  geom: FaceGeom | null;
  faceSeen: boolean;
  tipsUV: UV[] | null; // thumb/index/middle tips of the chosen hand, in face units
  pModel: number | null; // personal model output (null when inactive)
  events: DetectorEvent[];
}

/**
 * The whole per-frame detector: face frame (with hold) → features → scorer → temporal filter.
 * Used by the vision worker, the calibration screen and the headless replay harness.
 */
export class DetectorPipeline {
  private lastGeom: FaceGeom | null = null;
  private lastFaceT = -Infinity;
  private lastRunFound = false;
  private temporal: TemporalState = initialTemporal();
  private motion = new MotionTracker();
  private model: PersonalModel | null = null;

  constructor(public cfg: DetectorConfig, public calib: Calibration | null, public zones: ZoneId[]) {}

  setConfig(cfg: DetectorConfig) { this.cfg = cfg; }
  setCalibration(calib: Calibration | null, zones?: ZoneId[]) { this.calib = calib; if (zones) this.zones = zones; }
  /** Use the personal model only when it passed its gate; otherwise the rule score stands alone. */
  setModel(m: PersonalModel | null) { this.model = m && m.active ? m : null; }
  reset() { this.temporal = initialTemporal(); this.motion.reset(); this.lastGeom = null; this.lastFaceT = -Infinity; }
  get state() { return this.temporal; }

  process(frame: FrameInput): PipelineOutput {
    const { t, width, height } = frame;
    let geom: FaceGeom | null = null;
    let faceSeen = false;
    if (frame.face) {
      geom = computeFaceGeom(frame.face, width, height);
      if (geom) { this.lastGeom = geom; this.lastFaceT = t; faceSeen = true; }
    }
    if (frame.faceRan !== false) this.lastRunFound = faceSeen;
    // Reuse the last face for ≤ faceHoldMs (a hand over the face often breaks face detection),
    // and on frames where the face model was skipped (every-Nth-frame).
    if (!geom && this.lastGeom && t - this.lastFaceT <= this.cfg.faceHoldMs) geom = this.lastGeom;
    const held = !faceSeen && !!geom && !this.lastRunFound;
    const faceMissing = !geom;

    const th = thresholdsFrom(this.calib, this.cfg);
    let best: FrameFeatures & { indexUV?: UV; tipsUV?: UV[] } = emptyFeatures(t, faceMissing, held);
    let bestP = 0;
    if (geom) {
      for (const hand of frame.hands) {
        const f = extractHandFeatures(t, hand, width, height, geom, held, this.zones, th, this.cfg);
        const p = scoreFrame(f, this.cfg);
        if (!best.hasHand || p > bestP || (p === bestP && f.zone && !best.zone)) { best = f; bestP = p; }
      }
    }
    const m = this.motion.push(t, best.hasHand ? best.indexUV ?? null : null);
    best.tipSpeed = m.speed;
    best.tipJitter = m.jitter;
    let pModel: number | null = null;
    if (this.model && best.hasHand && best.zone) {
      pModel = predict(this.model, modelInput(featureVector(best, this.temporal.pSmooth)));
      bestP = blend(bestP, pModel);
    }

    const { state, events } = temporalStep(
      this.temporal,
      { t, p: bestP, faceMissing, isPinch: best.isPinch, zone: best.zone, r: best.r },
      this.cfg,
    );
    this.temporal = state;
    return { features: stripExtras(best), p: bestP, pSmooth: state.pSmooth, phase: state.phase, geom, faceSeen, tipsUV: best.tipsUV ?? null, pModel, events };
  }
}

function stripExtras(f: FrameFeatures): FrameFeatures {
  const { tipsUV: _a, indexUV: _b, ...rest } = f as FrameFeatures & { tipsUV?: unknown; indexUV?: unknown };
  return rest;
}
