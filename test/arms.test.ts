import { describe, expect, it } from 'vitest';
import { localDate, permutedBlock, pilotDay, randomisedArm, resolveArm } from '../src/core/arms';

const day = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();

describe('arms', () => {
  it('pilot day is by local calendar date, day 1 = enrolment', () => {
    expect(pilotDay('2026-10-01', day('2026-10-01', 23))).toBe(1);
    expect(pilotDay('2026-10-01', day('2026-10-02', 0))).toBe(2);
    expect(pilotDay('2026-10-01', day('2026-10-14'))).toBe(14);
    expect(localDate(day('2026-10-03'))).toBe('2026-10-03');
  });
  it('days 1–3 are SILENT regardless of output mode', () => {
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      for (const outputMode of ['speakers', 'chime_only'] as const) {
        const r = resolveArm({ outputMode, now: day(d), pilot: { code: 'TF-AB12', enrolledDate: '2026-10-01', nextIndex: 0 } });
        expect(r.arm).toBe('SILENT');
        expect(r.consumesIndex).toBe(false);
      }
    }
  });
  it('every block of 4 has exactly 2 CHIME and 2 VOICE', () => {
    for (const code of ['TF-AB12', 'TF-ZZ99', 'TF-0001']) {
      for (let b = 0; b < 50; b++) {
        const block = permutedBlock(code, b);
        expect(block.filter((x) => x === 'CHIME')).toHaveLength(2);
        expect(block.filter((x) => x === 'VOICE')).toHaveLength(2);
      }
    }
  });
  it('the same code gives the same sequence; different codes differ', () => {
    const seq = (c: string) => Array.from({ length: 40 }, (_, i) => randomisedArm(c, i)).join();
    expect(seq('TF-AB12')).toBe(seq('TF-AB12'));
    expect(seq('TF-AB12')).not.toBe(seq('TF-CD34'));
  });
  it('days 4–14 randomise; chime_only is FORCED_CHIME and does not consume a slot; after 14 → VOICE', () => {
    const pilot = { code: 'TF-AB12', enrolledDate: '2026-10-01', nextIndex: 5 };
    const r = resolveArm({ outputMode: 'speakers', now: day('2026-10-05'), pilot });
    expect(r.arm).toBe(randomisedArm('TF-AB12', 5));
    expect(r.consumesIndex).toBe(true);
    expect(r.pilotDay).toBe(5);
    expect(resolveArm({ outputMode: 'chime_only', now: day('2026-10-05'), pilot })).toMatchObject({ arm: 'FORCED_CHIME', consumesIndex: false });
    expect(resolveArm({ outputMode: 'speakers', now: day('2026-10-15'), pilot }).arm).toBe('VOICE');
  });
  it('non-pilot mode is always VOICE (unless output mode forces otherwise)', () => {
    expect(resolveArm({ outputMode: 'earbuds', now: 0 }).arm).toBe('VOICE');
    expect(resolveArm({ outputMode: 'silent_log', now: 0 }).arm).toBe('SILENT');
  });
});
