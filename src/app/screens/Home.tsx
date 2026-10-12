// Dashboard: monitoring + camera status, Start / Pause / Stop, the chosen reminder with a one-click test,
// feedback buttons while monitoring, account/sync status, and gentle next steps. Nothing to read first.
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { ScreenProps } from '../App';
import { COPY, STOP_REASON_TEXT } from '../../shared/copy';
import { db, uid, type SessionRow } from '../../shared/db';
import { send, type DeskState, type FeedbackKind } from '../../shared/messages';
import { mochiSays } from '../../shared/mochi';
import { EXIT_SURVEY_URL, pilotInfo } from '../../shared/pilot';
import { ACCOUNTS_CONFIGURED } from '../../shared/config';
import { PREF_LABELS, microPromptText, type Intervention, type PrefKey } from '../../sync/prefs';
import { Notice, Seg, Toast } from '../../ui/controls';
import { Mochi } from '../components/Mochi';
import { requestCamera, startMonitoring, updateSettings, useAccount, useCameraPermission, useClips, useDesk, useToast } from '../hooks';
import { statusView } from '../status';
import { Preview } from '../components/Preview';
import { testReminder } from '../testReminder';

const INTERVENTION_SHORT: [Intervention, string][] = [['chime', 'Chime'], ['voice', 'Your voice'], ['visual', 'Visual'], ['off', 'Off']];

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};

export function Home({ settings, go }: ScreenProps) {
  const desk = useDesk();
  const account = useAccount();
  const clips = useClips() ?? [];
  const cam = useCameraPermission();
  const [toast, flash] = useToast();
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testNote, setTestNote] = useState('');
  const now = useNow(desk.wanted);
  const [lastSession, setLastSession] = useState<SessionRow | null>(null);
  const [finishedSessions, setFinishedSessions] = useState(0);
  const view = statusView(desk, cam);
  const pilot = pilotInfo(settings);

  useEffect(() => {
    const sub = liveQuery(async () => ({ last: await db.sessions.orderBy('startedAt').last(), count: await db.sessions.filter((x) => x.endedAt != null).count() }))
      .subscribe(({ last, count }) => { setLastSession(last ?? null); setFinishedSessions(count); });
    return () => sub.unsubscribe();
  }, []);

  const start = async () => {
    setBusy(true);
    const r = await startMonitoring();
    setBusy(false);
    if (!r.ok) flash(r.message);
  };
  const fb = async (kind: FeedbackKind) => {
    await send({ target: 'sw', type: 'FEEDBACK', kind });
    flash(kind === 'i_pulled' ? COPY.loggedNeutral : COPY.notAPullThanks);
  };
  const allowCamera = async () => {
    const r = await requestCamera();
    if (r.ok) { await send({ target: 'sw', type: 'DESK_STOP' }); await start(); }
    else flash(r.reason === 'denied' ? 'The camera is still blocked. Use the camera icon in the address bar, or the browser’s site settings, to allow it.' : 'The camera is not available right now.');
  };

  const voiceMissing = settings.intervention === 'voice' && !clips.length;
  const showRecap = !!lastSession?.endedAt && lastSession.id !== settings.lastRecapId && Date.now() - lastSession.endedAt < 12 * 3_600_000
    && lastSession.endedAt - lastSession.startedAt >= 2 * 60_000 && !desk.wanted;

  return (
    <div className="dash">
      {pilot && (
        <Notice tone="info" title={pilot.banner}>
          {pilot.phase === 'complete' && EXIT_SURVEY_URL && <a href={EXIT_SURVEY_URL} target="_blank" rel="noopener noreferrer">Take the exit questionnaire</a>}
        </Notice>
      )}
      {desk.stopReason && !desk.wanted && (
        <Notice tone="info" action={<button className="btn ghost" onClick={() => send({ target: 'sw', type: 'DISMISS_STOP_REASON' })}>Dismiss</button>}>
          {STOP_REASON_TEXT[desk.stopReason] ?? 'Monitoring stopped.'}
        </Notice>
      )}
      {account.notice && <SyncNotice kind={account.notice.kind} keys={account.notice.keys as PrefKey[]} />}
      {account.signedIn && account.sync === 'auth' && (
        <Notice tone="warn" title="Sign in again to keep syncing" action={<a className="btn" href="#/settings?section=account">Sign in</a>}>
          Your settings are safe on this device and will sync once you sign in.
        </Notice>
      )}
      {desk.errorKind === 'camera_permission' && (
        <Notice tone="warn" title="TrichFree needs the camera" action={<button className="btn primary" onClick={() => void allowCamera()}>Allow camera</button>}>
          When your browser asks, choose the option that always allows the camera for TrichFree.
        </Notice>
      )}

      <section className="card status-card" aria-labelledby="mon-h">
        <div className="row">
          <h1 id="mon-h" className="h2">Monitoring</h1>
          <span className="spacer" />
          <span className={`pill ${view.tone}`} role="status" data-testid="desk-status"><span className="dot" aria-hidden="true" />{view.title}</span>
        </div>
        <p className="status-detail">{view.detail}</p>
        <dl className="kv">
          <dt>Camera</dt><dd data-testid="camera-status">{view.camera}</dd>
          {desk.wanted && desk.startedAt && <><dt>This session</dt><dd>{fmtDuration(now - desk.startedAt)}</dd></>}
          <dt>Today</dt><dd>{desk.today.detections} reminder{desk.today.detections === 1 ? '' : 's'} · hand came down {desk.today.interrupted} time{desk.today.interrupted === 1 ? '' : 's'}</dd>
        </dl>
        {desk.wanted && (
          // The preview opens its own camera stream, so it exists only while this panel is open.
          <details className="preview-details" onToggle={(e) => setPreviewOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>Show what TrichFree sees</summary>
            <p className="small muted">The preview is only on this page and is never saved. Points mark your face and hands; shaded boxes are the areas being watched.</p>
            {previewOpen && <Preview zones={settings.zones} />}
          </details>
        )}
        <div className="row actions">
          {!desk.wanted ? (
            <button className="btn primary big" disabled={busy} onClick={() => void start()}>{desk.status === 'paused' ? 'Resume now' : 'Start monitoring'}</button>
          ) : (
            <>
              <button className="btn big" onClick={() => send({ target: 'sw', type: 'DESK_PAUSE', minutes: 15 })}>Pause 15 min</button>
              <button className="btn big" onClick={() => send({ target: 'sw', type: 'DESK_STOP' })}>Stop</button>
              {(desk.status === 'problem' || desk.status === 'error') && desk.errorKind !== 'camera_permission' && (
                <button className="btn primary big" onClick={async () => { await send({ target: 'sw', type: 'DESK_STOP' }); await start(); }}>Restart</button>
              )}
            </>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="rem-h">
        <div className="row">
          <h2 id="rem-h">Your reminder</h2>
          <span className="spacer" />
          <a className="btn ghost" href="#/settings">Adjust</a>
        </div>
        <Seg<Intervention> label="Reminder type" value={settings.intervention} options={INTERVENTION_SHORT} onChange={(v) => void updateSettings({ intervention: v })} />
        <p className="small muted" style={{ marginTop: 10 }}>
          {settings.intervention === 'off' ? 'No reminder. TrichFree keeps a private log only.'
            : <>{microPromptText(settings.microPrompt) ?? 'No suggestion'} · Quiet time {settings.cooldownSeconds < 60 ? `${settings.cooldownSeconds} s` : `${settings.cooldownSeconds / 60} min`}{settings.followUp ? ' · one follow-up' : ''}</>}
        </p>
        {voiceMissing && (
          <Notice tone="info" action={<a className="btn" href="#/voice">Record</a>}>
            There is no voice recording on this device yet, so the chime plays instead. {COPY.voiceLocal}
          </Notice>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={async () => setTestNote(await testReminder(settings, clips))}>Test reminder</button>
          {testNote && <span className="small" role="status">{testNote}</span>}
        </div>
      </section>

      {desk.wanted && (
        <section className="card" aria-labelledby="fb-h">
          <h2 id="fb-h">Was TrichFree right?</h2>
          <p className="small muted">Telling TrichFree when it got something wrong (or missed something) helps it learn your movements. Nothing is shared.</p>
          <div className="row">
            <button className="btn" onClick={() => void fb('not_a_pull')}>Not a pull</button>
            <button className="btn" onClick={() => void fb('i_pulled')}>I just pulled</button>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            In Chrome: <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>Y</kbd> not a pull · <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> I just pulled.
            To use them from other apps too, set them to “Global” in{' '}
            <button type="button" className="linklike" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>keyboard shortcuts</button>.
          </p>
        </section>
      )}

      {showRecap && lastSession && <Recap session={lastSession} />}

      {settings.companionEnabled && <MochiCard settings={settings} desk={desk} />}
      {/* Mochi is introduced only after the core loop is familiar: after a first finished session. */}
      {!settings.companionEnabled && !settings.companionOffered && finishedSessions > 0 && !desk.wanted && (
        <section className="card soft" aria-labelledby="meet-h">
          <div className="row nowrap">
            <Mochi size={88} float={false} mood="wave" />
            <div>
              <h2 id="meet-h">Meet Mochi (optional)</h2>
              <p className="small">Mochi is a small companion that keeps you company while you work, celebrates showing up, and is nice to squeeze when your hands want something to do. You can switch it off any time.</p>
              <div className="row">
                <button className="btn primary" onClick={() => void updateSettings({ companionEnabled: true, companionOffered: true })}>Turn on Mochi</button>
                <button className="btn ghost" onClick={() => void updateSettings({ companionOffered: true })}>No thanks</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!settings.activeCalibrationId && (
        <section className="card soft" aria-labelledby="tune-h">
          <h2 id="tune-h">Improve accuracy (2 minutes)</h2>
          <p className="small">A short guided tune-up teaches TrichFree how your hands move and which everyday movements to ignore.</p>
          <button className="btn" onClick={() => go('tune')}>Start tune-up</button>
        </section>
      )}

      {ACCOUNTS_CONFIGURED && !account.signedIn && (
        <section className="card soft" aria-labelledby="acct-h">
          <h2 id="acct-h">Use TrichFree on more than one computer?</h2>
          <p className="small">You are in guest mode: settings are saved on this device only. A free account keeps your reminder settings in sync. Video and voice recordings never leave the device.</p>
          <a className="btn" href="#/settings?section=account">Save across devices</a>
        </section>
      )}
      <Toast text={toast} />
    </div>
  );
}

function SyncNotice({ kind, keys }: { kind: 'conflict' | 'adopted' | 'remote'; keys: PrefKey[] }) {
  const names = keys.map((k) => PREF_LABELS[k] ?? k).join(', ');
  const dismiss = <button className="btn ghost" onClick={() => send({ target: 'sw', type: 'NOTICE_DISMISS' })}>Dismiss</button>;
  if (kind === 'conflict') return <Notice tone="warn" title="Changed on two devices at once" action={dismiss}>These settings were changed on another device at the same time, so we kept that device’s choice: {names}.</Notice>;
  if (kind === 'adopted') return <Notice tone="ok" title="Loaded your saved settings" action={dismiss}>This device now uses the settings saved in your account{names ? ` (${names})` : ''}.</Notice>;
  return <Notice tone="info" title="Updated from your other device" action={dismiss}>{names}</Notice>;
}

function Recap({ session }: { session: SessionRow }) {
  const moods = ['Hard', 'A bit hard', 'Okay', 'Good', 'Very good'];
  const done = async (mood?: number) => {
    if (mood) await db.events.add({ id: uid(), type: 'checkin', t: Date.now(), sessionId: session.id, data: { mood } });
    await updateSettings({ lastRecapId: session.id });
  };
  return (
    <section className="card soft" aria-labelledby="recap-h">
      <h2 id="recap-h">How did your last session feel?</h2>
      <p className="small muted">{Math.round(session.deskMinutes)} minutes at the desk. Your answer stays on this device.</p>
      <div className="row" role="group" aria-label="How the session felt">
        {moods.map((m, i) => <button key={m} className="btn" onClick={() => void done(i + 1)}>{m}</button>)}
        <button className="btn ghost" onClick={() => void done()}>Skip</button>
      </div>
    </section>
  );
}

function MochiCard({ settings, desk }: { settings: ScreenProps['settings']; desk: DeskState }) {
  const alerting = desk.wanted && (desk.phase === 'ALERT_1' || desk.phase === 'ALERT_2');
  const seed = new Date().getDate();
  const line = alerting ? 'Hands down? I’m right here.' : mochiSays(desk.wanted ? 'sessionStart' : 'hello', settings.companionTone, {}, seed);
  return (
    <section className="card mochi-card" aria-label="Mochi">
      <Mochi size={120} mood={alerting ? 'alert' : desk.wanted ? 'happy' : 'wave'} squeezable float={!settings.reduceMotion} />
      <div className="bubble" aria-live="polite">{line}</div>
    </section>
  );
}
