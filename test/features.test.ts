import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/detectorConfig';
import { computeFaceGeom } from '../src/core/faceFrame';
import { extractHandFeatures, handShape, thresholdsFrom } from '../src/core/features';
import { scoreFrame } from '../src/core/scorer';
import type { FrameInput, HandObs } from '../src/core/types';
import { readFileSync } from 'node:fs';

const rec = JSON.parse(readFileSync('test/fixtures/pinch-at-crown.json', 'utf8'));
const frame: FrameInput = rec.frames.find((f: FrameInput) => f.face && f.hands.length && f.t > 2500);

/** Scale every landmark about the image centre (simulating the user moving closer / farther). */
function scaleFrame(f: FrameInput, k: number): FrameInput {
  const s = (p: [number, number, number]): [number, number, number] => [0.5 + (p[0] - 0.5) * k, 0.5 + (p[1] - 0.5) * k, p[2]];
  const face: Record<number, [number, number, number]> = {};
  for (const [i, p] of Object.entries(f.face!)) face[Number(i)] = s(p);
  return { ...f, face, hands: f.hands.map((h) => ({ ...h, landmarks: h.landmarks.map(s) })) };
}

function feats(f: FrameInput) {
  const geom = computeFaceGeom(f.face!, f.width, f.height)!;
  return extractHandFeatures(f.t, f.hands[0] as HandObs, f.width, f.height, geom, false, ['crown'], thresholdsFrom(null, DEFAULT_CONFIG), DEFAULT_CONFIG);
}

describe('features', () => {
  it('scale ratio r is invariant to 0.5x and 2x scaling', () => {
    const base = feats(frame);
    for (const k of [0.5, 2]) {
      const f = feats(scaleFrame(frame, k));
      expect(f.r).toBeCloseTo(base.r, 6);
      expect(f.pinch).toBeCloseTo(base.pinch, 6);
      expect(f.zone).toBe(base.zone);
    }
    expect(base.r).toBeGreaterThan(0.55);
    expect(base.r).toBeLessThan(0.75);
  });
  it('pinch grip at the crown scores high', () => {
    const f = feats(frame);
    expect(f.zone).toBe('crown');
    expect(f.isPinch).toBe(true);
    expect(f.depthConsistent).toBe(true);
    expect(scoreFrame(f, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(0.9);
  });
  it('a hand much closer than the face is not depth-consistent', () => {
    const f = frame.hands[0];
    const w = f.landmarks[0];
    const bigger: HandObs = { ...f, landmarks: f.landmarks.map((p) => [w[0] + (p[0] - w[0]) * 2, w[1] + (p[1] - w[1]) * 2, 0]) };
    const { handScale } = handShape(bigger, frame.width, frame.height);
    expect(handScale).toBeGreaterThan(handShape(f, frame.width, frame.height).handScale * 1.9);
  });
  it('no zone → p = 0', () => {
    expect(scoreFrame({ ...feats(frame), zone: null }, DEFAULT_CONFIG)).toBe(0);
    expect(scoreFrame({ ...feats(frame), occlusionVeto: true }, DEFAULT_CONFIG)).toBe(0);
  });
});
