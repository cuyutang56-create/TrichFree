import type { Sensitivity } from './types';

export interface DetectorConfig {
  targetFps: number;
  faceEveryNFrames: number;
  faceHoldMs: number;
  faceMissingHoldEpisodeMs: number;
  emaAlpha: number;
  candidateOn: number;
  candidateOff: number;
  dwellMs: number;
  dwellMsPinch: number;
  gapToleranceMs: number;
  handLeftMs: number;
  checkMs: number;
  cooldownMs: number;
  chimeToClipGapMs: number;
  depthTolerance: number;
  pinchThreshDefault: number;
  rMinDefault: number;
  rMaxDefault: number;
  pilotBaselineDays: number;
  pilotTotalDays: number;
  weights: { base: number; depthOk: number; depthBad: number; pinch: number; orientation: number; hairBonus: number };
  /** 'strands' is driven by hair contact alone, so it needs a pinch to cross candidateOn. */
  strandWeights: { base: number; depthOk: number; depthBad: number; pinch: number; orientation: number };
}

export const DEFAULT_CONFIG: DetectorConfig = {
  targetFps: 15,
  faceEveryNFrames: 3,
  faceHoldMs: 1500,
  faceMissingHoldEpisodeMs: 5000,
  emaAlpha: 0.4,
  candidateOn: 0.6,
  candidateOff: 0.35,
  dwellMs: 1500,
  dwellMsPinch: 800,
  gapToleranceMs: 300,
  handLeftMs: 1000,
  checkMs: 10000,
  cooldownMs: 5000,
  chimeToClipGapMs: 250,
  depthTolerance: 0.15,
  pinchThreshDefault: 0.35,
  // Uncalibrated depth band for r = handScale / faceW. Wrist→middle-MCP ≈ 9–10 cm, face width ≈ 14–15 cm.
  rMinDefault: 0.45,
  rMaxDefault: 0.85,
  pilotBaselineDays: 3,
  pilotTotalDays: 14,
  weights: { base: 0.55, depthOk: 0.25, depthBad: -0.3, pinch: 0.15, orientation: 0.05, hairBonus: 0.1 },
  strandWeights: { base: 0.3, depthOk: 0.2, depthBad: -0.3, pinch: 0.35, orientation: 0.05 },
};

export const SENSITIVITY: Record<Sensitivity, Pick<DetectorConfig, 'dwellMs' | 'dwellMsPinch' | 'candidateOn' | 'candidateOff'>> = {
  relaxed: { dwellMs: 2500, dwellMsPinch: 1200, candidateOn: 0.7, candidateOff: 0.4 },
  balanced: { dwellMs: 1500, dwellMsPinch: 800, candidateOn: 0.6, candidateOff: 0.35 },
  sensitive: { dwellMs: 1000, dwellMsPinch: 600, candidateOn: 0.5, candidateOff: 0.3 },
};

export function configFor(sensitivity: Sensitivity, extraDwellMs = 0, overrides: Partial<DetectorConfig> = {}): DetectorConfig {
  const s = SENSITIVITY[sensitivity];
  return {
    ...DEFAULT_CONFIG,
    ...s,
    dwellMs: s.dwellMs + extraDwellMs,
    dwellMsPinch: s.dwellMsPinch + extraDwellMs,
    ...overrides,
  };
}
