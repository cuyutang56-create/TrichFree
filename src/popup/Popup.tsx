import { useEffect, useState } from 'react';
import { OutputModeSwitch } from '../app/components/OutputModeSwitch';
import { StatusPill } from '../app/components/StatusPill';
import { IconFlame } from '../app/components/Icons';
import { Mochi } from '../app/components/Mochi';
import { useDesk } from '../app/useDesk';
import { useMochiShow } from '../app/useMochiShow';
import { getSettings, type AppSettings } from '../shared/db';
import { send, type FeedbackKind } from '../shared/messages';
import { mochiSays } from '../shared/mochi';
import { pilotInfo } from '../shared/pilot';
import { loadProgress, type Progress } from '../shared/progress';

const openApp = (hash = '#/home') => chrome.tabs.create({ url: chrome.runtime.getURL(`src/app/index.html${hash}`) });

export function Popup() {
  const desk = useDesk();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [p, setP] = useState<Progress | null>(null);
  const [ack, setAck] = useState('');
  const show = useMochiShow({ idle: false });
  useEffect(() => { show.play('hop'); }, [show.play]);
  useEffect(() => { getSettings().then((s) => { setSettings(s); void loadProgress(s).then(setP); }); }, []);
  const pilot = settings ? pilotInfo(settings) : null;
  const on = desk.wanted;
  const alert = on && (desk.phase === 'ALERT_1' || desk.phase === 'ALERT_2');

  const fb = async (kind: FeedbackKind) => {
    await send({ target: 'sw', type: 'FEEDBACK', kind });
    setAck(mochiSays(kind === 'i_pulled' ? 'afterPull' : 'afterNotPull', settings?.mochiTone ?? 'gentle'));
    setTimeout(() => setAck(''), 4000);
  };

  if (settings && !settings.onboarded) {
    return (
      <div className="wrap stack center">
        <div style={{ display: 'grid', placeItems: 'center' }}><Mochi size={120} mood="wave" /></div>
        <h2 className="hand" style={{ fontSize: 30 }}>Hi, I’m Mochi</h2>
        <p>Let’s get you set up. It takes a few minutes.</p>
        <button className="lime big" onClick={() => openApp('#/welcome')}>Let’s start</button>
      </div>
    );
  }

  return (
    <div className="wrap stack">
      <div className="row">
        <span className="statline" style={{ fontSize: 16 }}><IconFlame color={p?.streak.todayDone ? '#ff8a3d' : '#c9c4b5'} />{p?.streak.current ?? 0}</span>
        <span className="spacer" /><StatusPill desk={desk} />
      </div>
      <div className="card hero" style={{ padding: 12, margin: 0 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Mochi size={88} mood={alert ? 'alert' : on ? 'happy' : 'wave'} body={p?.level.flavour.body} blush={p?.level.flavour.blush} squeezable
            action={show.action} shout={show.shout} onActionEnd={show.end} onSqueeze={(n) => { if (n % 10 === 0) show.play('cheer', 'Yeahh!'); }} />
          <div className="bubble" style={{ fontSize: 18, padding: '8px 12px' }}>
            {ack || (alert ? 'Hands down? I’m right here.' : mochiSays(on ? 'sessionStart' : 'hello', settings?.mochiTone ?? 'gentle', { streak: p?.streak.current }))}
          </div>
        </div>
      </div>
      {pilot && <div className="pill" style={{ width: '100%' }}>{pilot.banner}</div>}
      {desk.interrupted && !on && <div className="card warn small" style={{ margin: 0, padding: 10 }}>Chrome restarted, so the session stopped. Start again when you’re ready.</div>}
      <button className={on ? 'lilac big' : 'lime big'} onClick={() => send({ target: 'sw', type: on ? 'DESK_STOP' : 'DESK_START' })}>
        {on ? 'End session' : desk.status === 'paused' ? 'Resume session' : 'Start a desk session'}
      </button>
      {on && <button className="full" onClick={() => send({ target: 'sw', type: 'DESK_PAUSE', minutes: 15 })}>Pause 15 min</button>}
      <div className="fb">
        <button onClick={() => fb('not_a_pull')}>Not a pull</button>
        <button onClick={() => fb('i_pulled')}>I just pulled</button>
      </div>
      {p && <div className="small muted">Today: {Math.floor(p.today.deskMinutes)} of {settings?.dailyGoalMinutes} min · {p.level.flavour.name} Mochi · {p.xp} XP</div>}
      <OutputModeSwitch value={desk.outputMode ?? settings?.outputMode ?? 'speakers'} />
      <button className="ghost" onClick={() => openApp()}>Open TrichFree →</button>
    </div>
  );
}
