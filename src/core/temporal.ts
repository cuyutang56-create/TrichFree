import type { DetectorConfig } from './detectorConfig';
import type { DetectorEvent, EpisodeStats, ZoneId } from './types';

export type TemporalPhase = 'idle' | 'candidate' | 'alerted';

export interface TemporalInput {
  t: number;
  p: number;
  faceMissing: boolean; // face lost beyond faceHoldMs
  isPinch: boolean;
  zone: ZoneId | null;
  r: number;
}

export interface TemporalState {
  phase: TemporalPhase;
  pSmooth: number;
  lastT: number | null;
  dwellStart: number | null; // start of the current sustained run (gaps < gapToleranceMs tolerated)
  lastAboveOn: number | null;
  belowOffSince: number | null;
  faceMissingSince: number | null;
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
    phase: 'idle', pSmooth: 0, lastT: null, dwellStart: null, lastAboveOn: null, belowOffSince: null,
    faceMissingSince: null, cooldownUntil: -Infinity, frames: 0, pinchFrames: 0, rValues: [], zoneCounts: {}, pSmoothMax: 0,
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
  const holding = inp.faceMissing && s.phase !== 'idle' && t - (s.faceMissingSince ?? t) < cfg.faceMissingHoldEpisodeMs;
  if (!holding) s.pSmooth = cfg.emaAlpha * inp.p + (1 - cfg.emaAlpha) * prev.pSmooth;
  s.lastT = t;

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
      if (s.lastAboveOn != null && t - s.lastAboveOn > cfg.gapToleranceMs) s.dwellStart = t; // gap too long: restart dwell
      if (s.dwellStart == null) s.dwellStart = t;
      s.lastAboveOn = t;
    }
    const pinchMostly = s.frames > 0 && s.pinchFrames / s.frames > 0.5;
    const dwell = pinchMostly ? cfg.dwellMsPinch : cfg.dwellMs;
    const sustained = s.dwellStart != null && s.lastAboveOn != null && t - s.lastAboveOn <= cfg.gapToleranceMs;
    if (sustained && t - (s.dwellStart as number) >= dwell) {
      s.phase = 'alerted';
      events.push({ type: 'alertThresholdReached', t, stats: statsOf(s) });
    }
  }
  return { state: s, events };
}
