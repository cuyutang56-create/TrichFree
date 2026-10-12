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

/** Like run(), at any frame rate, with frames where the hand model found no hand at all. */
function runAt(fps: number, pAt: (t: number) => number, t1: number, opts: { handMissingAt?: (t: number) => boolean; pinch?: boolean } = {}) {
  let s = initialTemporal();
  const events: DetectorEvent[] = [];
  for (let k = 0; k * (1000 / fps) <= t1; k++) {
    const t = k * (1000 / fps);
    const missing = opts.handMissingAt?.(t) ?? false;
    const p = missing ? 0 : pAt(t);
    const out = temporalStep(s, { t, p, faceMissing: false, handMissing: missing, isPinch: !!opts.pinch, zone: p > 0 ? 'crown' : null, r: 0.65 }, cfg);
    s = out.state;
    events.push(...out.events);
  }
  return { events, state: s };
}

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
  it('slow computer (3 fps): the score reacts in the same wall-clock time and every reach completes', () => {
    const { events } = runAt(3, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000);
    const [cand] = at(events, 'candidateStart');
    const [alert] = at(events, 'alertThresholdReached');
    expect(cand).toBe(1000); // the first frame in the zone already crosses candidateOn (it took two frames before)
    expect(alert - cand).toBeGreaterThanOrEqual(cfg.dwellMs);
    expect(alert - cand).toBeLessThan(cfg.dwellMs + 1000 / 3 + 1);
  });
  it('slow computer (3 fps): one frame without a hand does not restart the dwell', () => {
    const smooth = runAt(3, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000);
    const missed = runAt(3, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000, { handMissingAt: (t) => Math.abs(t - 2000) < 1 });
    expect(at(missed.events, 'alertThresholdReached')).toEqual(at(smooth.events, 'alertThresholdReached'));
  });
  it('time after the hand has gone never completes a dwell (a 0.5 s touch at 3 fps stays quiet)', () => {
    const { events } = runAt(3, (t) => (t >= 1000 && t < 1500 ? 0.9 : 0), 6000, { pinch: true });
    expect(at(events, 'candidateStart')).toHaveLength(1);
    expect(at(events, 'alertThresholdReached')).toHaveLength(0);
  });
  it('hand hold: up to 0.4 s of missed hand detections mid-reach changes nothing', () => {
    const smooth = runAt(15, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000);
    const missed = runAt(15, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000, { handMissingAt: (t) => t > 1700 && t < 2000 });
    expect(at(missed.events, 'alertThresholdReached')).toEqual(at(smooth.events, 'alertThresholdReached'));
  });
  it('hand hold is short: a hand gone for longer is treated as gone (dwell restarts, hand-left still fires)', () => {
    const smooth = runAt(15, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 9000);
    const gone = runAt(15, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 9000, { handMissingAt: (t) => t > 1700 && t < 2400 });
    expect(at(gone.events, 'alertThresholdReached')[0]).toBeGreaterThan(at(smooth.events, 'alertThresholdReached')[0] + 500);
    const left = runAt(15, (t) => (t >= 1000 && t < 4000 ? 0.9 : 0), 8000, { handMissingAt: (t) => t >= 4000 });
    const [l] = left.events.filter((e) => e.type === 'handLeft') as Extract<DetectorEvent, { type: 'handLeft' }>[];
    expect(l.leftAt).toBeLessThan(4000 + cfg.handHoldMs + 200);
  });
  it('a hand seen outside every zone is real evidence, not a miss: no hold', () => {
    // p = 0 with a hand present (zone null, handMissing false) for 0.4 s restarts the dwell, as before.
    const smooth = runAt(15, (t) => (t >= 1000 && t < 5000 ? 0.9 : 0), 8000);
    const away = runAt(15, (t) => (t >= 1000 && t < 5000 && !(t > 1700 && t < 2100) ? 0.9 : 0), 8000);
    expect(at(away.events, 'alertThresholdReached')[0]).toBeGreaterThan(at(smooth.events, 'alertThresholdReached')[0]);
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
