// Detection robustness on synthetic landmark fixtures (see src/core/evaluate.ts and docs/DETECTION_REPORT.md).
// These lock in behaviour; they are not a measure of real-world accuracy.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONDITIONS, evaluate, summarise, type EvalRecording } from '../src/core/evaluate';

const recs = readdirSync('test/fixtures').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`test/fixtures/${f}`, 'utf8')) as EvalRecording);
const of = (c: string) => recs.filter((r) => r.meta.category === c);
const results = recs.flatMap((r) => CONDITIONS.map((c) => evaluate(r, c)));

describe('detection on synthetic fixtures', () => {
  it('every reach is caught at 15, 8, 5 and 3 frames per second, and with noise or missed hands', () => {
    for (const cond of CONDITIONS.slice(0, 6)) {
      for (const r of of('positive')) expect(evaluate(r, cond).alerts, `${r.meta.name} @ ${cond.label}`).toBe(r.meta.expect!.alerts);
    }
  });

  it('everyday movements stay quiet under every condition', () => {
    for (const r of results.filter((x) => x.category === 'negative')) expect(r.alerts, `${r.name} @ ${r.condition}`).toBe(0);
  });

  it('reminds quickly: under 1 s for a pinch and under 2 s for an open hand at 15 fps', () => {
    const at = (name: string) => results.find((r) => r.name === name && r.condition === '15 fps')!.latencyMs!;
    expect(at('pinch-at-crown')).toBeLessThan(1000);
    expect(at('pinch-at-temple')).toBeLessThan(1000);
    expect(at('reach-hairline-open')).toBeLessThan(2000);
  });

  it('a slow computer (3 fps) still catches every reach, just later (regression: it used to catch none)', () => {
    const s = summarise(results).find((x) => x.condition === '3 fps')!;
    expect(s.positivesCaught).toBe(s.positives);
    expect(s.maxLatencyMs!).toBeLessThan(3000);
  });

  it('the worst combined condition still catches most reaches (documented misses)', () => {
    const s = summarise(results).find((x) => x.condition === '3 fps + noise + 20% misses')!;
    expect(s.positivesCaught).toBeGreaterThanOrEqual(s.positives - 1);
    expect(s.falseAlerts).toBe(0);
  });

  it('missed hand detections at 15 fps: every reach caught and no false alert over 20 random seeds (regression)', () => {
    // Before the hand hold, one missed frame counted as the hand leaving: the open-hand reach was missed in ~1 of 5 seeds.
    const cond = CONDITIONS.find((c) => c.label === '15 fps + 20% hand misses')!;
    const rs = Array.from({ length: 20 }, (_, k) => recs.map((r) => evaluate(r, { ...cond, seed: k + 1 }))).flat();
    const [s] = summarise(rs);
    expect(s.positivesCaught).toBe(s.positives);
    expect(s.falseAlerts).toBe(0);
  });

  it('no alert loop: a hand that keeps drifting back gets at most two reminders in 40 s with the default quiet time', () => {
    const [hover] = of('loop');
    expect(evaluate(hover, CONDITIONS[0], 'balanced', { cooldownMs: 30_000 }).alerts).toBeLessThanOrEqual(2);
    // With the old 5 s cooldown it re-reminded about every 10 s: the reason the default became 30 s.
    expect(evaluate(hover, CONDITIONS[0], 'balanced', { cooldownMs: 5_000 }).alerts).toBeGreaterThan(2);
  });

  it('known limitation, kept visible: scratching the scalp looks like a reach to the detector', () => {
    for (const r of of('limitation')) expect(evaluate(r, CONDITIONS[0]).alerts).toBeGreaterThanOrEqual(1);
  });
});
