// Generates synthetic landmark fixtures (landmarks only, no pixels) for the replay harness and tests.
// Geometry is built in face units (u right, v up; 1 unit = face width) and projected to normalised image coords.
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 640, H = 480, FPS = 15;
const FACE_W_NORM_X = 0.3; // faceW = 0.3 × frame width = 192 px
const FACE_UNIT_Y = (FACE_W_NORM_X * W) / H; // one face unit in normalised y
const ORIGIN = { x: 0.5, y: 0.42 };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const round = (x) => Math.round(x * 1e5) / 1e5;
const norm = (u, v, noise = 0, r = Math.random) => [
  round(ORIGIN.x + u * FACE_W_NORM_X + (r() - 0.5) * noise),
  round(ORIGIN.y - v * FACE_UNIT_Y + (r() - 0.5) * noise),
  0,
];

// Face points used by the core (see src/core/faceIndices.ts), in face units.
const FACE_UV = {
  10: [0, 0.55], 152: [0, -0.85], 234: [-0.5, -0.12], 454: [0.5, -0.12], 168: [0, 0], 1: [0, -0.3], 13: [0, -0.55],
  70: [-0.4, 0.1], 63: [-0.33, 0.13], 105: [-0.26, 0.14], 66: [-0.18, 0.13], 107: [-0.1, 0.11],
  336: [0.1, 0.11], 296: [0.18, 0.13], 334: [0.26, 0.14], 293: [0.33, 0.13], 300: [0.4, 0.1],
  159: [-0.22, 0.03], 33: [-0.34, 0.0], 133: [-0.1, 0.0], 386: [0.22, 0.03], 263: [0.34, 0.0], 362: [0.1, 0.0],
};
function face(r) {
  const f = {};
  for (const [i, [u, v]] of Object.entries(FACE_UV)) f[i] = norm(u, v, 0.002, r);
  return f;
}

/**
 * 21-point hand from: index-tip target (u,v), pointing direction (radians, 0 = +u, π/2 = up),
 * hand scale in face units (= r), and pinch (thumb tip meets index tip).
 */
function hand({ tip, dir, scale, pinch, hair }, r) {
  const d = [Math.cos(dir), Math.sin(dir)], n = [-d[1], d[0]];
  const at = (a, b) => [a * d[0] + b * n[0], a * d[1] + b * n[1]]; // local → offset
  const s = scale;
  // local positions relative to the wrist
  const L = {
    0: [0, 0],
    1: [0.3 * s, 0.25 * s], 2: [0.55 * s, 0.4 * s], 3: [0.75 * s, 0.5 * s],
    4: pinch ? [1.62 * s, 0.25 * s] : [0.95 * s, 0.6 * s],
    5: [0.95 * s, 0.25 * s], 6: [1.3 * s, 0.25 * s], 7: [1.5 * s, 0.25 * s], 8: [1.7 * s, 0.25 * s],
    9: [1.0 * s, 0], 10: [1.4 * s, 0], 11: [1.62 * s, 0], 12: [1.8 * s, 0],
    13: [0.95 * s, -0.22 * s], 14: [1.3 * s, -0.22 * s], 15: [1.5 * s, -0.22 * s], 16: [1.65 * s, -0.22 * s],
    17: [0.85 * s, -0.4 * s], 18: [1.1 * s, -0.4 * s], 19: [1.25 * s, -0.4 * s], 20: [1.38 * s, -0.4 * s],
  };
  const tipOff = at(...L[8]);
  const wrist = [tip[0] - tipOff[0], tip[1] - tipOff[1]];
  const lms = [];
  for (let i = 0; i < 21; i++) { const o = at(...L[i]); lms.push(norm(wrist[0] + o[0], wrist[1] + o[1], 0.003, r)); }
  return { handedness: 'Right', landmarks: lms, ...(hair != null ? { hairContact: hair } : {}) };
}

const lerp = (a, b, k) => a + (b - a) * k;
/**
 * @param expect.alerts what the current detector should produce
 * @param extra.category 'positive' (should remind), 'negative' (should stay quiet) or 'limitation' (ordinary
 *   touching that the detector cannot tell from a reach: kept as an honest, known false positive)
 * @param extra.onsetMs when the hand arrives at the hair (for latency), positives only
 */
function scenario(name, durationS, handAt, expect, zones = ['crown', 'hairline', 'brows', 'lashes'], extra = {}) {
  const r = rng(name.length * 7919);
  const frames = [];
  for (let k = 0; k < durationS * FPS; k++) {
    const t = Math.round((k * 1000) / FPS);
    const faceRan = k % 3 === 0;
    const h = handAt(t / 1000);
    frames.push({ t, width: W, height: H, hands: h ? [hand(h, r)] : [], face: faceRan ? face(r) : null, faceRan });
  }
  return { meta: { name, width: W, height: H, fps: FPS, zones, expect, ...extra }, frames };
}

const UP = Math.PI / 2;
const fixtures = [
  // Pinch at the crown for 4 s: the only fixture that should alert.
  scenario('pinch-at-crown', 9, (s) => {
    if (s < 1 || s > 6) return null;
    if (s < 1.5) { const k = (s - 1) / 0.5; return { tip: [0.15, lerp(-0.9, 0.85, k)], dir: UP, scale: 0.65, pinch: false }; }
    if (s > 5.5) { const k = (s - 5.5) / 0.5; return { tip: [0.15, lerp(0.85, -1.2, k)], dir: UP, scale: 0.65, pinch: false }; }
    return { tip: [0.15 + 0.01 * Math.sin(s * 20), 0.85], dir: UP - 0.3, scale: 0.65, pinch: true };
  }, { alerts: 1 }, undefined, { category: 'positive', onsetMs: 1500 }),
  // Chin resting on the hand: tips below the chin, never in an enabled zone.
  scenario('chin-rest', 8, (s) => (s < 1 || s > 7 ? null : { tip: [0.05, -0.92], dir: UP, scale: 0.7, pinch: false }), { alerts: 0 }, undefined, { category: 'negative' }),
  // Drinking from a cup: hand close to the camera (large r), fingertips reaching up to lash height.
  scenario('drinking-cup', 8, (s) => {
    if (s < 1 || s > 6) return null;
    return { tip: [0.12, lerp(-0.45, 0.05, Math.min(1, (s - 1) / 1.5))], dir: UP + 0.2, scale: 1.2, pinch: false };
  }, { alerts: 0 }, undefined, { category: 'negative' }),
  // Adjusting glasses: brief (0.7 s) touches at the lash line / bridge, twice.
  scenario('glasses-adjust', 8, (s) => {
    const touch = (s > 1 && s < 1.7) || (s > 4 && s < 4.7);
    return touch ? { tip: [0.12, 0.04], dir: UP, scale: 0.65, pinch: false } : null;
  }, { alerts: 0 }, undefined, { category: 'negative' }),
  // Pinching a lock of long hair beside the face at mouth height (outside every scalp zone): hair contact drives it.
  scenario('pinch-strand', 8, (s) => {
    if (s < 1 || s > 6) return null;
    return { tip: [-1.15 + 0.01 * Math.sin(s * 25), -0.6], dir: UP + 0.4, scale: 0.63, pinch: true, hair: 0.6 };
  }, { alerts: 1 }, ['crown', 'hairline', 'strands'], { category: 'positive', onsetMs: 1000 }),
  // Chin resting on an open hand with long hair falling nearby: hair around the fingers but no pinch → no alert.
  scenario('chin-rest-long-hair', 8, (s) => (s < 1 || s > 7 ? null : { tip: [-0.35, -0.92], dir: UP, scale: 0.7, pinch: false, hair: 0.4 }), { alerts: 0 }, ['crown', 'hairline', 'strands'], { category: 'negative' }),
  // Open hand resting at the front hairline (no pinch) for 3 s: the slower, non-pinch dwell applies.
  scenario('reach-hairline-open', 7, (s) => (s < 1 || s > 4 ? null : { tip: [0.05 + 0.01 * Math.sin(s * 9), 0.6], dir: UP, scale: 0.66, pinch: false }), { alerts: 1 },
    ['crown', 'hairline', 'strands'], { category: 'positive', onsetMs: 1000 }),
  // Fingers at the temple (sides zone), pinching.
  scenario('pinch-at-temple', 7, (s) => (s < 1 || s > 4.5 ? null : { tip: [0.82, 0.3], dir: UP - 0.6, scale: 0.64, pinch: true }), { alerts: 1 },
    ['crown', 'hairline', 'sides'], { category: 'positive', onsetMs: 1000 }),
  // A brief touch at the crown (0.5 s), shorter than any dwell: no reminder.
  scenario('brief-touch-crown', 6, (s) => (s < 1 || s > 1.5 ? null : { tip: [0.15, 0.85], dir: UP - 0.3, scale: 0.65, pinch: true }), { alerts: 0 }, undefined, { category: 'negative' }),
  // Three separate reaches, 3 s each, 7 s apart: one reminder each with a 5 s cooldown, one in total with 30 s.
  scenario('three-reaches', 26, (s) => {
    const inReach = [1, 11, 21].some((a) => s >= a && s < a + 3);
    return inReach ? { tip: [0.15, 0.85], dir: UP - 0.3, scale: 0.65, pinch: true } : null;
  }, { alerts: 3 }, undefined, { category: 'positive', onsetMs: 1000 }),
  // A hand that keeps drifting back to the hairline for 40 s (2 s in, 1.2 s out). The "alert loop" case:
  // a 5 s cooldown re-reminds about every 10 s; the default 30 s quiet time keeps it to a couple.
  scenario('hover-boundary', 42, (s) => (s < 1 || s > 41 ? null : { tip: [0.05, ((s - 1) % 3.2) < 2 ? 0.6 : 0.2], dir: UP, scale: 0.66, pinch: false }), { alerts: 4 },
    ['crown', 'hairline'], { category: 'loop' }),
  // Scratching the scalp with an open hand for 3 s. From landmarks alone this looks like a reach: a known false positive.
  scenario('scratch-scalp', 7, (s) => (s < 1 || s > 4 ? null : { tip: [0.1 + 0.05 * Math.sin(s * 30), 0.95 + 0.04 * Math.sin(s * 23)], dir: UP - 0.2, scale: 0.66, pinch: false }), { alerts: 1 },
    undefined, { category: 'limitation' }),
];

mkdirSync('test/fixtures', { recursive: true });
for (const f of fixtures) {
  writeFileSync(`test/fixtures/${f.meta.name}.json`, JSON.stringify(f));
  console.log('[make-fixtures]', f.meta.name, f.frames.length, 'frames');
}
