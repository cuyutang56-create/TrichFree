import { describe, expect, it } from 'vitest';
import { blend, modelInput, predict, trainPersonalModel } from '../src/core/classifier';
import { DEFAULT_CONFIG } from '../src/core/detectorConfig';
import { DetectorPipeline } from '../src/core/pipeline';
import { featureVector } from '../src/core/features';
import { readFileSync } from 'node:fs';

/** Synthetic stored vectors: positives pinch at face depth in hair; negatives open hand, closer to camera. */
function sample(label: 0 | 1, k: number): { x: number[]; label: 0 | 1 } {
  const j = (s: number) => Math.sin(k * 12.9898 + s) * 0.5; // deterministic jitter in [-0.5, 0.5]
  const x = label
    ? [0.1 + 0.2 * j(1), 0.8 + 0.1 * j(2), 0.62 + 0.05 * j(3), 0.15 + 0.05 * j(4), 0.7, 0.3, 0.02, 0, 0, 0, 0.8, 1, 1, 0, 0.6 + 0.2 * j(5)]
    : [0.1 + 0.2 * j(1), 0.8 + 0.1 * j(2), 0.95 + 0.1 * j(3), 0.7 + 0.2 * j(4), 0.2, 1.5, 0.05, 0, 0, 0, 0.7, 0, 0, 0, 0.1 + 0.1 * j(5)];
  return { x, label };
}

describe('personal classifier', () => {
  it('learns a separable personal pattern and passes the gate', () => {
    const data = [...Array.from({ length: 60 }, (_, k) => sample(1, k)), ...Array.from({ length: 60 }, (_, k) => sample(0, k + 100))];
    const m = trainPersonalModel(data)!;
    expect(m.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(m.active).toBe(true);
    expect(predict(m, modelInput(sample(1, 999).x))).toBeGreaterThan(0.8);
    expect(predict(m, modelInput(sample(0, 999).x))).toBeLessThan(0.2);
  });

  it('stays inactive below 40 examples per class', () => {
    const data = [...Array.from({ length: 30 }, (_, k) => sample(1, k)), ...Array.from({ length: 60 }, (_, k) => sample(0, k + 100))];
    expect(trainPersonalModel(data)!.active).toBe(false);
  });

  it('ignores frames with no zone (index 8 = -1)', () => {
    const data = Array.from({ length: 200 }, (_, k) => ({ ...sample((k % 2) as 0 | 1, k), x: [...sample(0, k).x.slice(0, 8), -1, ...sample(0, k).x.slice(9)] }));
    expect(trainPersonalModel(data)).toBeNull();
  });

  it('trains in under 200 ms on 5,000 samples', () => {
    const data = Array.from({ length: 5000 }, (_, k) => sample((k % 3 === 0 ? 1 : 0) as 0 | 1, k));
    const m = trainPersonalModel(data)!;
    expect(m.ms).toBeLessThan(200);
    expect(m.nPos + m.nNeg).toBe(5000);
  });

  it('blend: 0.5·rule + 0.5·model; rule alone without a model', () => {
    expect(blend(0.8, null)).toBe(0.8);
    expect(blend(0.8, 0.2)).toBeCloseTo(0.5);
    expect(blend(0, 1)).toBe(0.5); // outside every zone the model can't trigger an alert on its own
  });

  it('a model that learned "this pose is not a pull" suppresses the alert in the pipeline', () => {
    const rec = JSON.parse(readFileSync('test/fixtures/pinch-at-crown.json', 'utf8'));
    // Build a model whose labels say every crown pinch was a false alarm.
    const pipe0 = new DetectorPipeline(DEFAULT_CONFIG, null, rec.meta.zones);
    const rows: { x: number[]; label: 0 | 1 }[] = [];
    for (const f of rec.frames) {
      const out = pipe0.process(f);
      if (out.features.zone) rows.push({ x: featureVector(out.features, out.pSmooth), label: 0 });
    }
    // Positives somewhere else (hairline, open hand) so both classes exist.
    // Positives: the same person pulling at the hairline with an open hand (zone 1, no pinch).
    const pos = rows.slice(0, 50).map((r) => { const x = [...r.x]; x[1] = 0.5; x[3] = 0.9; x[8] = 1; x[12] = 0; return { x, label: 1 as const }; });
    const neg = Array.from({ length: 50 }, (_, k) => rows[k % rows.length]);
    const m = trainPersonalModel([...neg, ...pos])!;
    expect(m.active).toBe(true);
    const pipe = new DetectorPipeline(DEFAULT_CONFIG, null, rec.meta.zones);
    pipe.setModel(m);
    const alerts = rec.frames.flatMap((f: never) => pipe.process(f).events).filter((e: { type: string }) => e.type === 'alertThresholdReached');
    expect(alerts).toHaveLength(0);
  });
});
