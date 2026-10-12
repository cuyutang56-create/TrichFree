import { describe, expect, it } from 'vitest';
import { addDays, emptyDay, levelOf, questsFor, streakOf, totalXp, type DayStat } from '../src/core/gamify';
import { mochiSays } from '../src/shared/mochi';

const day = (date: string, mins: number, extra: Partial<DayStat> = {}): DayStat => ({ ...emptyDay(date), deskMinutes: mins, ...extra });
function days(start: string, minutes: number[]): Record<string, DayStat> {
  const out: Record<string, DayStat> = {};
  minutes.forEach((m, i) => { const d = addDays(start, i); out[d] = day(d, m); });
  return out;
}

describe('streak (showing up, not pull-free)', () => {
  it('counts consecutive days with ≥ 10 desk minutes; today only extends', () => {
    const d = days('2026-10-01', [20, 15, 30, 0]);
    expect(streakOf(d, '2026-10-04')).toMatchObject({ current: 3, todayDone: false });
    d['2026-10-04'].deskMinutes = 12;
    expect(streakOf(d, '2026-10-04')).toMatchObject({ current: 4, todayDone: true });
  });
  it('a missed day without a freeze resets', () => {
    expect(streakOf(days('2026-10-01', [20, 0, 20, 20]), '2026-10-05').current).toBe(2);
  });
  it('7 days in a row earn a freeze that saves one missed day', () => {
    const d = days('2026-10-01', [20, 20, 20, 20, 20, 20, 20, 0, 20]);
    const s = streakOf(d, '2026-10-10');
    expect(s.frozenDates).toEqual(['2026-10-08']);
    expect(s.current).toBe(8);
    expect(s.freezes).toBe(0);
  });
  it('pulling never affects the streak', () => {
    const d = days('2026-10-01', [20, 20]);
    d['2026-10-02'].honest = 9;
    expect(streakOf(d, '2026-10-03').current).toBe(2);
  });
});

describe('xp, levels, quests', () => {
  it('rewards catches and honesty', () => {
    const d = { '2026-10-01': day('2026-10-01', 30, { catches: 2, honest: 1 }) };
    expect(totalXp(d, 30)).toBe(30 + 20 + 5 + 20); // minutes + catches + honesty + 'sit' quest
  });
  it('levels are mochi flavours', () => {
    expect(levelOf(0).flavour.name).toBe('Plain');
    expect(levelOf(150).flavour.name).toBe('Matcha');
    expect(levelOf(275).progress).toBeCloseTo(0.5);
    expect(levelOf(99999).next).toBeNull();
  });
  it('daily quests track progress', () => {
    const q = questsFor(day('2026-10-01', 12, { squeezes: 40 }), 30);
    expect(q.map((x) => [x.id, x.done])).toEqual([['sit', false], ['squeeze', true], ['checkin', false]]);
  });
});

describe('Mochi', () => {
  it('is never sassy about a pull', () => {
    expect(mochiSays('afterPull', 'playful')).toBe(mochiSays('afterPull', 'gentle'));
  });
  it('fills in the streak', () => {
    expect(mochiSays('reminder', 'playful', { streak: 7 }, 0)).toContain('7-day');
  });
});
