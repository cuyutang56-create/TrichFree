import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/detectorConfig';
import { HAIR_TOUCH, hairContact, type HairMask } from '../src/core/hair';
import { scoreFrame } from '../src/core/scorer';
import type { FrameFeatures, HandObs, Vec3 } from '../src/core/types';

/** A hand whose wrist→middle-MCP is 0.1 of the frame, fingertips around (x, y). */
function handAt(x: number, y: number): HandObs {
  const lms: Vec3[] = Array.from({ length: 21 }, () => [x, y + 0.15, 0] as Vec3);
  lms[0] = [x, y + 0.2, 0];
  lms[9] = [x, y + 0.1, 0];
  lms[4] = [x - 0.005, y, 0];
  lms[8] = [x + 0.005, y, 0];
  return { handedness: 'Right', landmarks: lms };
}
function mask(fill: (x: number, y: number) => boolean, W = 200, H = 200): HairMask {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = fill(x / W, y / H) ? 1 : 0;
  return { width: W, height: H, data };
}

describe('hair contact', () => {
  it('is ~1 when the fingertips are surrounded by hair', () => {
    expect(hairContact(handAt(0.5, 0.3), mask(() => true))).toBeGreaterThan(0.95);
  });
  it('is 0 with no hair anywhere near', () => {
    expect(hairContact(handAt(0.5, 0.3), mask((x) => x < 0.1))).toBe(0);
  });
  it('detects a strand passing through the fingers (thin vertical band)', () => {
    const c = hairContact(handAt(0.5, 0.3), mask((x) => Math.abs(x - 0.5) < 0.03));
    expect(c).toBeGreaterThanOrEqual(HAIR_TOUCH); // counts as touching hair
    expect(c).toBeLessThan(1);
  });
  it('scales with the hand: same answer at half the size', () => {
    const fine = (f: (x: number, y: number) => boolean) => mask(f, 800, 800); // avoid pixel rounding at small sizes
    const big = hairContact(handAt(0.5, 0.3), fine((x) => x < 0.5));
    const h = handAt(0.5, 0.3);
    const small: HandObs = { ...h, landmarks: h.landmarks.map(([x, y, z]) => [0.5 + (x - 0.5) / 2, 0.3 + (y - 0.3) / 2, z] as Vec3) };
    expect(Math.abs(hairContact(small, fine((x) => x < 0.5)) - big)).toBeLessThan(0.1);
  });
});

describe('strands scoring', () => {
  const base: FrameFeatures = {
    t: 0, faceMissing: false, faceHeld: false, hasHand: true, zone: 'strands', tipUV: { u: -1.1, v: -0.6 }, handedness: 'Right',
    r: 0.63, pinch: 0.16, isPinch: true, depthConsistent: true, orientationV: 0.8, orientationOK: true, occlusionVeto: false,
    tipSpeed: 0, tipJitter: 0, hairContact: 0.6,
  };
  it('pinch at face depth crosses candidateOn', () => expect(scoreFrame(base, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(0.8));
  it('no pinch stays below candidateOn', () => expect(scoreFrame({ ...base, isPinch: false }, DEFAULT_CONFIG)).toBeLessThan(DEFAULT_CONFIG.candidateOn));
  it('pinch in front of the face (wrong depth) stays low', () => expect(scoreFrame({ ...base, depthConsistent: false }, DEFAULT_CONFIG)).toBeLessThan(0.5));
  it('hair contact boosts scalp zones a little', () => {
    const scalp = { ...base, zone: 'crown' as const, isPinch: false, depthConsistent: false };
    expect(scoreFrame({ ...scalp, hairContact: 0.6 }, DEFAULT_CONFIG)).toBeGreaterThan(scoreFrame({ ...scalp, hairContact: 0 }, DEFAULT_CONFIG));
  });
});
