import { describe, expect, it } from 'vitest';
import { ALERT_CATEGORIES, pickClip } from '../src/core/clipPicker';
import type { ClipMeta } from '../src/core/types';

const clips: ClipMeta[] = [
  { id: 'n', category: 'notice', createdAt: 1, playCount: 0 },
  { id: 'd', category: 'need', createdAt: 2, playCount: 0 },
  { id: 'i', category: 'instead', createdAt: 3, playCount: 0 },
  { id: 'r', category: 'reason', createdAt: 4, playCount: 0 },
  { id: 'c', category: 'compassion', createdAt: 5, playCount: 0 },
];

describe('clipPicker', () => {
  it('respects categories per alert', () => {
    for (let k = 0; k < 20; k++) {
      expect(ALERT_CATEGORIES[1]).toContain(pickClip(clips, 1, undefined)!.category);
      expect(ALERT_CATEGORIES[2]).toContain(pickClip(clips, 2, undefined)!.category);
    }
    expect(pickClip(clips, 1)!.category).not.toBe('reason');
    expect(pickClip(clips, 2)!.category).not.toBe('notice');
  });
  it('never repeats the previous clip and rotates least-recently-played', () => {
    const lib = clips.map((c) => ({ ...c }));
    let last: string | undefined;
    const seen: string[] = [];
    for (let t = 1; t <= 30; t++) {
      const c = pickClip(lib, t % 2 ? 1 : 2, last)!;
      expect(c.id).not.toBe(last);
      c.lastPlayedAt = t; c.playCount++;
      last = c.id;
      seen.push(c.id);
    }
    expect(new Set(seen).size).toBe(5);
  });
  it('with a single clip it will not repeat, so returns undefined', () => {
    expect(pickClip([clips[0]], 1, 'n')).toBeUndefined();
    expect(pickClip([clips[0]], 2)!.id).toBe('n'); // fallback to any clip when the allowed set is empty
  });
});
