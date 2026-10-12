import { useState } from 'react';
import { statusView } from '../app/status';
import { useAccount, useCameraPermission, useClips, useDesk, useSettings, updateSettings } from '../app/hooks';
import { testReminder } from '../app/testReminder';
import { COPY } from '../shared/copy';
import { send, type FeedbackKind } from '../shared/messages';
import { pilotInfo } from '../shared/pilot';
import { ACCOUNTS_CONFIGURED } from '../shared/config';
import type { Intervention } from '../sync/prefs';
import { Seg } from '../ui/controls';

const openApp = (hash = '#/home') => chrome.tabs.create({ url: chrome.runtime.getURL(`src/app/index.html${hash}`) });

export function Popup() {
  const desk = useDesk();
  const settings = useSettings();
  const account = useAccount();
  const clips = useClips() ?? [];
  const cam = useCameraPermission();
  const [note, setNote] = useState('');
  if (!settings) return null;

  if (!settings.onboarded) {
    return (
      <div className="wrap">
        <h1 className="h2">Welcome to TrichFree</h1>
        <p>Set up takes about a minute: two short steps.</p>
        <button className="btn primary big" onClick={() => openApp('#/welcome')}>Set up TrichFree</button>
      </div>
    );
  }

  const view = statusView(desk, cam);
  const pilot = pilotInfo(settings);
  const start = async () => {
    // Popups cannot reliably show the camera permission prompt, so ask on a full page when needed.
    if (cam !== 'granted') { await openApp('#/camera?start=1'); window.close(); return; }
    await send({ target: 'sw', type: 'DESK_START' });
  };
  const fb = async (kind: FeedbackKind) => {
    await send({ target: 'sw', type: 'FEEDBACK', kind });
    setNote(kind === 'i_pulled' ? COPY.loggedNeutral : COPY.notAPullThanks);
  };

  return (
    <div className="wrap">
      <div className="row">
        <strong className="brand-text">TrichFree</strong>
        <span className="spacer" />
        <span className={`pill ${view.tone}`} role="status"><span className="dot" aria-hidden="true" />{view.title}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Camera: {view.camera}{desk.wanted ? ` · today ${desk.today.detections} reminder${desk.today.detections === 1 ? '' : 's'}` : ''}</p>
      {pilot && <p className="pill accent" style={{ margin: 0 }}>{pilot.banner}</p>}
      {!desk.wanted ? (
        <button className="btn primary big" onClick={() => void start()}>{desk.status === 'paused' ? 'Resume now' : 'Start monitoring'}</button>
      ) : (
        <div className="row">
          <button className="btn" style={{ flex: 1 }} onClick={() => send({ target: 'sw', type: 'DESK_PAUSE', minutes: 15 })}>Pause 15 min</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => send({ target: 'sw', type: 'DESK_STOP' })}>Stop</button>
        </div>
      )}
      {desk.wanted && (
        <div className="row">
          <button className="btn" style={{ flex: 1 }} onClick={() => void fb('not_a_pull')}>Not a pull</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => void fb('i_pulled')}>I just pulled</button>
        </div>
      )}
      <div className="field">
        <span className="label small">Reminder</span>
        <Seg<Intervention> label="Reminder type" value={settings.intervention} onChange={(v) => void updateSettings({ intervention: v })}
          options={[['chime', 'Chime'], ['voice', 'Voice'], ['visual', 'Visual'], ['off', 'Off']]} />
      </div>
      <button className="btn" onClick={async () => setNote(await testReminder(settings, clips))}>Test reminder</button>
      {note && <p className="small" role="status" style={{ margin: 0 }}>{note}</p>}
      <div className="row">
        <button className="btn ghost" onClick={() => openApp()}>Open dashboard</button>
        <span className="spacer" />
        {ACCOUNTS_CONFIGURED && <span className="small muted">{account.signedIn ? (account.sync === 'ok' ? 'Synced' : 'Signed in') : 'Guest'}</span>}
      </div>
    </div>
  );
}
