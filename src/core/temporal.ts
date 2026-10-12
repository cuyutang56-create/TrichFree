import type { DetectorConfig } from './detectorConfig';
import type { DetectorEvent, EpisodeStats, ZoneId } from './types';

export type TemporalPhase = 'idle' | 'candidate' | 'alerted';

export interface TemporalInput {
  t: number;
  p: number;
  faceMissing: boolean; // face lost beyond faceHoldMs
  /** The hand model found no hand at all in this frame (not the same as a hand outside the zones). */
  handMissing?: boolean;
  isPinch: boolean;
  zone: ZoneId | null;
  r: number;
}

export interface TemporalState {
  phase: TemporalPhase;
  pSmooth: number;
  lastT: number | null;
  /** Smoothed time between frames (ms). Slow computers process far fewer frames per second. */
  frameInterval: number | null;
  dwellStart: number | null; // start of the current sustained run (gaps < gapToleranceMs tolerated)
  lastAboveOn: number | null;
  belowOffSince: number | null;
  faceMissingSince: number | null;
  /** Last frame with a hand in an enabled zone (for the short hand hold). */
  lastInZoneAt: number | null;
  cooldownUntil: number;
  // episode stats
  frames: number;
  pinchFrames: number;
  rValues: number[];
  zoneCounts: Partial<Record<ZoneId, number>>;
  pSmoothMax: number;
}

export function initialTemporal(): TemporalState {
  return {
    phase: 'idle', pSmooth: 0, lastT: null, frameInterval: null, dwellStart: null, lastAboveOn: null, belowOffSince: null,
    faceMissingSince: null, lastInZoneAt: null, cooldownUntil: -Infinity, frames: 0, pinchFrames: 0, rValues: [], zoneCounts: {}, pSmoothMax: 0,
  };
}

export function statsOf(s: TemporalState): EpisodeStats {
  const rs = [...s.rValues].sort((a, b) => a - b);
  const zone = (Object.entries(s.zoneCounts) as [ZoneId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    zone,
    pinchFraction: s.frames ? s.pinchFrames / s.frames : 0,
    rMedian: rs.length ? rs[Math.floor(rs.length / 2)] : 0,
    pSmoothMax: s.pSmoothMax,
  };
}

/**
 * Temporal filter (Section 4.6): EMA, dwell timer with gap tolerance, hysteresis, cooldown and the
 * face-missing "hold" policy (keep an ongoing episode alive ≤ faceMissingHoldEpisodeMs, start no new one).
 */
export function temporalStep(prev: TemporalState, inp: TemporalInput, cfg: DetectorConfig): { state: TemporalState; events: DetectorEvent[] } {
  const s: TemporalState = { ...prev, rValues: prev.rValues, zoneCounts: { ...prev.zoneCounts } };
  const events: DetectorEvent[] = [];
  const t = inp.t;

  // Face-missing hold: freeze pSmooth while an episode is ongoing, up to the hold limit.
  s.faceMissingSince = inp.faceMissing ? prev.faceMissingSince ?? t : null;
  const faceHold = inp.faceMissing && s.phase !== 'idle' && t - (s.faceMissingSince ?? t) < cfg.faceMissingHoldEpisodeMs;
  // Hand hold: the hand model misses a hand now and then. A frame with no hand at all, shortly after a hand was
  // in a zone, is "no observation" (nothing changes) rather than evidence that the hand left.
  const handHold = !!inp.handMissing && !inp.faceMissing && s.phase !== 'idle' && prev.lastInZoneAt != null && t - prev.lastInZoneAt <= cfg.handHoldMs;
  const holding = faceHold || handHold;
  if (inp.zone) s.lastInZoneAt = t;
  const interval = prev.lastT != null ? t - prev.lastT : 0;
  // emaAlpha is tuned per frame at targetFps. Scale it by the real time step so the smoothed score reacts in the
  // same wall-clock time on a slow computer; otherwise at 3 fps one missed hand costs two frames (~0.7 s) of dwell.
  const refMs = 1000 / cfg.targetFps;
  const alpha = interval > 0 ? 1 - Math.pow(1 - cfg.emaAlpha, interval / refMs) : cfg.emaAlpha;
  if (!holding) s.pSmooth = alpha * inp.p + (1 - alpha) * prev.pSmooth;
  if (interval > 0) s.frameInterval = prev.frameInterval == null ? interval : 0.7 * prev.frameInterval + 0.3 * interval;
  s.lastT = t;
  // A gap between above-threshold frames longer than this restarts the dwell. It must cover one missed frame
  // (two frame intervals), or a 3 fps computer (333 ms per frame) could rarely complete a dwell. Capped so a
  // camera stall cannot stitch two separate touches together.
  const gapTol = Math.min(cfg.gapToleranceMaxMs, Math.max(cfg.gapToleranceMs, 2.2 * (s.frameInterval ?? 0)));

  const above = s.pSmooth >= cfg.candidateOn;
  if (!holding) {
    if (s.pSmooth < cfg.candidateOff) s.belowOffSince = prev.belowOffSince ?? t;
    else s.belowOffSince = null;
  }

  const resetEpisode = () => {
    s.frames = 0; s.pinchFrames = 0; s.rValues = []; s.zoneCounts = {}; s.pSmoothMax = 0;
    s.dwellStart = null; s.lastAboveOn = null;
  };

  if (s.phase === 'idle') {
    if (above && !inp.faceMissing && t >= s.cooldownUntil) {
      resetEpisode();
      s.phase = 'candidate';
      s.dwellStart = t;
      s.lastAboveOn = t;
      s.belowOffSince = null;
      events.push({ type: 'candidateStart', t, zone: inp.zone });
    } else {
      return { state: s, events };
    }
  }

  // Accumulate episode stats on frames with a hand in zone.
  if (inp.zone && !holding) {
    s.frames++;
    if (inp.isPinch) s.pinchFrames++;
    if (s.rValues.length < 2000) s.rValues = [...s.rValues, inp.r];
    s.zoneCounts[inp.zone] = (s.zoneCounts[inp.zone] ?? 0) + 1;
  }
  s.pSmoothMax = Math.max(s.pSmoothMax, s.pSmooth);

  // Hand left: below candidateOff continuously for handLeftMs (or face gone longer than the hold).
  const faceGone = inp.faceMissing && !holding;
  if (faceGone && s.belowOffSince == null) s.belowOffSince = t;
  if (s.belowOffSince != null && t - s.belowOffSince >= cfg.handLeftMs) {
    const wasAlerted = s.phase === 'alerted';
    events.push({ type: 'handLeft', t, leftAt: s.belowOffSince, stats: statsOf(s) });
    s.phase = 'idle';
    s.cooldownUntil = wasAlerted ? t + cfg.cooldownMs : t;
    resetEpisode();
    return { state: s, events };
  }

  if (s.phase === 'candidate') {
    if (above && !holding) {
      if (s.lastAboveOn != null && t - s.lastAboveOn > gapTol) s.dwellStart = t; // gap too long: restart dwell
      if (s.dwellStart == null) s.dwellStart = t;
      s.lastAboveOn = t;
    } else if (handHold && above && s.dwellStart != null) {
      s.lastAboveOn = t; // a missed detection is not a gap (but cannot complete the dwell either: see below)
    }
    const pinchMostly = s.frames > 0 && s.pinchFrames / s.frames > 0.5;
    const dwell = pinchMostly ? cfg.dwellMsPinch : cfg.dwellMs;
    // Only a frame that actually sees the hand in the zone can complete the dwell: time after the hand has gone
    // (still inside the gap tolerance) must not count, or a 0.5 s touch at 3 fps would become a reminder.
    const sustained = above && !holding && s.dwellStart != null;
    if (sustained && t - (s.dwellStart as number) >= dwell) {
      s.phase = 'alerted';
      events.push({ type: 'alertThresholdReached', t, stats: statsOf(s) });
    }
  }
  return { state: s, events };
}
