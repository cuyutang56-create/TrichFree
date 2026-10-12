// Gamification rules (pure). The streak rewards SHOWING UP (desk time), never "pull-free" days:
// a pull-free streak breaks on one hard day, and that shame is the main reason people quit.

export interface DayStat {
  date: string; // YYYY-MM-DD, local
  deskMinutes: number;
  sessions: number;
  catches: number; // hand came down after an alert
  honest: number; // "I just pulled" / "Not a pull" taps: honesty is rewarded
  checkins: number; // end-of-session mood check-ins
  squeezes: number; // squeezes of Mochi (practising the hands' plan B)
}

export const SHOW_UP_MINUTES = 10;
export const MAX_FREEZES = 2;
export const SQUEEZE_GOAL = 30;

export const emptyDay = (date: string): DayStat => ({ date, deskMinutes: 0, sessions: 0, catches: 0, honest: 0, checkins: 0, squeezes: 0 });

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export const showedUp = (d?: DayStat) => !!d && d.deskMinutes >= SHOW_UP_MINUTES;

export interface Streak { current: number; best: number; todayDone: boolean; freezes: number; frozenDates: string[] }

/**
 * Walk from the first recorded day to today. Every 7 counted days in a row earn a freeze (max 2);
 * a missed day spends a freeze instead of breaking the streak. Today never breaks it: it only extends it.
 */
export function streakOf(days: Record<string, DayStat>, today: string): Streak {
  const dates = Object.keys(days).filter((d) => d <= today).sort();
  let current = 0, best = 0, run = 0, freezes = 0;
  const frozenDates: string[] = [];
  if (dates.length) {
    for (let d = dates[0]; d < today; d = addDays(d, 1)) {
      if (showedUp(days[d])) {
        current++; run++;
        if (run % 7 === 0 && freezes < MAX_FREEZES) freezes++;
      } else if (current > 0 && freezes > 0) {
        freezes--; frozenDates.push(d);
      } else {
        current = 0; run = 0;
      }
      best = Math.max(best, current);
    }
  }
  const todayDone = showedUp(days[today]);
  if (todayDone) { current++; best = Math.max(best, current); }
  return { current, best, todayDone, freezes, frozenDates };
}

export interface Quest { id: 'sit' | 'squeeze' | 'checkin'; title: string; progress: number; target: number; done: boolean; xp: number }

export function questsFor(day: DayStat, goalMinutes: number): Quest[] {
  const q = (id: Quest['id'], title: string, progress: number, target: number, xp: number): Quest =>
    ({ id, title, progress: Math.min(progress, target), target, done: progress >= target, xp });
  return [
    q('sit', `Sit with Mochi for ${goalMinutes} minutes`, Math.floor(day.deskMinutes), goalMinutes, 20),
    q('squeeze', `Squeeze Mochi ${SQUEEZE_GOAL} times (your hands' plan B)`, day.squeezes, SQUEEZE_GOAL, 10),
    q('checkin', 'Tell Mochi how a session felt', day.checkins, 1, 10),
  ];
}

/** XP for one day. Catches and honesty earn the most; time at the desk earns steadily. */
export function xpForDay(day: DayStat, goalMinutes: number): number {
  const quests = questsFor(day, goalMinutes).filter((q) => q.done).reduce((s, q) => s + q.xp, 0);
  return Math.floor(day.deskMinutes) + 10 * day.catches + 5 * day.honest + 2 * day.checkins + Math.floor(day.squeezes / 10) + quests;
}

export const totalXp = (days: Record<string, DayStat>, goalMinutes: number) =>
  Object.values(days).reduce((s, d) => s + xpForDay(d, goalMinutes), 0);

/** Levels are mochi flavours: each level unlocks a new look for Mochi (cosmetic, like Duo's outfits). */
export const FLAVOURS = [
  { name: 'Plain', xp: 0, body: '#F4F1E8', blush: '#F6B8C8' },
  { name: 'Matcha', xp: 150, body: '#C9E27A', blush: '#F3A6B8' },
  { name: 'Strawberry', xp: 400, body: '#FFB3C7', blush: '#F27A9A' },
  { name: 'Mango', xp: 800, body: '#FFD36B', blush: '#F59A7A' },
  { name: 'Taro', xp: 1400, body: '#C9B4F2', blush: '#F2A1C8' },
  { name: 'Black sesame', xp: 2200, body: '#8E8A99', blush: '#E59AB0' },
  { name: 'Golden', xp: 3200, body: '#FFC93C', blush: '#F28C6B' },
] as const;
export type Flavour = (typeof FLAVOURS)[number];

export function levelOf(xp: number) {
  let i = 0;
  while (i + 1 < FLAVOURS.length && xp >= FLAVOURS[i + 1].xp) i++;
  const cur = FLAVOURS[i], next = FLAVOURS[i + 1];
  return {
    level: i + 1, flavour: cur, next: next ?? null,
    progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}
