import { useEffect, useState } from 'react';
import type { ScreenProps } from '../App';
import { localDate } from '../../core/arms';
import type { Episode } from '../../core/types';
import { db, type EventRow, type SessionRow } from '../../shared/db';
import { BarChart } from '../components/BarChart';
import { Mochi } from '../components/Mochi';
import { FLAVOURS } from '../../core/gamify';

interface Stats { deskMinutes: number; detections: number; interruptedPct: number | null; medianHandDown: number | null; pulls: number; notPull: number }

function summarise(eps: Episode[], sessions: SessionRow[], events: EventRow[]): Stats {
  const alerted = eps.filter((e) => e.alertAt != null && e.outcome !== 'false_alarm');
  const interrupted = alerted.filter((e) => e.outcome === 'interrupted');
  const downs = alerted.map((e) => e.secondsToHandDown).filter((x): x is number => x != null).sort((a, b) => a - b);
  return {
    deskMinutes: sessions.reduce((s, x) => s + (x.deskMinutes || 0), 0),
    detections: alerted.length,
    interruptedPct: alerted.length ? (interrupted.length / alerted.length) * 100 : null,
    medianHandDown: downs.length ? downs[Math.floor(downs.length / 2)] : null,
    pulls: events.filter((e) => e.type === 'manual_pull').length,
    notPull: events.filter((e) => e.type === 'false_alarm').length,
  };
}

export function Progress({ progress: pr }: ScreenProps) {
  const xp = pr?.progress?.xp ?? 0;
  const [today, setToday] = useState<Stats | null>(null);
  const [week, setWeek] = useState<Stats | null>(null);
  const [bars, setBars] = useState<{ label: string; value: number | null }[]>([]);

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
        return { label: localDate(s) === localDate(Date.now()) ? 'Today' : new Date(s).toLocaleDateString([], { weekday: 'short' }), value: hours >= 0.05 ? st.detections / hours : null };
      }));
    })();
  }, []);

  const Row = ({ title, s }: { title: string; s: Stats | null }) => (
    <div className="card">
      <h2>{title}</h2>
      {s && (
        <div className="grid stats">
          <div className="stat"><div className="n">{Math.round(s.deskMinutes)}</div><div className="l">desk minutes</div></div>
          <div className="stat"><div className="n">{s.detections}</div><div className="l">detections</div></div>
          <div className="stat"><div className="n">{s.interruptedPct == null ? '–' : `${Math.round(s.interruptedPct)}%`}</div><div className="l">hands down within 10 s</div></div>
          <div className="stat"><div className="n">{s.medianHandDown == null ? '–' : `${s.medianHandDown.toFixed(1)} s`}</div><div className="l">typical time to hands down</div></div>
          <div className="stat"><div className="n">{s.pulls}</div><div className="l">"I just pulled"</div></div>
          <div className="stat"><div className="n">{s.notPull}</div><div className="l">"Not a pull"</div></div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <Row title="Today" s={today} />
      <Row title="Last 7 days" s={week} />
      <div className="card">
        <h2>Mochi flavours</h2>
        <p className="small muted">Every bit of XP comes from showing up, catching a reach, or being honest. Each level unlocks a new flavour.</p>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {FLAVOURS.map((f) => {
            const got = xp >= f.xp;
            return (
              <div key={f.name} className="stat center" style={{ opacity: got ? 1 : 0.55 }}>
                <div style={{ display: 'grid', placeItems: 'center', filter: got ? 'none' : 'grayscale(1)' }}><Mochi size={84} float={false} mood={got ? 'happy' : 'sleepy'} body={got ? f.body : '#d8d4c8'} blush={got ? f.blush : '#d8d4c8'} /></div>
                <div style={{ fontWeight: 700 }}>{f.name}</div>
                <div className="small muted">{got ? 'Unlocked' : `${f.xp} XP`}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card">
        <h2>Detections per desk hour</h2>
        <p className="small muted">Every bar is just information. Days vary, and that's okay.</p>
        <BarChart data={bars} unit="per desk hour" />
      </div>
    </div>
  );
}
