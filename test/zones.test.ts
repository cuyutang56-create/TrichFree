import { describe, expect, it } from 'vitest';
import { computeFaceGeom, toUV, uvToPx } from '../src/core/faceFrame';
import { inZone, zoneOf } from '../src/core/zones';
import type { FaceLandmarks, Vec3 } from '../src/core/types';

const g = { v10: 0.55, vBrow: 0.12, eyes: [{ u: -0.22, v: 0.03 }, { u: 0.22, v: 0.03 }] };
const P = (u: number, v: number) => ({ u, v });

describe('zones', () => {
  it('crown: v > v10 + 0.10, |u| < 0.9', () => {
    expect(inZone('crown', P(0, 0.66), g)).toBe(true);
    expect(inZone('crown', P(0, 0.64), g)).toBe(false);
    expect(inZone('crown', P(0.89, 0.8), g)).toBe(true);
    expect(inZone('crown', P(-0.91, 0.8), g)).toBe(false);
  });
  it('hairline: v10 - 0.10 < v <= v10 + 0.25, |u| < 0.75', () => {
    expect(inZone('hairline', P(0, 0.46), g)).toBe(true);
    expect(inZone('hairline', P(0, 0.44), g)).toBe(false);
    expect(inZone('hairline', P(0, 0.8), g)).toBe(true);
    expect(inZone('hairline', P(0, 0.81), g)).toBe(false);
    expect(inZone('hairline', P(0.74, 0.5), g)).toBe(true);
    expect(inZone('hairline', P(0.76, 0.5), g)).toBe(false);
  });
  it('sides: v > vBrow - 0.1, 0.45 < |u| < 1.05', () => {
    expect(inZone('sides', P(0.6, 0.03), g)).toBe(true);
    expect(inZone('sides', P(0.6, 0.01), g)).toBe(false);
    expect(inZone('sides', P(-0.46, 0.3), g)).toBe(true);
    expect(inZone('sides', P(0.44, 0.3), g)).toBe(false);
    expect(inZone('sides', P(1.06, 0.3), g)).toBe(false);
  });
  it('brows: |v - vBrow| < 0.12, 0.05 < |u| < 0.55', () => {
    expect(inZone('brows', P(0.3, 0.23), g)).toBe(true);
    expect(inZone('brows', P(0.3, 0.25), g)).toBe(false);
    expect(inZone('brows', P(-0.3, 0.01), g)).toBe(true);
    expect(inZone('brows', P(-0.3, -0.01), g)).toBe(false);
    expect(inZone('brows', P(0.04, 0.12), g)).toBe(false);
    expect(inZone('brows', P(0.56, 0.12), g)).toBe(false);
  });
  it('lashes: |v - vLash| < 0.08, |u - uEye| < 0.18 per eye', () => {
    expect(inZone('lashes', P(0.22, 0.1), g)).toBe(true);
    expect(inZone('lashes', P(0.22, 0.12), g)).toBe(false);
    expect(inZone('lashes', P(-0.39, 0.03), g)).toBe(true);
    expect(inZone('lashes', P(-0.41, 0.03), g)).toBe(false);
  });
  it('beard: v < -0.55, |u| < 0.6', () => {
    expect(inZone('beard', P(0, -0.6), g)).toBe(true);
    expect(inZone('beard', P(0, -0.5), g)).toBe(false);
    expect(inZone('beard', P(0.61, -0.8), g)).toBe(false);
  });
  it('calibration widening moves the boundary', () => {
    expect(inZone('crown', P(0, 0.6), g, { zoneAdjust: { crown: { du: 0, dvUp: 0, dvDown: 0.1 } } })).toBe(true);
  });
  it('zoneOf only returns enabled zones', () => {
    expect(zoneOf(P(0, 0.8), ['brows'], g)).toBe(null);
    expect(zoneOf(P(0, 0.8), ['crown', 'hairline'], g)).toBe('hairline');
  });

  // Build a face in face units, roll it, and check that a crown point still maps into the crown.
  function face(rollDeg: number, W = 640, H = 480): { lms: FaceLandmarks; toNorm: (u: number, v: number) => Vec3 } {
    const a = (rollDeg * Math.PI) / 180;
    const unit = 192; // px
    const toNorm = (u: number, v: number): Vec3 => {
      // up = (sin a, -cos a) in image px; right = (cos a, sin a)
      const x = 320 + unit * (u * Math.cos(a) + v * Math.sin(a));
      const y = 200 + unit * (u * Math.sin(a) - v * Math.cos(a));
      return [x / W, y / H, 0];
    };
    const pts: Record<number, [number, number]> = {
      10: [0, 0.55], 152: [0, -0.85], 234: [-0.5, -0.12], 454: [0.5, -0.12], 168: [0, 0],
      70: [-0.3, 0.12], 336: [0.3, 0.12], 159: [-0.22, 0.03], 386: [0.22, 0.03],
    };
    const lms: FaceLandmarks = {};
    for (const [i, [u, v]] of Object.entries(pts)) lms[Number(i)] = toNorm(u, v);
    return { lms, toNorm };
  }
  for (const roll of [-20, 0, 20]) {
    it(`head roll ${roll}° still maps correctly`, () => {
      const { lms, toNorm } = face(roll);
      const geom = computeFaceGeom(lms, 640, 480)!;
      const faceW = Math.hypot(0.5 - -0.5, -0.12 - -0.12) * 192;
      expect(geom.faceW).toBeCloseTo(faceW, 3);
      const n = toNorm(0.2, 0.8);
      const uv = toUV({ x: n[0] * 640, y: n[1] * 480 }, geom);
      // Face-unit coords are relative to the chin→forehead axis, which is not exactly perpendicular to the edges.
      expect(uv.u).toBeCloseTo(0.2, 2);
      expect(uv.v).toBeCloseTo(0.8, 2);
      expect(inZone('crown', uv, geom)).toBe(true);
      expect(inZone('brows', toUV(uvToPx({ u: 0.3, v: 0.12 }, geom), geom), geom)).toBe(true);
    });
  }
});
