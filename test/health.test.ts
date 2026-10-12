import { describe, expect, it } from 'vitest';
import { AWAY_MS, PRESENT_MS, STALL_MS, STARTUP_GRACE_MS, deskHealth, idleMeansAway, isAway } from '../src/core/health';

describe('desk health', () => {
  it('is "starting" while models load, and a problem only after the grace period without any frame', () => {
    expect(deskHealth({ now: 30_000, attachedAt: 0, lastFrameAt: null, fps: 0, slowSince: null }).status).toBe('starting');
    expect(deskHealth({ now: STARTUP_GRACE_MS + 1, attachedAt: 0, lastFrameAt: null, fps: 0, slowSince: null })).toMatchObject({ status: 'problem', reason: 'no_frames' });
  });

  it('a slow-but-working computer (about 3 fps, as measured on a CPU-only runner) is "slow", never "problem"', () => {
    let slowSince: number | null = null;
    let status = '';
    for (let t = 100_000; t <= 300_000; t += 1000) {
      const h = deskHealth({ now: t, attachedAt: 0, lastFrameAt: t - 300, fps: 2.76, slowSince });
      slowSince = h.slowSince;
      status = h.status;
      expect(h.status).not.toBe('problem');
    }
    expect(status).toBe('slow');
  });

  it('frames that stop arriving are a stall', () => {
    expect(deskHealth({ now: 200_000, attachedAt: 0, lastFrameAt: 200_000 - STALL_MS - 1, fps: 15, slowSince: null })).toMatchObject({ status: 'problem', reason: 'stalled' });
  });

  it('lighter detection (8 fps target) running at its target is not "slow"; far below it is', () => {
    let slowSince: number | null = null;
    let status = '';
    for (let t = 100_000; t <= 130_000; t += 1000) ({ slowSince, status } = deskHealth({ now: t, attachedAt: 0, lastFrameAt: t - 100, fps: 7.7, slowSince, targetFps: 8 }));
    expect(status).toBe('watching');
    slowSince = null;
    for (let t = 100_000; t <= 130_000; t += 1000) ({ slowSince, status } = deskHealth({ now: t, attachedAt: 0, lastFrameAt: t - 300, fps: 3, slowSince, targetFps: 8 }));
    expect(status).toBe('slow');
  });

  it('a short dip is not "slow"', () => {
    const h = deskHealth({ now: 105_000, attachedAt: 0, lastFrameAt: 104_900, fps: 5, slowSince: 100_000 });
    expect(h.status).toBe('watching');
  });
});

describe('presence', () => {
  it('stops after a long time with nobody in view', () => {
    expect(isAway(AWAY_MS - 10, 5, 5)).toBe(false);
    expect(isAway(5 + AWAY_MS + 1, undefined, 5)).toBe(true); // never saw a face since starting
    expect(isAway(1_000_000 + AWAY_MS + 1, 1_000_000, 0)).toBe(true);
    expect(isAway(1_000_000 + AWAY_MS - 1, 1_000_000, 0)).toBe(false);
  });
  it('keyboard idle while a face is in view (e.g. watching a lecture) is not "away"', () => {
    expect(idleMeansAway(1_000_000, 1_000_000 - 30_000)).toBe(false);
    expect(idleMeansAway(1_000_000, 1_000_000 - PRESENT_MS - 1)).toBe(true);
    expect(idleMeansAway(1_000_000, undefined)).toBe(true);
  });
});
