import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenProps } from '../App';
import { localDate } from '../../core/arms';
import { addDays, showedUp } from '../../core/gamify';
import { MIN_PER_CLASS } from '../../core/classifier';
import { db, uid, type SessionRow } from '../../shared/db';
import { send, type DeskState, type FeedbackKind } from '../../shared/messages';
import { mochiSays, type LineKind } from '../../shared/mochi';
import { EXIT_SURVEY_URL, pilotInfo } from '../../shared/pilot';
import { IconFlame, IconSnow } from '../components/Icons';
import { Mochi, type Mood } from '../components/Mochi';
import { OutputModeSwitch } from '../components/OutputModeSwitch';
import { Preview } from '../components/Preview';
import { StatusPill } from '../components/StatusPill';
import { useDesk } from '../useDesk';
import { useMochiShow } from '../useMochiShow';
import { LineRider } from '../components/LineRider';
import type { Progress } from '../../shared/progress';

const daySeed = () => Number(localDate(Date.now()).replace(/-/g, ''));
const alerting = (d: DeskState) => d.wanted && (d.phase === 'ALERT_1' || d.phase === 'ALERT_2');

export function Home({ settings, update, go, progress: pr }: ScreenProps) {
  const desk = useDesk();
  const p = pr?.progress ?? null;
  const tone = settings.mochiTone;
  const [said, setSaid] = useState<{ kind: LineKind; until: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [recap, setRecap] = useState<{ session: SessionRow; xp: number; catches: number } | null>(null);
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [toast, setToast] = useState('');
  const wasOn = useRef(desk.wanted);
  const [focusMin, setFocusMin] = useState(false); // focus room minimised to the dashboard
  const show = useMochiShow({ paused: alerting(desk) });

  // Celebrate wins: a hand that came down after an alert, a finished quest. Ride in when a session starts.
  const prevCaught = useRef(desk.today.interrupted);
  useEffect(() => {
    if (desk.today.interrupted > prevCaught.current) show.play('cheer', 'Yeahh!');
    prevCaught.current = desk.today.interrupted;
  }, [desk.today.interrupted, show.play]);
  const prevDone = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!p) return;
    const done = new Set(p.quests.filter((q) => q.done).map((q) => q.id));
    if (prevDone.current && [...done].some((id) => !prevDone.current!.has(id))) show.play('cheer', 'Quest done!');
    prevDone.current = done;
  }, [p, show.play]);
  // Ride only when a session really starts while you watch (not when the page opens on a running session).
  const prevOn = useRef<boolean | null>(null);
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (prevOn.current === false && desk.wanted && Date.now() - mountedAt.current > 1500) show.startRide('Let’s go!');
    prevOn.current = desk.wanted;
  }, [desk.wanted]);
  const onSqueeze = (n: number) => { pr?.bumpSqueeze(); if (n % 10 === 0) show.play('cheer', n % 30 === 0 ? 'Yeahh!!' : 'Yeahh!'); };
  useEffect(() => { if (!desk.wanted) setFocusMin(false); }, [desk.wanted]);
  const pilot = pilotInfo(settings);
  const flavour = p?.level.flavour;

  useEffect(() => { db.clips.orderBy('createdAt').last().then((c) => setRefresh(!!c && Date.now() - c.createdAt > 14 * 86_400_000)); }, []);

  // Session recap: shown once for the latest finished session.
  useEffect(() => {
    const check = async () => {
      const last = await db.sessions.orderBy('startedAt').last();
      if (!last?.endedAt || last.id === settings.lastRecapId || Date.now() - last.endedAt > 12 * 3_600_000) return;
      if (last.endedAt - last.startedAt < 2 * 60_000) return;
      const eps = await db.episodes.where('sessionId').equals(last.id).toArray();
      const evs = await db.events.where('sessionId').equals(last.id).toArray();
      const catches = eps.filter((e) => e.outcome === 'interrupted' || e.outcome === 'interrupted_after_2').length;
      const honest = evs.filter((e) => e.type === 'manual_pull' || e.type === 'false_alarm').length;
      setRecap({ session: last, catches, xp: Math.floor(last.deskMinutes) + 10 * catches + 5 * honest });
    };
    if (wasOn.current && !desk.wanted) setTimeout(check, 1500); // let desk mode finish writing the session
    else void check();
    wasOn.current = desk.wanted;
  }, [desk.wanted, settings.lastRecapId]);

  // New flavour unlocked?
  useEffect(() => {
    if (p && p.level.level > (settings.lastLevelSeen ?? 1)) setLevelUp(p.level.flavour.name);
  }, [p, settings.lastLevelSeen]);

  const fb = async (kind: FeedbackKind) => {
    await send({ target: 'sw', type: 'FEEDBACK', kind });
    setSaid({ kind: kind === 'i_pulled' ? 'afterPull' : 'afterNotPull', until: Date.now() + 6000 });
    if (kind === 'not_a_pull') show.play('wiggle'); // "oops, my bad". A pull gets no animation: calm and kind.
    pr?.reload();
  };

  const kind: LineKind = said && said.until > Date.now() ? said.kind : desk.wanted ? 'sessionStart' : 'hello';
  const line = alerting(desk) ? 'Hands down? I’m right here.' : mochiSays(kind, tone, { streak: p?.streak.current }, daySeed());
  const mood: Mood = alerting(desk) ? 'alert' : kind === 'afterPull' ? 'happy' : desk.wanted ? 'happy' : 'wave';

  const openBuddy = async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: object) => Promise<Window> } }).documentPictureInPicture;
    if (!dpip) { setToast('Your browser can’t open floating windows yet. Try Chrome 116 or newer.'); setTimeout(() => setToast(''), 3500); return; }
    const w = await dpip.requestWindow({ width: 300, height: 360 });
    for (const ss of Array.from(document.styleSheets)) {
      try {
        const st = w.document.createElement('style');
        st.textContent = Array.from(ss.cssRules).map((r) => r.cssText).join('\n').replace(/url\("?\//g, `url("${location.origin}/`).replace(/url\(""/g, 'url("');
        w.document.head.appendChild(st);
      } catch { /* cross-origin sheet: none in this app */ }
    }
    w.document.title = 'Mochi';
    w.addEventListener('pagehide', () => setPipWin(null));
    setPipWin(w);
  };

  return (
    <div>
      {pilot && (
        <div className="card info row" style={{ padding: '12px 18px' }}>
          <span style={{ fontWeight: 600 }}>{pilot.banner}</span>
          {pilot.phase === 'complete' && EXIT_SURVEY_URL && <a href={EXIT_SURVEY_URL} target="_blank" rel="noreferrer">Take the exit questionnaire →</a>}
        </div>
      )}

      <section className="card hero" aria-label="Mochi">
        <span className="blob" style={{ width: 90, height: 90, background: 'var(--pink)', right: -24, top: -20 }} />
        <span className="blob" style={{ width: 26, height: 26, background: 'var(--lime)', right: 120, top: 26 }} />
        <span className="blob" style={{ width: 44, height: 44, background: 'var(--lilac)', left: -14, bottom: 60 }} />
        <div className="row" style={{ justifyContent: 'space-between', position: 'relative' }}>
          <h1 className="hand" style={{ fontSize: 38, margin: 0 }}>{desk.wanted ? 'Focus time' : greeting()}</h1>
          <StatusPill desk={desk} />
        </div>
        <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 18, margin: '8px 0 14px', position: 'relative' }}>
          <Mochi size={210} mood={mood} body={flavour?.body} blush={flavour?.blush} squeezable onSqueeze={onSqueeze}
            action={show.action} shout={show.shout} onActionEnd={show.end} onDoubleClick={() => show.play('spin', 'Wheee!')} />
          <div className="bubble" style={{ flex: 1 }} aria-live="polite">{line}</div>
        </div>
        <div className="row" style={{ position: 'relative' }}>
          <button className={desk.wanted ? 'lilac big' : 'lime big'} style={{ flex: '1 1 240px', width: 'auto' }}
            onClick={() => send({ target: 'sw', type: desk.wanted ? 'DESK_STOP' : 'DESK_START' })}>
            {desk.wanted ? 'End session' : desk.status === 'paused' ? 'Resume session' : 'Start a desk session'}
          </button>
          {desk.wanted && <button className="big" style={{ flex: '0 1 160px', width: 'auto' }} onClick={() => send({ target: 'sw', type: 'DESK_PAUSE', minutes: 15 })}>Pause 15 min</button>}
          {desk.wanted && focusMin && <button className="lime big" style={{ flex: '0 1 190px', width: 'auto' }} onClick={() => setFocusMin(false)}>Enter focus room</button>}
          <button className="big" style={{ flex: '0 1 170px', width: 'auto' }} onClick={openBuddy} disabled={!!pipWin}>Pop out Mochi</button>
        </div>
        {desk.interrupted && !desk.wanted && <p className="small muted" style={{ margin: '10px 0 0' }}>Chrome restarted, so the last session stopped. Start again when you’re ready.</p>}
        {desk.status === 'error' && desk.error && <p className="small" style={{ margin: '10px 0 0', color: 'var(--peach)' }}>{desk.error}</p>}
        <p className="small muted" style={{ margin: '10px 0 0', position: 'relative' }}>Squeeze Mochi when your hands need something to do. Double-click for a spin.</p>
        {show.ride && (focusMin || !desk.wanted) && <LineRider body={flavour?.body ?? '#F4F1E8'} blush={flavour?.blush ?? '#F6B8C8'} label={show.ride} onDone={show.endRide} />}
      </section>

      {p && <WeekStrip p={p} />}

      <div className="grid two" style={{ marginBottom: 18 }}>
        <button className="big" onClick={() => fb('not_a_pull')}>Not a pull</button>
        <button className="big" onClick={() => fb('i_pulled')}>I just pulled</button>
      </div>

      {refresh && (
        <div className="card soft row">
          <span style={{ flex: 1 }}>Want to refresh your voice clips? New words stay fresh.</span>
          <button className="lime" onClick={() => go('record')}>Record</button>
          <button className="ghost" onClick={() => setRefresh(false)}>Not now</button>
        </div>
      )}

      {p && (
        <section aria-label="Today's quests" style={{ marginBottom: 18 }}>
          <h2>Today’s quests</h2>
          {p.quests.map((q, i) => (
            <div key={q.id} className={`quest ${q.done ? 'done' : ''}`} style={{ background: ['var(--lime)', 'var(--pink)', 'var(--lilac)'][i] }}>
              <Mochi size={52} float={false} mood={q.done ? 'proud' : ['happy', 'squish', 'wave'][i] as Mood} body={flavour?.body} blush={flavour?.blush} />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between', fontWeight: 600 }}><span>{q.title}</span><span>{q.done ? `✓ +${q.xp} XP` : `${q.progress}/${q.target}`}</span></div>
                <div className="meter" style={{ marginTop: 6 }}><div style={{ width: `${(q.progress / q.target) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </section>
      )}

      <LearningCard settings={settings} />

      <div className="card">
        <div className="row"><h3 style={{ margin: 0 }}>Sound</h3><span className="spacer" /><OutputModeSwitch value={desk.outputMode ?? settings.outputMode} /></div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>Shortcuts from any app: <kbd>⌘/Ctrl+Shift+Y</kbd> Not a pull · <kbd>⌘/Ctrl+Shift+U</kbd> I just pulled</p>
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
          <span>Show the camera preview with Mochi’s view (only while this tab is open)</span>
        </label>
        {preview && <Preview zones={settings.zones} />}
      </div>

      {recap && (
        <Modal>
          <Confetti />
          <CelebratingMochi size={130} flavour={flavour} shout="Yeahh!" />
          <h2 className="hand" style={{ fontSize: 34, color: 'var(--indigo)', margin: '6px 0' }}>+{recap.xp} XP</h2>
          <p>{mochiSays('sessionEnd', tone, { minutes: Math.round(recap.session.deskMinutes) }, daySeed())}</p>
          <div className="grid two" style={{ margin: '12px 0', width: '100%' }}>
            <div className="stat"><div className="n">{Math.round(recap.session.deskMinutes)}</div><div className="l">desk minutes</div></div>
            <div className="stat"><div className="n">{recap.catches}</div><div className="l">times your hand came down</div></div>
          </div>
          <p style={{ fontWeight: 600 }}>How did that session feel?</p>
          <div className="moods">
            {['😣', '😕', '😐', '🙂', '😄'].map((e, i) => (
              <button key={e} aria-label={`Mood ${i + 1} of 5`} onClick={async () => {
                await db.events.add({ id: uid(), type: 'checkin', t: Date.now(), sessionId: recap.session.id, data: { mood: i + 1 } });
                await update({ lastRecapId: recap.session.id });
                setRecap(null); pr?.reload();
              }}>{e}</button>
            ))}
          </div>
          <button className="ghost" onClick={async () => { await update({ lastRecapId: recap.session.id }); setRecap(null); }}>Skip</button>
        </Modal>
      )}

      {levelUp && !recap && flavour && (
        <Modal>
          <Confetti />
          <p className="small muted" style={{ margin: 0 }}>New flavour unlocked</p>
          <CelebratingMochi size={150} flavour={flavour} shout="New look!" spinFirst />
          <h2 className="hand" style={{ fontSize: 36, color: 'var(--indigo)' }}>{flavour.name} Mochi</h2>
          <p>{mochiSays('levelUp', tone, { flavour: flavour.name })}</p>
          <button className="primary big" onClick={async () => { await update({ lastLevelSeen: p!.level.level }); setLevelUp(null); }}>Yay</button>
        </Modal>
      )}

      {desk.wanted && !focusMin && !recap && (
        <FocusRoom desk={desk} settings={settings} flavour={flavour} line={line} mood={mood} goal={settings.dailyGoalMinutes}
          todayMinutes={p?.today.deskMinutes ?? 0} onFeedback={fb} onSqueeze={onSqueeze} onMinimise={() => setFocusMin(true)} onPopOut={openBuddy} popped={!!pipWin}
          show={show} />
      )}

      {pipWin && createPortal(<Buddy settings={settings} flavour={flavour} onSqueeze={pr?.bumpSqueeze} />, pipWin.document.body)}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** Full-window focus room while a session runs: big Mochi, big timer, the buttons you need, nothing else. */
function FocusRoom({ desk, settings, flavour, line, mood, goal, todayMinutes, onFeedback, onSqueeze, onMinimise, onPopOut, popped, show }: {
  desk: DeskState; settings: ScreenProps['settings']; flavour?: Progress['level']['flavour']; line: string; mood: Mood; goal: number; todayMinutes: number;
  onFeedback: (k: FeedbackKind) => void; onSqueeze?: (n: number) => void; onMinimise: () => void; onPopOut: () => void; popped: boolean;
  show: ReturnType<typeof useMochiShow>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = desk.startedAt ? Math.max(0, Math.floor((now - desk.startedAt) / 1000)) : 0;
  const h = Math.floor(secs / 3600), mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
  const big = 'min(42vh, 340px)';
  return (
    <div className={`focus ${alerting(desk) ? 'alerting' : ''}`} role="region" aria-label="Focus room">
      <div className="scatter" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        {([['var(--pink)', 180, '-60px', '58%'], ['var(--lime)', 30, '10%', '22%'], ['var(--lilac)', 90, '-30px', '80%'], ['var(--peach)', 54, '90%', '12%'], ['var(--lime)', 22, '84%', '70%']] as [string, number, string, string][])
          .map(([c, s, left, top], i) => <span key={i} className="blob" style={{ position: 'absolute', background: c, width: s, height: s, left, top, borderRadius: '50%' }} />)}
      </div>
      <header className="screen-top">
        <span className="logo" style={{ padding: 0, color: 'var(--lime)' }}><Mochi size={36} float={false} body={flavour?.body} blush={flavour?.blush} />Focus room</span>
        <div className="row">
          <StatusPill desk={desk} />
          {!popped && <button onClick={onPopOut} style={{ padding: '6px 12px', fontSize: 14 }}>Pop out</button>}
          <button onClick={onMinimise} style={{ padding: '6px 12px', fontSize: 14 }}>Dashboard</button>
        </div>
      </header>
      <div className="focus-stage">
        <div className="focus-timer" aria-label="Session time">{h ? `${h}:` : ''}{mm}:{ss}</div>
        <div style={{ width: big, height: big, display: 'grid', placeItems: 'center' }}>
          <Mochi size={Math.min(340, Math.round(window.innerHeight * 0.42))} mood={mood} body={flavour?.body} blush={flavour?.blush} squeezable onSqueeze={onSqueeze}
            action={show.action} shout={show.shout} onActionEnd={show.end} onDoubleClick={() => show.play('spin', 'Wheee!')} />
        </div>
        <div className="bubble tail-up" aria-live="polite">{line}</div>
        <div style={{ width: 'min(420px, 80vw)', marginTop: 10 }}>
          <div className="meter" style={{ background: 'rgba(255,255,255,.18)' }}><div style={{ width: `${Math.min(100, (todayMinutes / goal) * 100)}%`, background: 'var(--lime)' }} /></div>
          <p className="small" style={{ color: '#d6dbff', margin: '6px 0 0' }}>{todayMinutes >= goal ? `Daily goal of ${goal} min reached ✓` : `${Math.floor(todayMinutes)} of ${goal} minutes today`} · squeeze Mochi when your hands need something</p>
        </div>
      </div>
      {show.ride && <LineRider body={flavour?.body ?? '#F4F1E8'} blush={flavour?.blush ?? '#F6B8C8'} label={show.ride} onDone={show.endRide} />}
      <div className="focus-bar">
        <button className="big" style={{ width: 'auto' }} onClick={() => onFeedback('not_a_pull')}>Not a pull</button>
        <button className="big" style={{ width: 'auto' }} onClick={() => onFeedback('i_pulled')}>I just pulled</button>
        <button className="big lilac" style={{ width: 'auto' }} onClick={() => send({ target: 'sw', type: 'DESK_PAUSE', minutes: 15 })}>Pause 15 min</button>
        <button className="big lime" style={{ width: 'auto' }} onClick={() => send({ target: 'sw', type: 'DESK_STOP' })}>End session</button>
      </div>
      <p className="small center" style={{ color: '#aab3f0', margin: '0 0 14px', position: 'relative', zIndex: 2 }}>
        You can switch to any app. Mochi keeps watching{settings.outputMode === 'silent_log' ? ' quietly' : ''}.
      </p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function WeekStrip({ p }: { p: Progress }) {
  const today = localDate(Date.now());
  const dow = (new Date().getDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -dow);
  const frozen = new Set(p.streak.frozenDates);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="week" role="list" aria-label="This week">
        {Array.from({ length: 7 }, (_, k) => {
          const d = addDays(monday, k);
          const done = showedUp(p.days[d]);
          const label = new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
          return (
            <div role="listitem" key={d} className={`daypill ${done ? 'done' : frozen.has(d) ? 'frozen' : ''} ${d === today ? 'today' : ''}`} style={{ opacity: d > today ? 0.5 : 1 }}
              aria-label={`${label}${done ? ', showed up' : frozen.has(d) ? ', streak freeze used' : ''}`}>
              <b>{Number(d.slice(8))}</b>{label}
              <div style={{ height: 22, display: 'grid', placeItems: 'center' }}>
                {done ? <span style={{ width: 20, height: 20 }}><IconFlame /></span> : frozen.has(d) ? <span style={{ width: 18, height: 18 }}><IconSnow /></span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LearningCard({ settings }: { settings: ScreenProps['settings'] }) {
  const m = settings.personalModel;
  const pos = Math.min(MIN_PER_CLASS, m?.nPos ?? 0), neg = Math.min(MIN_PER_CLASS, m?.nNeg ?? 0);
  return (
    <div className="card info">
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h3>{m?.active ? 'Mochi knows your hands' : 'Mochi is learning your hands'}</h3>
          {m?.active
            ? <p className="small" style={{ margin: 0 }}>Personal mode is on: {Math.round(m.accuracy * 100)}% accurate on your own examples. Keep tapping the buttons when it gets something wrong.</p>
            : <p className="small" style={{ margin: 0 }}>Every “Not a pull”, “I just pulled” and calibration teaches Mochi how <i>your</i> hands move. Personal mode turns on at {MIN_PER_CLASS} examples of each.</p>}
        </div>
      </div>
      {!m?.active && (
        <div className="grid two" style={{ marginTop: 12 }}>
          <div><div className="small muted">Reaches {pos}/{MIN_PER_CLASS}</div><div className="meter"><div style={{ width: `${(pos / MIN_PER_CLASS) * 100}%`, background: 'var(--pink-deep)' }} /></div></div>
          <div><div className="small muted">Everyday moves {neg}/{MIN_PER_CLASS}</div><div className="meter"><div style={{ width: `${(neg / MIN_PER_CLASS) * 100}%`, background: 'var(--lilac-deep)' }} /></div></div>
        </div>
      )}
    </div>
  );
}

/** A Mochi that celebrates as soon as it appears (spin first, then "Yeahh!"). */
function CelebratingMochi({ size, flavour, shout, spinFirst = false }: { size: number; flavour?: Progress['level']['flavour']; shout: string; spinFirst?: boolean }) {
  const [step, setStep] = useState<0 | 1 | 2>(spinFirst ? 0 : 1);
  return (
    <Mochi size={size} mood="proud" body={flavour?.body} blush={flavour?.blush} float={false}
      action={step === 0 ? 'spin' : step === 1 ? 'cheer' : null} shout={step === 1 ? shout : undefined}
      onActionEnd={() => setStep((s) => (s === 0 ? 1 : 2))} />
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return <div className="scrim" role="dialog" aria-modal="true"><div className="modal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{children}</div></div>;
}

function Confetti() {
  const colors = ['var(--lime)', 'var(--pink)', 'var(--lilac)', 'var(--peach)'];
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % 4], animationDelay: `${(i % 6) * 0.08}s` }} />)}</div>;
}

/** The floating desk buddy (Document Picture-in-Picture): sits on top of any app while you work. */
function Buddy({ settings, flavour, onSqueeze }: { settings: ScreenProps['settings']; flavour?: Progress['level']['flavour']; onSqueeze?: () => void }) {
  const desk = useDesk();
  const [now, setNow] = useState(Date.now());
  const [ack, setAck] = useState('');
  const show = useMochiShow({ paused: alerting(desk) });
  const caught = useRef(desk.today.interrupted);
  useEffect(() => { if (desk.today.interrupted > caught.current) show.play('cheer', 'Yeahh!'); caught.current = desk.today.interrupted; }, [desk.today.interrupted, show.play]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = desk.wanted && desk.startedAt ? Math.floor((now - desk.startedAt) / 1000) : 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
  const fb = async (kind: FeedbackKind) => {
    await send({ target: 'sw', type: 'FEEDBACK', kind });
    setAck(mochiSays(kind === 'i_pulled' ? 'afterPull' : 'afterNotPull', settings.mochiTone));
    setTimeout(() => setAck(''), 5000);
  };
  return (
    <div style={{ background: 'var(--indigo)', color: '#fff', minHeight: '100vh', padding: 14, fontFamily: 'var(--font)', textAlign: 'center' }}>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Mochi size={130} mood={alerting(desk) ? 'alert' : desk.wanted ? 'happy' : 'sleepy'} body={flavour?.body} blush={flavour?.blush} squeezable
          onSqueeze={(n) => { onSqueeze?.(); if (n % 10 === 0) show.play('cheer', 'Yeahh!'); }} action={show.action} shout={show.shout} onActionEnd={show.end}
          onDoubleClick={() => show.play('spin')} />
      </div>
      <div className="hand" style={{ fontSize: 24, color: 'var(--lime)', minHeight: 30 }}>
        {ack || (alerting(desk) ? 'Hands down?' : desk.wanted ? `${mm}:${ss} focused` : 'Napping. Start a session?')}
      </div>
      {desk.wanted ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <button onClick={() => fb('not_a_pull')} style={{ fontSize: 14, padding: '8px 6px' }}>Not a pull</button>
          <button onClick={() => fb('i_pulled')} style={{ fontSize: 14, padding: '8px 6px' }}>I pulled</button>
        </div>
      ) : (
        <button className="lime" style={{ marginTop: 10, width: '100%' }} onClick={() => send({ target: 'sw', type: 'DESK_START' })}>Start session</button>
      )}
    </div>
  );
}
