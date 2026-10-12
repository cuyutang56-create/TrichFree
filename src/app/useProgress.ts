import { useCallback, useEffect, useState } from 'react';
import type { AppSettings } from '../shared/db';
import { onDeskChange } from '../shared/messages';
import { loadProgress, type Progress } from '../shared/progress';

/** Streak, XP, level and quests, refreshed when desk state changes and every 30 s. */
export function useProgress(settings: AppSettings) {
  const [p, setP] = useState<Progress | null>(null);
  const reload = useCallback(() => { void loadProgress(settings).then(setP); }, [settings]);
  useEffect(() => {
    reload();
    const off = onDeskChange(() => reload());
    const t = setInterval(reload, 30_000);
    return () => { off(); clearInterval(t); };
  }, [reload]);
  /** Optimistic local bump (squeezes are flushed to storage every 2 s). */
  const bumpSqueeze = useCallback(() => setP((cur) => cur && {
    ...cur,
    today: { ...cur.today, squeezes: cur.today.squeezes + 1 },
    quests: cur.quests.map((q) => q.id === 'squeeze' ? { ...q, progress: Math.min(q.target, q.progress + 1), done: q.progress + 1 >= q.target } : q),
  }), []);
  return { progress: p, reload, bumpSqueeze };
}
