// Personal classifier (Section 4.8): logistic regression trained in the browser on the user's own labels.
// Labels come from calibration, "Try it", "Not a pull", "I just pulled" and hands that came down after an alert.
// It never sees pixels, only the feature vectors from features.ts.

export interface PersonalModel {
  w: number[];
  b: number;
  mean: number[];
  std: number[];
  nPos: number;
  nNeg: number;
  accuracy: number; // balanced accuracy on a 10% hold-out
  active: boolean; // passes the gate: ≥ 40 pos, ≥ 40 neg, accuracy ≥ 0.8
  trainedAt: number;
  ms: number;
}

export const MIN_PER_CLASS = 40;
export const MIN_ACCURACY = 0.8;

const N_ZONES = 7;
/**
 * Stored vector (featureVector in features.ts):
 *  0 tipU 1 tipV 2 r 3 pinch 4 orientationV 5 speed 6 jitter 7 faceMissing 8 zoneIdx 9 leftHand 10 pSmooth
 *  11 depthOk 12 isPinch 13 veto 14 hairContact (absent in older rows)
 * Model input drops pSmooth (it is downstream of the score) and one-hot encodes the zone.
 */
export function modelInput(x: number[]): number[] {
  const zone = x[8] ?? -1;
  const oneHot = Array.from({ length: N_ZONES }, (_, k) => (k === zone ? 1 : 0));
  return [
    x[0], x[1], x[2], Math.min(x[3], 3), x[4], Math.min(x[5], 10), Math.min(x[6], 1), x[7], x[9],
    x[11], x[12], x[13], x[14] ?? 0, ...oneHot,
  ];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function predict(m: Pick<PersonalModel, 'w' | 'b' | 'mean' | 'std'>, input: number[]): number {
  let z = m.b;
  for (let j = 0; j < m.w.length; j++) z += m.w[j] * ((input[j] - m.mean[j]) / m.std[j]);
  return sigmoid(z);
}

/** Seeded shuffle so a re-train on the same data gives the same model. */
function shuffled<T>(xs: T[], seed = 7): T[] {
  const a = [...xs];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fit(X: number[][], y: number[], opts: { iters: number; lr: number; l2: number }) {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0), std = new Array(d).fill(0);
  for (const r of X) for (let j = 0; j < d; j++) mean[j] += r[j] / n;
  for (const r of X) for (let j = 0; j < d; j++) std[j] += (r[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1;
  // Flat, standardised design matrix: fast inner loops.
  const Z = new Float64Array(n * d);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) Z[i * d + j] = (X[i][j] - mean[j]) / std[j];
  // Balanced class weights so a flood of negatives can't drown out the positives.
  const nPos = y.reduce((a, b) => a + b, 0), nNeg = n - nPos;
  const wPos = n / (2 * Math.max(1, nPos)), wNeg = n / (2 * Math.max(1, nNeg));
  const cw = Float64Array.from(y, (v) => (v ? wPos : wNeg));
  const w = new Float64Array(d), g = new Float64Array(d);
  let b = 0;
  for (let it = 0; it < opts.iters; it++) {
    g.fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const o = i * d;
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Z[o + j];
      const err = (sigmoid(z) - y[i]) * cw[i];
      for (let j = 0; j < d; j++) g[j] += err * Z[o + j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= opts.lr * (g[j] / n + opts.l2 * w[j]);
    b -= opts.lr * (gb / n);
  }
  return { w: Array.from(w), b, mean, std };
}

function balancedAccuracy(m: Pick<PersonalModel, 'w' | 'b' | 'mean' | 'std'>, X: number[][], y: number[]): number {
  let tp = 0, tn = 0, p = 0, n = 0;
  X.forEach((x, i) => {
    const hit = predict(m, x) >= 0.5;
    if (y[i]) { p++; if (hit) tp++; } else { n++; if (!hit) tn++; }
  });
  if (!p || !n) return 0;
  return (tp / p + tn / n) / 2;
}

/** Train on stored samples (only frames with a hand in a zone carry information for the blend). */
export function trainPersonalModel(samples: { x: number[]; label: 0 | 1 }[], now = Date.now()): PersonalModel | null {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rows = samples.filter((s) => (s.x[8] ?? -1) >= 0).slice(-5000);
  const nPos = rows.filter((r) => r.label === 1).length, nNeg = rows.length - nPos;
  if (nPos < 5 || nNeg < 5) return null;
  const opts = { iters: 120, lr: 0.5, l2: 1e-3 };
  const sh = shuffled(rows);
  const cut = Math.max(1, Math.floor(sh.length * 0.1));
  const test = sh.slice(0, cut), train = sh.slice(cut);
  // The model trained on 90% is the one we keep, so the hold-out accuracy describes exactly what ships.
  const full = fit(train.map((r) => modelInput(r.x)), train.map((r) => r.label), opts);
  const accuracy = balancedAccuracy(full, test.map((r) => modelInput(r.x)), test.map((r) => r.label));
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    ...full, nPos, nNeg, accuracy, trainedAt: now, ms,
    active: nPos >= MIN_PER_CLASS && nNeg >= MIN_PER_CLASS && accuracy >= MIN_ACCURACY,
  };
}

/** pFinal = 0.5·pRule + 0.5·pModel when the model is active (Section 4.8). Outside every zone the rule says 0 and wins. */
export function blend(pRule: number, pModel: number | null): number {
  return pModel == null ? pRule : 0.5 * pRule + 0.5 * pModel;
}
