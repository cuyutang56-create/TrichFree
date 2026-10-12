import type { AppSettings } from '../../shared/db';
import type { Progress } from '../../shared/progress';
import { IconFlame, IconSnow } from './Icons';
import { Mochi } from './Mochi';

export function SideStats({ settings, progress: p }: { settings: AppSettings; progress: Progress | null }) {
  if (!p) return null;
  const goal = settings.dailyGoalMinutes;
  const mins = Math.floor(p.today.deskMinutes);
  const pct = Math.min(1, mins / goal);
  const R = 34, C = 2 * Math.PI * R;
  return (
    <>
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="statline"><IconFlame color={p.streak.todayDone ? '#ff8a3d' : '#c9c4b5'} />{p.streak.current} day streak</div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {p.streak.todayDone ? 'You showed up today. Streak safe.' : `Sit for 10 minutes today to ${p.streak.current ? 'keep' : 'start'} it.`}
        </p>
        {p.streak.freezes > 0 && <p className="small" style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 18, height: 18, color: 'var(--lilac-deep)' }}><IconSnow /></span>{p.streak.freezes} streak freeze{p.streak.freezes > 1 ? 's' : ''} ready</p>}
      </div>
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Mochi size={64} float={false} body={p.level.flavour.body} blush={p.level.flavour.blush} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{p.level.flavour.name} Mochi</div>
            <div className="small muted">Level {p.level.level} · {p.xp} XP</div>
          </div>
        </div>
        <div className="meter" style={{ marginTop: 10 }}><div style={{ width: `${Math.round(p.level.progress * 100)}%` }} /></div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>{p.level.next ? `${p.level.toNext} XP to ${p.level.next.name}` : 'Every flavour unlocked.'}</p>
      </div>
      <div className="card row" style={{ marginBottom: 0, flexWrap: 'nowrap' }}>
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--lime-deep)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 42 42)" />
          <text x="42" y="47" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)">{mins}</text>
        </svg>
        <div><div style={{ fontWeight: 700 }}>Daily goal</div><div className="small muted">{mins >= goal ? `Goal of ${goal} min reached ✓` : `${mins} of ${goal} desk minutes`}</div></div>
      </div>
    </>
  );
}
