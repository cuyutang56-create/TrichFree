// Aggregates local records into per-day stats for streaks, XP and quests.
import { localDate } from '../core/arms';
import { emptyDay, levelOf, questsFor, streakOf, totalXp, type DayStat } from '../core/gamify';
import { db, getSettings, setSettings, type AppSettings } from './db';

export async function loadDays(sinceDays = 120): Promise<Record<string, DayStat>> {
  const since = Date.now() - sinceDays * 86_400_000;
  const [sessions, episodes, events, s] = await Promise.all([
    db.sessions.where('startedAt').aboveOrEqual(since).toArray(),
    db.episodes.where('startedAt').aboveOrEqual(since).toArray(),
    db.events.where('t').aboveOrEqual(since).toArray(),
    getSettings(),
  ]);
  const days: Record<string, DayStat> = {};
  const get = (t: number) => (days[localDate(t)] ??= emptyDay(localDate(t)));
  for (const x of sessions) { const d = get(x.startedAt); d.deskMinutes += x.deskMinutes || 0; d.sessions++; }
  for (const e of episodes) if (e.outcome === 'interrupted' || e.outcome === 'interrupted_after_2') get(e.startedAt).catches++;
  for (const e of events) {
    if (e.type === 'manual_pull' || e.type === 'false_alarm') get(e.t).honest++;
    if (e.type === 'checkin') get(e.t).checkins++;
  }
  for (const [date, n] of Object.entries(s.squeezes ?? {})) (days[date] ??= emptyDay(date)).squeezes += n;
  return days;
}

export interface Progress {
  today: DayStat;
  days: Record<string, DayStat>;
  streak: ReturnType<typeof streakOf>;
  xp: number;
  level: ReturnType<typeof levelOf>;
  quests: ReturnType<typeof questsFor>;
}

export async function loadProgress(s?: AppSettings): Promise<Progress> {
  const settings = s ?? (await getSettings());
  const days = await loadDays();
  const todayKey = localDate(Date.now());
  const today = days[todayKey] ?? emptyDay(todayKey);
  const xp = totalXp(days, settings.dailyGoalMinutes);
  return { today, days, streak: streakOf(days, todayKey), xp, level: levelOf(xp), quests: questsFor(today, settings.dailyGoalMinutes) };
}

let pending = 0;
let timer: number | undefined;
/** Squeezes are counted in memory and flushed every 2 s (no write per squeeze). */
export function addSqueeze() {
  pending++;
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    const n = pending; pending = 0;
    const s = await getSettings();
    const key = localDate(Date.now());
    await setSettings({ squeezes: { ...s.squeezes, [key]: (s.squeezes?.[key] ?? 0) + n } });
  }, 2000);
}
