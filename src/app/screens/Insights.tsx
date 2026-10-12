import { useEffect, useState } from 'react';
import type { ScreenProps } from '../App';
import { localDate } from '../../core/arms';
import { FLAVOURS } from '../../core/gamify';
import type { Episode } from '../../core/types';
import { db, type EventRow, type SessionRow } from '../../shared/db';
import { loadProgress, type Progress } from '../../shared/progress';
import { BarChart } from '../components/BarChart';
import { Mochi } from '../components/Mochi';

interface Stats { deskMinutes: number; reminders: number; handDownPct: number | null; medianHandDown: number | null; pulls: number; notPull: number }

function summarise(eps: Episode[], sessions: SessionRow[], events: EventRow[]): Stats {
  const alerted = eps.filter((e) => e.alertAt != null && e.outcome !== 'false_alarm');
  const down = alerted.filter((e) => e.outcome === 'interrupted');
  const downs = alerted.map((e) => e.secondsToHandDown).filter((x): x is number => x != null).sort((a, b) => a - b);
  return {
    deskMinutes: sessions.reduce((s, x) => s + (x.deskMinutes || 0), 0),
    reminders: alerted.length,
    handDownPct: alerted.length ? (down.length / alerted.length) * 100 : null,
    medianHandDown: downs.length ? downs[Math.floor(downs.length / 2)] : null,
    pulls: events.filter((e) => e.type === 'manual_pull').length,
    notPull: events.filter((e) => e.type === 'false_alarm').length,
  };
}

export function Insights({ settings }: ScreenProps) {
  const [today, setToday] = useState<Stats | null>(null);
  const [week, setWeek] = useState<Stats | null>(null);
  const [bars, setBars] = useState<{ label: string; value: number | null }[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    (async () => {
      const dayStart = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset); return d.getTime(); };
      const since = dayStart(6);
      const [eps, sessions, events] = await Promise.all([
        db.episodes.where('startedAt').aboveOrEqual(since).toArray(),
        db.sessions.where('startedAt').aboveOrEqual(since).toArray(),
        db.events.where('t').aboveOrEqual(since).toArray(),
      ]);
      const t0 = dayStart(0);
      setToday(summarise(eps.filter((e) => e.startedAt >= t0), sessions.filter((s) => s.startedAt >= t0), events.filter((e) => e.t >= t0)));
      setWeek(summarise(eps, sessions, events));
      setBars(Array.from({ length: 7 }, (_, k) => {
        const s = dayStart(6 - k), e = s + 86_400_000;
        const st = summarise(eps.filter((x) => x.startedAt >= s && x.startedAt < e), sessions.filter((x) => x.startedAt >= s && x.startedAt < e), []);
        const hours = st.deskMinutes / 60;
        return { label: localDate(s) === localDate(Date.now()) ? 'Today' : new Date(s).toLocaleDateString([], { weekday: 'short' }), value: hours >= 0.05 ? st.reminders / hours : null };
      }));
      if (settings.companionEnabled) setProgress(await loadProgress(settings));
    })();
  }, [settings]);

  const Row = ({ title, s }: { title: string; s: Stats | null }) => (
    <section className="card" aria-labelledby={`ins-${title}`}>
      <h2 id={`ins-${title}`}>{title}</h2>
      {s && (
        <div className="stats">
          <div className="stat"><div className="n">{Math.round(s.deskMinutes)}</div><div className="l">minutes at the desk</div></div>
          <div className="stat"><div className="n">{s.reminders}</div><div className="l">reminders</div></div>
          <div className="stat"><div className="n">{s.handDownPct == null ? '–' : `${Math.round(s.handDownPct)}%`}</div><div className="l">hand came down within 10 s</div></div>
          <div className="stat"><div className="n">{s.medianHandDown == null ? '–' : `${s.medianHandDown.toFixed(1)} s`}</div><div className="l">typical time to hand down</div></div>
          <div className="stat"><div className="n">{s.pulls}</div><div className="l">“I just pulled” taps</div></div>
          <div className="stat"><div className="n">{s.notPull}</div><div className="l">“Not a pull” taps</div></div>
        </div>
      )}
    </section>
  );

  return (
    <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
      <h1>Insights</h1>
      <p className="muted">These numbers stay on this computer. They describe what TrichFree noticed, which is not the same as every pull: it can miss some movements and react to ordinary touches. Every number here is information, not a score.</p>
      <Row title="Today" s={today} />
      <Row title="Last 7 days" s={week} />
      <section className="card" aria-labelledby="ins-chart">
        <h2 id="ins-chart">Reminders per hour at the desk</h2>
        <p className="small muted">Days vary, and that is okay.</p>
        <BarChart data={bars} unit="reminders per desk hour" />
      </section>
      {settings.companionEnabled && progress && (
        <section className="card" aria-labelledby="ins-mochi">
          <h2 id="ins-mochi">Mochi flavours</h2>
          <p className="small muted">You earn points for showing up and for honest feedback, never for “pull-free” days. Each level unlocks a new look for Mochi. Current: {progress.level.flavour.name}, {progress.xp} points, {progress.streak.current}-day streak of showing up.</p>
          <div className="flavours">
            {FLAVOURS.map((f) => {
              const got = progress.xp >= f.xp;
              return (
                <div key={f.name} className="stat center" style={{ opacity: got ? 1 : 0.6 }}>
                  <div style={{ display: 'grid', placeItems: 'center' }}><Mochi size={72} float={false} mood={got ? 'happy' : 'sleepy'} body={got ? f.body : '#d8d4dd'} blush={got ? f.blush : '#d8d4dd'} alive={false} /></div>
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <div className="small muted">{got ? 'Unlocked' : `${f.xp} points`}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
