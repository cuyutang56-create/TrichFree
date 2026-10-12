import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from '../src/core/detectorConfig';
import { initialTemporal, temporalStep, type TemporalState } from '../src/core/temporal';
import type { DetectorEvent } from '../src/core/types';

/** Feed p(t) at 15 fps from t0 to t1 and collect events with their times. */
function run(pAt: (t: number) => number, t1: number, opts: { faceMissingAt?: (t: number) => boolean; pinch?: boolean; start?: TemporalState } = {}) {
  let s = opts.start ?? initialTemporal();
  const events: DetectorEvent[] = [];
  for (let t = 0; t <= t1; t += 1000 / 15) {
    const out = temporalStep(s, { t, p: pAt(t), faceMissing: opts.faceMissingAt?.(t) ?? false, isPinch: !!opts.pinch, zone: 'crown', r: 0.65 }, cfg);
    s = out.state;
    events.push(...out.events);
  }
  return { events, state: s };
}
const at = (evs: DetectorEvent[], type: DetectorEvent['type']) => evs.filter((e) => e.type === type).map((e) => e.t);

describe('temporal', () => {
  it('alerts after ~1500 ms of sustained presence', () => {
    const { events } = run((t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000);
    const [cand] = at(events, 'candidateStart');
    const [alert] = at(events, 'alertThresholdReached');
    expect(cand).toBeGreaterThanOrEqual(1000);
    expect(cand).toBeLessThan(1250); // EMA needs ~3 frames to cross 0.6
    expect(alert - cand).toBeGreaterThanOrEqual(1500);
    expect(alert - cand).toBeLessThan(1600);
  });
  it('uses the 800 ms dwell when mostly pinching', () => {
    const { events } = run((t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000, { pinch: true });
    const [cand] = at(events, 'candidateStart');
    const [alert] = at(events, 'alertThresholdReached');
    expect(alert - cand).toBeGreaterThanOrEqual(800);
    expect(alert - cand).toBeLessThan(900);
  });
  it('a short touch produces no alert (brief touch)', () => {
    const { events } = run((t) => (t >= 1000 && t < 1800 ? 0.9 : 0), 5000);
    expect(at(events, 'candidateStart')).toHaveLength(1);
    expect(at(events, 'alertThresholdReached')).toHaveLength(0);
    expect(at(events, 'handLeft')).toHaveLength(1);
  });
  it('gaps shorter than 300 ms do not reset the dwell timer', () => {
    // p drops to 0 for 1 frame (67 ms) → pSmooth dips 0.9→0.54 then recovers above 0.6 within 300 ms.
    const gap = (t: number) => t >= 1600 && t < 1667;
    const { events } = run((t) => (t >= 1000 && t < 5000 && !gap(t) ? 0.9 : 0), 8000);
    const [cand] = at(events, 'candidateStart');
    const [alert] = at(events, 'alertThresholdReached');
    expect(alert - cand).toBeLessThan(1600);
  });
  it('gaps longer than 300 ms restart the dwell timer', () => {
    const gap = (t: number) => t >= 1600 && t < 2000; // below candidateOn for > 300 ms but not below Off for 1 s
    const { events } = run((t) => (t >= 1000 && t < 6000 ? (gap(t) ? 0.45 : 0.9) : 0), 9000);
    const [cand] = at(events, 'candidateStart');
    const [alert] = at(events, 'alertThresholdReached');
    expect(alert - cand).toBeGreaterThan(2000);
    expect(at(events, 'handLeft').length).toBe(1);
  });
  it('hand left needs 1000 ms below candidateOff (hysteresis)', () => {
    const { events } = run((t) => (t >= 1000 && t < 4000 ? 0.9 : 0), 8000);
    const [left] = events.filter((e) => e.type === 'handLeft') as Extract<DetectorEvent, { type: 'handLeft' }>[];
    expect(left.t - left.leftAt).toBeGreaterThanOrEqual(1000);
    expect(left.leftAt).toBeGreaterThan(4000);
    expect(left.leftAt).toBeLessThan(4300);
  });
  it('no new episode within the 5 s cooldown after an alerted episode', () => {
    // Episode 1: 1–4 s. Leaves ~5.3 s. Return at 7 s (inside cooldown) and stay.
    const { events } = run((t) => ((t >= 1000 && t < 4000) || t >= 7000 ? 0.9 : 0), 14000);
    const cands = at(events, 'candidateStart');
    const [left] = at(events, 'handLeft');
    expect(cands).toHaveLength(2);
    expect(cands[1] - left).toBeGreaterThanOrEqual(cfg.cooldownMs);
  });
  it('face missing: holds an ongoing episode up to 5 s, starts no new one', () => {
    const missing = (t: number) => t >= 2000 && t < 4000;
    const { events } = run((t) => (t >= 1000 && t < 6000 && !missing(t) ? 0.9 : 0), 9000, { faceMissingAt: missing });
    expect(at(events, 'handLeft')).toHaveLength(1);
    expect(at(events, 'handLeft')[0]).toBeGreaterThan(6000);
    const r2 = run((t) => (t >= 1000 ? 0.9 : 0), 5000, { faceMissingAt: () => true });
    expect(at(r2.events, 'candidateStart')).toHaveLength(0);
  });
});
