import { DEFAULT_CONFIG, type DetectorConfig } from './detectorConfig';
import { initialEngine, reduce, type Effect, type EngineContext } from './engine';
import { DetectorPipeline } from './pipeline';
import type { Calibration, DetectorEvent, FrameInput, ZoneId } from './types';

export interface LandmarkRecording {
  meta: { name?: string; width: number; height: number; fps?: number; zones?: ZoneId[]; expect?: { alerts: number } };
  frames: FrameInput[];
}

export interface ReplayResult {
  detectorEvents: DetectorEvent[];
  effects: Effect[];
  alerts: number;
  frames: number;
  maxPSmooth: number;
}

/** Runs the detector + engine headlessly over a landmark recording (Section 4.9). */
export function runReplay(rec: LandmarkRecording, opts: { cfg?: DetectorConfig; calib?: Calibration | null; zones?: ZoneId[] } = {}): ReplayResult {
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const zones = opts.zones ?? rec.meta.zones ?? ['crown', 'hairline', 'brows', 'lashes'];
  const pipe = new DetectorPipeline(cfg, opts.calib ?? null, zones);
  let id = 0;
  const ctx: EngineContext = {
    sessionId: 'replay', decideArm: () => ({ arm: 'VOICE' }), clips: [],
    checkMs: cfg.checkMs, cooldownMs: cfg.cooldownMs, chimeMs: 400, chimeToClipGapMs: cfg.chimeToClipGapMs,
    newId: () => `ep-${++id}`,
  };
  let engine = initialEngine();
  const detectorEvents: DetectorEvent[] = [];
  const effects: Effect[] = [];
  let maxPSmooth = 0;
  const step = (ev: Parameters<typeof reduce>[1], t: number) => {
    const out = reduce(engine, ev, t, ctx);
    engine = out.state;
    effects.push(...out.effects);
  };
  let lastT = 0;
  for (const frame of rec.frames) {
    const out = pipe.process(frame);
    maxPSmooth = Math.max(maxPSmooth, out.pSmooth);
    step({ type: 'tick', t: frame.t }, frame.t);
    for (const ev of out.events) { detectorEvents.push(ev); step(ev, frame.t); }
    lastT = frame.t;
  }
  // Flush: let any open episode close as if the hand had left.
  for (let t = lastT + 100; t <= lastT + 3000; t += 100) {
    const out = pipe.process({ t, width: rec.meta.width, height: rec.meta.height, hands: [], face: null, faceRan: true });
    for (const ev of out.events) { detectorEvents.push(ev); step(ev, t); }
  }
  return {
    detectorEvents, effects, frames: rec.frames.length, maxPSmooth,
    alerts: detectorEvents.filter((e) => e.type === 'alertThresholdReached').length,
  };
}
