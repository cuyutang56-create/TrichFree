import { describe, expect, it } from 'vitest';
import { initialEngine, reduce, type Effect, type EngineContext, type EngineEvent, type EngineState, type EnginePhase } from '../src/core/engine';
import type { Arm, ClipMeta, EpisodeStats } from '../src/core/types';

const stats: EpisodeStats = { zone: 'crown', pinchFraction: 0.5, rMedian: 0.65, pSmoothMax: 0.9 };
const clips: ClipMeta[] = [
  { id: 'n', category: 'notice', createdAt: 1, playCount: 0 },
  { id: 'i', category: 'instead', createdAt: 2, playCount: 0 },
  { id: 'r', category: 'reason', createdAt: 3, playCount: 0 },
  { id: 'c', category: 'compassion', createdAt: 4, playCount: 0 },
];
function ctx(arm: Arm = 'VOICE', followUp = true): EngineContext {
  let n = 0;
  return { sessionId: 's', decideArm: () => ({ arm }), clips, checkMs: 10000, cooldownMs: 5000, followUp, chimeMs: 400, chimeToClipGapMs: 250, newId: () => `e${++n}` };
}

class Harness {
  s: EngineState = initialEngine();
  effects: Effect[] = [];
  now = 0;
  constructor(public c: EngineContext = ctx()) {}
  send(ev: EngineEvent, now: number) { this.now = now; const o = reduce(this.s, ev, now, this.c); this.s = o.state; this.effects.push(...o.effects); return this; }
  get phase() { return this.s.phase; }
  episodes() { return this.effects.flatMap((e) => (e.type === 'logEpisode' ? [e.episode] : [])); }
  plays() { return this.effects.filter((e) => e.type === 'play'); }
  // Drive to a given phase
  to(phase: EnginePhase) {
    this.send({ type: 'candidateStart', t: 0, zone: 'crown' }, 0);
    if (phase === 'CANDIDATE') return this;
    this.send({ type: 'alertThresholdReached', t: 1500, stats }, 1500);
    if (phase === 'ALERT_1') return this;
    this.send({ type: 'tick', t: 11500 }, 11500);
    if (phase === 'ALERT_2') return this;
    this.send({ type: 'tick', t: 21500 }, 21500);
    if (phase === 'PERSIST') return this;
    this.send({ type: 'handLeft', t: 22000, leftAt: 21800, stats }, 22000);
    return this;
  }
}

describe('engine', () => {
  it('IDLE → CANDIDATE → IDLE on handLeft before dwell (brief_touch, no alert)', () => {
    const h = new Harness().to('CANDIDATE').send({ type: 'handLeft', t: 800, leftAt: 700, stats }, 800);
    expect(h.phase).toBe('IDLE');
    expect(h.episodes()[0].outcome).toBe('brief_touch');
    expect(h.episodes()[0].arm).toBe(null);
    expect(h.plays()).toHaveLength(0);
  });
  it('CANDIDATE → ALERT_1 plays chime then own-voice clip after 400 + 250 ms', () => {
    const h = new Harness().to('ALERT_1');
    expect(h.phase).toBe('ALERT_1');
    expect(h.plays()).toEqual([{ type: 'play', sound: 'chime' }, { type: 'play', sound: 'clip', clipId: 'n', delayMs: 650 }]);
    expect(h.effects.some((e) => e.type === 'notifyAlert')).toBe(true);
  });
  it('ALERT_1 → COOLDOWN when the hand leaves within checkMs (interrupted)', () => {
    const h = new Harness().to('ALERT_1').send({ type: 'handLeft', t: 5000, leftAt: 4000, stats }, 5000);
    expect(h.phase).toBe('COOLDOWN');
    const ep = h.episodes()[0];
    expect(ep.outcome).toBe('interrupted');
    expect(ep.secondsToHandDown).toBeCloseTo(2.5);
    expect(h.effects.some((e) => e.type === 'closeNotify')).toBe(true);
  });
  it('ALERT_1 → ALERT_2 after checkMs; plays the next clip from the ALERT_2 set', () => {
    const h = new Harness().to('ALERT_2');
    expect(h.phase).toBe('ALERT_2');
    const last = h.plays().at(-1)!;
    expect(last).toMatchObject({ sound: 'clip', delayMs: 0 });
    expect(['r', 'i', 'c']).toContain((last as { clipId: string }).clipId);
  });
  it('ALERT_2 → COOLDOWN on handLeft (interrupted_after_2)', () => {
    const h = new Harness().to('ALERT_2').send({ type: 'handLeft', t: 13000, leftAt: 12500, stats }, 13000);
    expect(h.episodes()[0].outcome).toBe('interrupted_after_2');
    expect(h.phase).toBe('COOLDOWN');
  });
  it('ALERT_2 → PERSIST (no more sound) → COOLDOWN (not_interrupted)', () => {
    const h = new Harness().to('PERSIST');
    expect(h.phase).toBe('PERSIST');
    const plays = h.plays().length;
    h.send({ type: 'tick', t: 40000 }, 40000);
    expect(h.plays().length).toBe(plays);
    h.send({ type: 'handLeft', t: 41000, leftAt: 40000, stats }, 41000);
    expect(h.episodes()[0].outcome).toBe('not_interrupted');
  });
  it('COOLDOWN → IDLE after cooldownMs, ignoring detector events meanwhile', () => {
    const h = new Harness().to('COOLDOWN');
    h.send({ type: 'candidateStart', t: 23000, zone: 'crown' }, 23000);
    expect(h.phase).toBe('COOLDOWN');
    h.send({ type: 'tick', t: 27000 }, 27000);
    expect(h.phase).toBe('IDLE');
  });
  it('CHIME arm: chime at both alerts, never a clip', () => {
    const h = new Harness(ctx('CHIME')).to('ALERT_2');
    expect(h.plays()).toEqual([{ type: 'play', sound: 'chime' }, { type: 'play', sound: 'chime' }]);
  });
  it('SILENT arm: no sound and no on-screen cue (pilot baseline / "off"), still logged', () => {
    const h = new Harness(ctx('SILENT')).to('COOLDOWN');
    expect(h.plays()).toHaveLength(0);
    expect(h.effects.filter((e) => e.type === 'notifyAlert')).toHaveLength(0);
    expect(h.episodes()[0].arm).toBe('SILENT');
  });
  it('VISUAL arm: never a sound; an on-screen cue at ALERT_1 and one follow-up at ALERT_2', () => {
    const h = new Harness(ctx('VISUAL')).to('PERSIST');
    expect(h.plays()).toHaveLength(0);
    expect(h.effects.filter((e) => e.type === 'notifyAlert').map((e) => (e as { alertNo: number }).alertNo)).toEqual([1, 2]);
  });
  it('follow-up off: one cue, then quiet until the hand leaves', () => {
    const h = new Harness(ctx('VOICE', false)).to('ALERT_1');
    const plays = h.plays().length;
    h.send({ type: 'tick', t: 11500 }, 11500);
    expect(h.phase).toBe('PERSIST');
    for (let t = 12000; t <= 60000; t += 1000) h.send({ type: 'tick', t }, t);
    expect(h.plays().length).toBe(plays);
    h.send({ type: 'handLeft', t: 61000, leftAt: 60500, stats }, 61000);
    expect(h.episodes()[0].outcome).toBe('not_interrupted');
  });
  it('a continuous gesture gets at most two cues, however long it lasts (no alert loop)', () => {
    for (const followUp of [true, false]) {
      const h = new Harness(ctx('CHIME', followUp)).to('ALERT_1');
      for (let t = 2000; t <= 300_000; t += 250) h.send({ type: 'tick', t }, t);
      expect(h.plays().length).toBe(followUp ? 2 : 1);
      expect(h.effects.filter((e) => e.type === 'notifyAlert')).toHaveLength(1);
    }
  });
  it('never repeats the previous clip', () => {
    const h = new Harness().to('ALERT_2');
    const ids = h.plays().flatMap((p) => (p.sound === 'clip' ? [p.clipId] : []));
    expect(ids[0]).not.toBe(ids[1]);
  });
  it('with one recorded line, every reminder in a session plays it, not only the first (regression)', () => {
    // Onboarding records a single line. The no-repeat rule is for the follow-up within one episode; it must not
    // silence the voice for every later episode of the session.
    const one: ClipMeta[] = [{ id: 'mine', category: 'notice', createdAt: 1, playCount: 0 }];
    const h = new Harness({ ...ctx('VOICE', false), clips: one });
    for (let k = 0; k < 3; k++) {
      const t0 = k * 100_000;
      h.send({ type: 'candidateStart', t: t0, zone: 'crown' }, t0);
      h.send({ type: 'alertThresholdReached', t: t0 + 1500, stats }, t0 + 1500);
      h.send({ type: 'handLeft', t: t0 + 3000, leftAt: t0 + 2900, stats }, t0 + 3000);
      h.send({ type: 'tick', t: t0 + 60_000 }, t0 + 60_000); // quiet time over
    }
    const clipsPlayed = h.plays().filter((p) => p.sound === 'clip').map((p) => (p as { clipId: string }).clipId);
    expect(clipsPlayed).toEqual(['mine', 'mine', 'mine']);
  });

  const states: EnginePhase[] = ['IDLE', 'CANDIDATE', 'ALERT_1', 'ALERT_2', 'PERSIST', 'COOLDOWN'];
  for (const st of states) {
    it(`"Not a pull" in ${st}`, () => {
      const h = st === 'IDLE' ? new Harness() : new Harness().to(st);
      const before = h.episodes().length;
      const t = h.now + 100;
      h.send({ type: 'feedback', kind: 'not_a_pull', t }, t);
      const ev = h.effects.find((e) => e.type === 'logEvent' && e.eventType === 'false_alarm');
      expect(ev).toBeTruthy();
      if (['CANDIDATE', 'ALERT_1', 'ALERT_2', 'PERSIST'].includes(st)) {
        expect(h.phase).toBe('COOLDOWN');
        expect(h.episodes().at(-1)!.outcome).toBe('false_alarm');
      } else {
        expect(h.episodes().length).toBe(before);
        expect(h.phase).toBe(st);
      }
    });
    it(`"I just pulled" in ${st}`, () => {
      const h = st === 'IDLE' ? new Harness() : new Harness().to(st);
      const t = h.now + 100;
      h.send({ type: 'feedback', kind: 'i_pulled', t }, t);
      const ev = h.effects.find((e) => e.type === 'logEvent' && e.eventType === 'manual_pull');
      const active = ['CANDIDATE', 'ALERT_1', 'ALERT_2', 'PERSIST'].includes(st);
      expect(ev).toMatchObject({ missed: !active });
      expect(h.phase).toBe(st);
      if (active) {
        h.send({ type: 'handLeft', t: t + 400, leftAt: t + 100, stats }, t + 400);
        expect(h.episodes().at(-1)!.pulledDuring).toBe(true);
      }
    });
  }
});
