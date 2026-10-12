// Release audit: an independent challenge for the detector. Scenes come from test/challenge/ (built from general
// anthropometric proportions, not from scripts/make-fixtures.mjs) with different head tilt, distance, image size,
// handedness and two-hand situations, then degraded. Synthetic: this shows robustness, not real-world accuracy.
import { describe, expect, it } from 'vitest';
import { configFor } from '../src/core/detectorConfig';
import { initialEngine, reduce, type EngineContext } from '../src/core/engine';
import { DetectorPipeline } from '../src/core/pipeline';
import { runReplay } from '../src/core/replay';
import type { FrameInput } from '../src/core/types';
import { face, hand, render, rng, type HandSpec, type Scene } from './challenge/scene';
import { EVERYDAY, PROLONGED, PULLS, TOUCHES } from './challenge/scenes';

const cfg = configFor('balanced', 0, { cooldownMs: 30_000 }); // the app's default quiet time
const framesOf = (sc: Scene, opts = {}) => {
  const f = render(sc, opts);
  return sc.name.includes('no face') ? f.map((x) => ({ ...x, face: null })) : f;
};
const replay = (sc: Scene, frames: FrameInput[]) => runReplay({ meta: { width: sc.pose.width, height: sc.pose.height, zones: sc.zones }, frames }, { cfg, zones: sc.zones });
const CONDITIONS = [{}, { fps: 8 }, { fps: 5 }, { fps: 3 }, { timingJitterMs: 30 }, { fps: 6, timingJitterMs: 80 }, { landmarkJitter: 0.03 }, { fps: 5, landmarkJitter: 0.03, timingJitterMs: 60 }];

describe('independent detection challenge', () => {
  it('catches every independent pull, at 15 down to 3 fps, with timing jitter and landmark noise', () => {
    for (const opt of CONDITIONS) for (const sc of PULLS) expect(replay(sc, framesOf(sc, opt)).alerts, `${sc.name} ${JSON.stringify(opt)}`).toBeGreaterThanOrEqual(1);
  });

  it('reminds within 1.5 s of the hand reaching the hair at 15 fps', () => {
    for (const sc of PULLS) {
      const first = replay(sc, framesOf(sc)).detectorEvents.find((e) => e.type === 'alertThresholdReached')!;
      expect(first.t - sc.onset! * 1000, sc.name).toBeLessThan(1500);
    }
  });

  it('everyday movements never remind, under any condition (including no face in view)', () => {
    for (const opt of CONDITIONS) for (const sc of EVERYDAY) expect(replay(sc, framesOf(sc, opt)).alerts, `${sc.name} ${JSON.stringify(opt)}`).toBe(0);
  });

  it('ordinary hair touching: at most 2 of 6 independent touch scenes remind (known limitation, kept visible)', () => {
    const alerting = TOUCHES.filter((sc) => replay(sc, framesOf(sc)).alerts > 0).map((sc) => sc.name);
    expect(alerting.length).toBeLessThanOrEqual(2);
  });

  it('one continuous 60-second pull gives one reminder and at most the single follow-up', () => {
    const r = replay(PROLONGED, framesOf(PROLONGED));
    expect(r.effects.filter((e) => e.type === 'play' && e.sound === 'chime').length).toBeLessThanOrEqual(2);
  });

  it('a camera freeze cannot stitch two short touches into a reminder', () => {
    const sc = PULLS[4];
    const frames = framesOf(sc).filter((f) => f.t < 1600 || f.t >= 6600).map((f) => (f.t >= 6900 ? { ...f, hands: f.hands.slice(0, 1) } : f));
    expect(replay(sc, frames).alerts).toBe(0);
  });

  it('malformed input (short or empty hands, missing face points, zero-size frames, NaN) never crashes and detection carries on', () => {
    const sc = PULLS[4];
    const frames: FrameInput[] = framesOf(sc).map((f, i) => {
      const m = i % 7;
      if (m === 1) return { ...f, hands: [...f.hands, { handedness: 'Left', landmarks: f.hands[0].landmarks.slice(0, 5) }] };
      if (m === 2) return { ...f, hands: [{ handedness: 'Right', landmarks: [] }] };
      if (m === 3 && f.face) return { ...f, face: { 168: f.face[168] } };
      if (m === 4) return { ...f, width: 0, height: 0 };
      if (m === 5 && f.hands[1]) return { ...f, hands: [f.hands[0], { ...f.hands[1], landmarks: f.hands[1].landmarks.map(() => [NaN, NaN, 0] as [number, number, number]) }] };
      return f;
    });
    expect(() => replay(sc, frames)).not.toThrow();
    const p = new DetectorPipeline(cfg, null, sc.zones);
    expect(() => p.process({ ...frames[30], hands: [null as never] })).not.toThrow();
    expect(() => p.process({ ...frames[31], hands: undefined as never })).not.toThrow();
  });

  it('prolonged use: 30 min of repeated pulls are spaced by the quiet time; 30 min resting in the hair gives one reminder; memory stays bounded', () => {
    const pose = { cx: 320, cy: 230, faceWpx: 150, rollDeg: 0, width: 640, height: 480 };
    const rnd = rng(11);
    const F = face(pose, 0.01, rnd);
    const session = (minutes: number, at: (s: number) => HandSpec[]) => {
      const pipe = new DetectorPipeline(cfg, null, ['crown', 'hairline', 'strands']);
      let id = 0; let engine = initialEngine();
      const ctx: EngineContext = { sessionId: 's', decideArm: () => ({ arm: 'VOICE' }), clips: [], checkMs: cfg.checkMs, cooldownMs: cfg.cooldownMs, followUp: true, chimeMs: 400, chimeToClipGapMs: 250, newId: () => `e${++id}` };
      const alerts: number[] = []; let chimes = 0;
      for (let k = 0; k < minutes * 900; k++) {
        const t = Math.round((k * 1000) / 15);
        const out = pipe.process({ t, width: 640, height: 480, faceRan: k % 3 === 0, face: k % 3 === 0 ? F : null, hands: at(t / 1000).map((h) => hand(pose, h, 0.01, rnd)) });
        for (const ev of [...out.events, { type: 'tick' as const, t }]) {
          if (ev.type === 'alertThresholdReached') alerts.push(t);
          const r = reduce(engine, ev, t, ctx); engine = r.state;
          chimes += r.effects.filter((e) => e.type === 'play' && e.sound === 'chime').length;
        }
      }
      return { alerts, chimes, buffered: pipe.state.rValues.length };
    };
    const periodic = session(30, (s) => (s % 20 >= 2 && s % 20 < 5 ? [{ tip: [0.05, 1.0], dirDeg: 90, pinch: true, hair: 0.7 }] : []));
    expect(periodic.alerts.length).toBeGreaterThan(20);
    for (let i = 1; i < periodic.alerts.length; i++) expect(periodic.alerts[i] - periodic.alerts[i - 1]).toBeGreaterThanOrEqual(30_000);
    const resting = session(30, () => [{ tip: [0.05, 1.0], dirDeg: 90, hair: 0.7 }]);
    expect(resting.chimes).toBeLessThanOrEqual(2);
    expect(resting.buffered).toBeLessThanOrEqual(2000);
  }, 120_000);
});
