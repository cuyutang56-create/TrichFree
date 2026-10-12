// Regression guard for the hair-contact tuning, on REAL hair-confidence masks from the team's demo video
// (8 frames, 160×120, plus 7 face landmarks each; no pixels). Positives: fingertips on hair. Negatives: face,
// chin, background, and "near hair" (0.15–0.35 face widths beside it). The hand occludes the hair it covers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HAIR_CONF, HAIR_TOUCH, hairContact, type HairMask } from '../src/core/hair';
import type { HandObs, Vec3 } from '../src/core/types';

interface Frame { w: number; h: number; conf: string; face: [number, number][] | null }
const frames = (JSON.parse(readFileSync('test/hair/masks-demo.json', 'utf8')) as Frame[]).filter((f) => f.face);

let seed = 1;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function mask(f: Frame, thr: number): Uint8Array {
  const raw = Buffer.from(f.conf, 'base64');
  return Uint8Array.from(raw, (v) => (v >= thr * 255 ? 1 : 0));
}
function distToHair(m: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h).fill(1e9); const q: number[] = [];
  m.forEach((v, i) => { if (v) { d[i] = 0; q.push(i); } });
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
/** A hand pinching at (ax, ay), pointing up, scale hs px; returns the hand and the mask with the hand cut out. */
function handAt(m: Uint8Array, w: number, h: number, ax: number, ay: number, hs: number): { hand: HandObs; mask: HairMask } {
  const N = (x: number, y: number): Vec3 => [x / w, y / h, 0];
  const lms: Vec3[] = Array.from({ length: 21 }, () => N(ax, ay + hs));
  lms[0] = N(ax, ay + 1.7 * hs); lms[9] = N(ax, ay + 0.7 * hs);
  lms[4] = N(ax - 0.04 * hs, ay); lms[8] = N(ax + 0.04 * hs, ay);
  const o = m.slice(); const r = 0.22 * hs;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x - ax) ** 2 + (y - ay) ** 2 < r * r || (Math.abs(x - ax) < 0.35 * hs && y > ay && y < ay + 1.6 * hs)) o[y * w + x] = 0;
  }
  return { hand: { handedness: 'Right', landmarks: lms }, mask: { width: w, height: h, data: o } };
}

export function evaluate(conf: number, touch: number) {
  seed = 1;
  const res: Record<string, { hit: number; n: number }> = {};
  const add = (cls: string, fires: boolean) => { res[cls] ??= { hit: 0, n: 0 }; res[cls].n++; if (fires) res[cls].hit++; };
  for (const f of frames) {
    const { w, h } = f;
    const m = mask(f, conf);
    const P = f.face!.map(([x, y]) => [x * w, y * h]);
    const faceW = Math.hypot(P[2][0] - P[3][0], P[2][1] - P[3][1]), hs = 0.63 * faceW;
    const dist = distToHair(mask(f, 0.5), w, h);
    const test = (cls: string, ax: number, ay: number) => { const s = handAt(m, w, h, ax, ay, hs); add(cls, hairContact(s.hand, s.mask) >= touch); };
    for (let k = 0; k < 40; k++) { const i = Math.floor(rnd() * w * h); if (dist[i] === 0) test('hair', i % w, (i / w) | 0); }
    const [, chin, L, R, bridge, nose, mouth] = P;
    for (const [x, y] of [bridge, nose, mouth, [(L[0] + nose[0]) / 2, (L[1] + nose[1]) / 2], [(R[0] + nose[0]) / 2, (R[1] + nose[1]) / 2]]) test('face', x, y);
    test('chin', chin[0], chin[1] + 0.12 * faceW);
    let near = 0; for (let k = 0; k < 4000 && near < 20; k++) { const i = Math.floor(rnd() * w * h); const d = dist[i] / faceW; if (d > 0.15 && d < 0.35) { test('near', i % w, (i / w) | 0); near++; } }
    let bg = 0; for (let k = 0; k < 4000 && bg < 20; k++) { const i = Math.floor(rnd() * w * h); if (dist[i] / faceW > 0.6) { test('bg', i % w, (i / w) | 0); bg++; } }
  }
  const rate = (c: string) => res[c].hit / res[c].n;
  const negs = ['face', 'chin', 'near', 'bg'];
  const tnr = negs.reduce((s, c) => s + (res[c].n - res[c].hit), 0) / negs.reduce((s, c) => s + res[c].n, 0);
  return { hair: rate('hair'), face: rate('face'), near: rate('near'), bg: rate('bg'), chin: rate('chin'), balanced: (rate('hair') + tnr) / 2 };
}

describe('hair contact on real masks', () => {
  it('shipped tuning catches fingertips on hair and ignores the face and background', () => {
    const r = evaluate(HAIR_CONF, HAIR_TOUCH);
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(r.hair).toBeGreaterThanOrEqual(0.9);
    expect(r.face).toBe(0);
    expect(r.bg).toBe(0);
    // "Near hair" can still read as contact; the strands zone additionally needs a pinch at face depth + dwell.
    expect(r.near).toBeLessThanOrEqual(0.2);
    expect(r.balanced).toBeGreaterThanOrEqual(0.93);
  });
  it('beats the original setting (confidence 0.5, threshold 0.25)', () => {
    const before = evaluate(0.5, 0.25), after = evaluate(HAIR_CONF, HAIR_TOUCH);
    console.log(`hair contact: before ${(before.hair * 100).toFixed(0)}% → after ${(after.hair * 100).toFixed(0)}% of on-hair fingertips`);
    expect(evaluate(HAIR_CONF, HAIR_TOUCH).hair).toBeGreaterThan(evaluate(0.5, 0.25).hair + 0.1);
  });
});
