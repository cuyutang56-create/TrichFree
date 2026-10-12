// Onboarding: two steps, no questionnaires. 1) what TrichFree does and how privacy works; 2) choose a reminder,
// hear it, and (optionally) try it with the camera. Everything else is offered later, when it becomes relevant.
import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../App';
import { COPY } from '../../shared/copy';
import { ACCOUNTS_CONFIGURED, WEBSITE_URL } from '../../shared/config';
import { send, type AccountReply } from '../../shared/messages';
import { PROMPTS } from '../../shared/prompts';
import { configFor } from '../../core/detectorConfig';
import { DetectorPipeline } from '../../core/pipeline';
import { HAIR_TOUCH } from '../../core/hair';
import { CHIME_MS, Player } from '../../offscreen/player';
import { Choices, Notice } from '../../ui/controls';
import { SignInForm } from '../../ui/SignInForm';
import { INTERVENTION_OPTIONS } from '../../ui/PreferencesForm';
import { SupportList } from '../components/SupportCard';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { useLocalVision } from '../calibrationSession';
import { startMonitoring, updateSettings, useAccount, useClips } from '../hooks';
import { testReminder } from '../testReminder';
import type { Intervention } from '../../sync/prefs';

const privacyHref = WEBSITE_URL ? `${WEBSITE_URL}/privacy/` : undefined;

export function Welcome({ go }: ScreenProps) {
  const account = useAccount();
  const [signIn, setSignIn] = useState(false);
  const next = async () => {
    await updateSettings({ consentAt: Date.now(), onboardingStep: 'start' });
    go('start');
  };
  return (
    <div className="onb stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <p className="step-label">Step 1 of 2</p>
      <h1>{COPY.tagline}</h1>
      <p className="lead">TrichFree notices possible hand-to-hair movements while you work at your computer, and gives you a gentle reminder you choose.</p>
      <ul className="points">
        <li><strong>Private.</strong> Video is analysed on this computer, frame by frame, and never saved or sent anywhere.</li>
        <li><strong>In your control.</strong> The camera is only used while monitoring is on. Pause or stop any time.</li>
        <li><strong>A self-help tool.</strong> It is not a medical device or a treatment, and it cannot tell every pull apart from ordinary touching.</li>
      </ul>
      <div className="stack">
        <button className="btn primary big" onClick={() => void next()}>Continue</button>
        <p className="small muted">By continuing you confirm you are 18 or older, or that a parent or guardian is helping you set this up.</p>
      </div>
      {ACCOUNTS_CONFIGURED && (
        <div className="card soft">
          {account.signedIn ? (
            <Notice tone="ok" title={`Signed in as ${account.email}`}>Your saved settings were loaded{account.sync === 'syncing' ? '…' : '.'} Continue to try your reminder.</Notice>
          ) : signIn ? (
            <>
              <h2>Bring your settings</h2>
              <SignInForm privacyHref={privacyHref}
                sendCode={(email) => send({ target: 'sw', type: 'ACCOUNT_SEND_CODE', email }) as Promise<AccountReply>}
                verify={(email, code) => send({ target: 'sw', type: 'ACCOUNT_VERIFY', email, code }) as Promise<AccountReply>} />
            </>
          ) : (
            <p className="row" style={{ margin: 0 }}>
              <span>Already use TrichFree on another computer?</span>
              <button className="btn ghost" onClick={() => setSignIn(true)}>Sign in to bring your settings</button>
            </p>
          )}
        </div>
      )}
      <details className="support-details">
        <summary>Where to find support</summary>
        <SupportList />
      </details>
    </div>
  );
}

export function Start({ settings, go }: ScreenProps) {
  const clips = useClips() ?? [];
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const notice = PROMPTS.find((p) => p.category === 'notice')!;
  const noticeClip = clips.filter((c) => c.category === 'notice').at(-1);
  const choices = INTERVENTION_OPTIONS.filter((o) => o.value !== 'off');

  const finish = async (monitor: boolean) => {
    setBusy(true);
    setError('');
    if (monitor) {
      const r = await startMonitoring();
      if (!r.ok) { setError(r.message); setBusy(false); return; }
    }
    await updateSettings({ onboarded: true, onboardingStep: 'done' });
    go('home');
  };

  return (
    <div className="onb stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <p className="step-label">Step 2 of 2</p>
      <h1>Choose your reminder</h1>
      <Choices<Intervention> legend="Reminder type" value={settings.intervention === 'off' ? 'chime' : settings.intervention} options={choices}
        onChange={(v) => void updateSettings({ intervention: v })} />

      {settings.intervention === 'voice' && (
        <div className="card soft stack">
          <h2>Record a short line <span className="muted small">(optional)</span></h2>
          <p className="hand quote">“{notice.example}”</p>
          <p className="small muted">{notice.hint} Up to 15 seconds. {COPY.voiceLocal}</p>
          <VoiceRecorder prompt={notice} clip={noticeClip} />
          {!noticeClip && <p className="small muted">No recording yet? The chime plays instead, and you can record later.</p>}
        </div>
      )}

      {(settings.intervention === 'chime' || settings.intervention === 'voice') && (
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="onb-vol">Volume <span className="muted">({settings.chimeVolume}%)</span></label>
          <input id="onb-vol" type="range" min={0} max={100} step={5} value={settings.chimeVolume} onChange={(e) => void updateSettings({ chimeVolume: Number(e.target.value) })} />
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={async () => setNote(await testReminder(settings, clips))}>Test reminder</button>
        {note && <span className="small" role="status">{note}</span>}
      </div>

      <div className="card soft stack">
        <h2>Try it with your camera <span className="muted small">(optional)</span></h2>
        {!camera ? (
          <>
            <p className="small">See it work before you start. When your browser asks, choose the option that <strong>always allows</strong> the camera for TrichFree (not “Allow this time”), so monitoring can keep running while you use other apps.</p>
            <button className="btn" onClick={() => setCamera(true)}>Turn on camera</button>
          </>
        ) : (
          <LiveTry settings={settings} onClose={() => setCamera(false)} />
        )}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}
      <div className="row">
        <button className="btn primary big" disabled={busy} onClick={() => void finish(true)}>Start monitoring</button>
        <button className="btn big" disabled={busy} onClick={() => void finish(false)}>Finish without starting</button>
      </div>
      <p className="small muted">You can change all of this later in Settings. A 2-minute tune-up to improve accuracy is available any time.</p>
    </div>
  );
}

/** Live camera check: plays the chosen reminder when a reach is held, so people know what to expect. */
function LiveTry({ settings, onClose }: { settings: ScreenProps['settings']; onClose: () => void }) {
  const v = useLocalVision(true, settings.zones);
  const clips = useClips() ?? [];
  const [live, setLive] = useState({ face: false, hand: false, zone: false, p: 0 });
  const [caught, setCaught] = useState(0);
  const player = useRef<Player | null>(null);
  const pipe = useRef(new DetectorPipeline(configFor(settings.sensitivity, 0, { cooldownMs: 2000 }), null, settings.zones));
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const lastUi = useRef(0);

  useEffect(() => {
    player.current = new Player(settings.chimeVolume / 100);
    return () => { void player.current?.close(); };
  }, [settings.chimeVolume]);

  useEffect(() => v.subscribe((f) => {
    const out = pipe.current.process(f.frame);
    if (out.events.some((e) => e.type === 'alertThresholdReached')) {
      setCaught((c) => c + 1);
      if (settings.intervention === 'visual') void send({ target: 'sw', type: 'TEST_VISUAL' });
      else {
        const p = player.current;
        if (p) {
          void p.resume();
          p.chime();
          const clip = settings.intervention === 'voice' ? clipsRef.current.find((c) => c.category === 'notice') ?? clipsRef.current[0] : undefined;
          if (clip) void p.load([clip]).then(() => p.clip(clip.id, CHIME_MS + 250));
        }
      }
    }
    const now = Date.now();
    if (now - lastUi.current > 120) {
      lastUi.current = now;
      setLive({ face: out.faceSeen || !!out.geom, hand: out.features.hasHand, zone: !!out.features.zone || out.features.hairContact >= HAIR_TOUCH, p: out.pSmooth });
    }
  }), [v, settings.intervention]);

  if (v.denied) {
    return <Notice tone="warn" title="The camera is blocked">Allow the camera for TrichFree in your browser’s site settings, then try again. You can also finish setup now and allow it later.</Notice>;
  }
  return (
    <div className="stack">
      <div className="videoWrap small">
        <video ref={v.videoRef} muted playsInline aria-label="Your camera preview (stays on this device)" />
        {!v.ready && !v.error && <div className="hud">Loading the on-device detector…</div>}
      </div>
      {v.error && <Notice tone="warn">{v.error}</Notice>}
      <ul className="checklist" aria-live="polite">
        <li data-ok={live.face}>{live.face ? 'Face in view' : 'Looking for your face…'}</li>
        <li data-ok={live.hand}>{live.hand ? 'Hand in view' : 'Raise a hand toward your hair'}</li>
        <li data-ok={live.zone}>{live.zone ? 'Hand at your hair: hold it for a moment' : 'Not at your hair yet'}</li>
      </ul>
      <div className="meter" role="meter" aria-label="Detection level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(live.p * 100)}>
        <div style={{ width: `${Math.round(live.p * 100)}%` }} />
      </div>
      {caught > 0 && <Notice tone="ok">That was a reminder. {caught > 1 ? `(${caught} so far)` : ''} Lower your hand and it resets after a moment.</Notice>}
      <button className="btn ghost" onClick={onClose}>Turn camera off</button>
    </div>
  );
}
