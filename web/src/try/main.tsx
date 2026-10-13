// "Try TrichFree": the real detector (same core + worker as the extension) running in this page.
// Camera frames are processed in a worker on this device; nothing is uploaded, nothing is stored.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import '../site.css';
import './try.css';
import { configFor } from '../../../src/core/detectorConfig';
import { DetectorPipeline } from '../../../src/core/pipeline';
import { HAIR_TOUCH } from '../../../src/core/hair';
import type { Sensitivity, ZoneId } from '../../../src/core/types';
import type { OverlayFrame } from '../../../src/shared/messages';
import { hasTrackProcessor, openCamera, VisionClient } from '../../../src/shared/visionClient';
import { CHIME_MS, Player } from '../../../src/offscreen/player';
import { processClip } from '../../../src/core/audioProcess';
import { microPromptText } from '../../../src/sync/prefs';
import { Choices, Notice, Seg } from '../../../src/ui/controls';
import { SiteHeader } from '../SiteHeader';
import { SITE } from '../config';

const ZONES: ZoneId[] = ['crown', 'hairline', 'sides', 'strands'];
type Reminder = 'chime' | 'voice' | 'visual';

function Demo() {
  const [phase, setPhase] = useState<'intro' | 'starting' | 'live' | 'error'>('intro');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState(0);
  const [reminder, setReminder] = useState<Reminder>('chime');
  const [sensitivity, setSensitivity] = useState<Sensitivity>('balanced');
  const [live, setLive] = useState({ face: false, hand: false, hair: false, p: 0 });
  const [cue, setCue] = useState<{ n: number; text: string } | null>(null);
  const [count, setCount] = useState(0);
  const [voice, setVoice] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const vision = useRef<VisionClient | null>(null);
  const pipe = useRef<DetectorPipeline | null>(null);
  const player = useRef<Player | null>(null);
  const settings = useRef({ reminder, voice });
  settings.current = { reminder, voice };
  const lastUi = useRef(0);

  useEffect(() => { pipe.current = new DetectorPipeline(configFor(sensitivity, 0, { cooldownMs: 3000 }), null, ZONES); }, [sensitivity]);
  useEffect(() => () => stop(), []);

  const remind = async () => {
    setCount((c) => c + 1);
    const n = Date.now();
    setCue({ n, text: microPromptText('rotate', Math.floor(Math.random() * 4)) ?? 'Lower your hand gently.' });
    window.setTimeout(() => setCue((c) => (c?.n === n ? null : c)), 6000);
    const { reminder: r, voice: v } = settings.current;
    if (r === 'visual') return;
    const p = player.current;
    if (!p) return;
    await p.resume();
    p.chime();
    if (r === 'voice' && v) {
      await p.load([{ id: 'mine', blob: v }]);
      p.clip('mine', CHIME_MS + 250);
    }
  };

  const onFrame = (f: OverlayFrame) => {
    const out = pipe.current?.process(f.frame);
    if (!out) return;
    if (out.events.some((e) => e.type === 'alertThresholdReached')) void remind();
    const now = performance.now();
    if (now - lastUi.current > 120) {
      lastUi.current = now;
      setLive({ face: !!out.geom, hand: out.features.hasHand, hair: !!out.features.zone || out.features.hairContact >= HAIR_TOUCH, p: out.pSmooth });
    }
  };

  const start = async () => {
    setPhase('starting');
    setError('');
    try {
      const s = await openCamera();
      stream.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      player.current = new Player(0.7);
      const v = new VisionClient({
        cfg: configFor('balanced'), calib: null, zones: ZONES, emitFrames: true,
        onMessage: (m) => {
          if (m.type === 'frame') onFrame(m.data);
          else if (m.type === 'ready') setReady(true);
          else if (m.type === 'stats') setFps(m.stats.fps);
          else if (m.type === 'error' && m.message.startsWith('model load')) { setPhase('error'); setError('The on-device detector could not load in this browser. Please try the latest Chrome or Edge.'); }
        },
      });
      vision.current = v;
      v.attach(s.getVideoTracks()[0].clone());
      setPhase('live');
    } catch (e) {
      const name = (e as DOMException).name;
      setPhase('error');
      setError(name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this site (the camera icon in the address bar), then try again.'
        : name === 'NotFoundError' ? 'No camera was found. Connect a camera and try again.'
        : 'The camera could not start. Another app may be using it.');
    }
  };

  function stop() {
    vision.current?.terminate();
    vision.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void player.current?.close();
    player.current = null;
    setReady(false);
    setPhase('intro');
  }

  return (
    <main id="main" tabIndex={-1} className="wrap try-page">
      <h1>Try TrichFree</h1>
      <p className="lead">Allow your camera, then reach toward your hair and hold your hand there for a moment. You will get a gentle reminder. Everything runs on this device: no video is uploaded or saved.</p>
      {!hasTrackProcessor() && <Notice tone="info">This demo is built for Chrome or Edge. Your browser can still try it, but it may be slower.</Notice>}

      <div className="try-grid">
        <div className="stack">
          <div className="videoWrap" aria-label="Your camera preview, shown only to you">
            <video ref={videoRef} muted playsInline />
            {phase === 'intro' && <div className="video-placeholder">Camera off</div>}
            {phase !== 'intro' && !ready && phase !== 'error' && <div className="hud">Loading the on-device detector…</div>}
            {cue && <div className="cue" role="alert"><strong>Hands down?</strong> {cue.text}</div>}
          </div>
          {phase === 'intro' && <button className="btn primary big" onClick={() => void start()}>Turn on camera</button>}
          {phase === 'starting' && <p role="status">Starting the camera…</p>}
          {phase === 'error' && <><Notice tone="warn">{error}</Notice><button className="btn" onClick={() => void start()}>Try again</button></>}
          {phase === 'live' && <button className="btn" onClick={stop}>Turn camera off</button>}
        </div>

        <div className="stack">
          <section className="card stack" aria-labelledby="try-status">
            <h2 id="try-status">What TrichFree sees</h2>
            <ul className="checklist" aria-live="polite">
              <li data-ok={live.face}>{live.face ? 'Face in view' : 'Looking for your face…'}</li>
              <li data-ok={live.hand}>{live.hand ? 'Hand in view' : 'Raise a hand toward your hair'}</li>
              <li data-ok={live.hair}>{live.hair ? 'Hand at your hair: hold it a moment' : 'Not at your hair'}</li>
            </ul>
            <div className="meter" role="meter" aria-label="Detection level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(live.p * 100)}><div style={{ width: `${Math.round(live.p * 100)}%` }} /></div>
            <p className="small muted">{phase === 'live' && ready ? `Running on this device${fps ? ` at ${fps.toFixed(0)} frames per second` : ''}.` : 'The detector runs entirely in this browser tab.'} Reminders so far: <strong>{count}</strong></p>
          </section>
          <section className="card stack" aria-labelledby="try-rem">
            <h2 id="try-rem">Your reminder</h2>
            <Choices<Reminder> legend="Reminder type" value={reminder} onChange={setReminder} options={[
              { value: 'chime', title: 'Gentle chime' },
              { value: 'voice', title: 'Your own voice', desc: 'Record a line below' },
              { value: 'visual', title: 'Visual only' },
            ]} />
            {reminder === 'voice' && <VoiceLine value={voice} onChange={setVoice} />}
            <div className="field">
              <span className="label">Sensitivity</span>
              <Seg<Sensitivity> label="Sensitivity" value={sensitivity} onChange={setSensitivity} options={[['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['sensitive', 'Sensitive']]} />
            </div>
          </section>
        </div>
      </div>

      <section className="card stack next" aria-labelledby="try-next">
        <h2 id="try-next">Want this while you work?</h2>
        <p>The TrichFree browser extension keeps watching quietly in the background while you use any app, remembers your recordings, and learns from your feedback. It is in pilot preparation now.</p>
        <div className="row">
          {SITE.accounts && <a className="btn primary" href="/#pilot">Join the pilot</a>}
          <a className={`btn${SITE.accounts ? '' : ' primary'}`} href="/#extension">{SITE.downloadUrl || SITE.storeUrl ? 'Get the extension' : 'About the extension'}</a>
          <a className="btn ghost" href="/privacy/">How your privacy is protected</a>
        </div>
        <p className="small muted">TrichFree notices possible hand-to-hair movements. It cannot tell every pull apart from ordinary touching, and it is not a medical device.</p>
      </section>
    </main>
  );
}

/** Records a short line for this demo only. It lives in this tab's memory and is gone when you leave. */
function VoiceLine({ value, onChange }: { value: Blob | null; onChange: (b: Blob | null) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [msg, setMsg] = useState('');
  const rec = useRef<{ r: MediaRecorder; s: MediaStream; chunks: Blob[] } | null>(null);
  const start = async () => {
    setMsg('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(s);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.start(250);
      rec.current = { r, s, chunks };
      setState('rec');
      window.setTimeout(() => { if (rec.current?.r === r && r.state === 'recording') void stop(); }, 8000);
    } catch {
      setMsg('The microphone could not start. Allow it for this site and try again.');
    }
  };
  const stop = async () => {
    const cur = rec.current;
    rec.current = null;
    if (!cur) return;
    setState('busy');
    await new Promise<void>((res) => { cur.r.onstop = () => res(); cur.r.stop(); });
    cur.s.getTracks().forEach((t) => t.stop());
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await new Blob(cur.chunks).arrayBuffer());
      const out = processClip(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), buf.sampleRate);
      await ctx.close();
      if (!out) { setMsg('We didn’t hear anything. Try again a little closer to the microphone.'); onChange(null); }
      else { onChange(new Blob([out.wav as BlobPart], { type: 'audio/wav' })); setMsg('Recorded. It is only kept in this tab.'); }
    } catch {
      setMsg('That recording could not be processed. Please try again.');
    }
    setState('idle');
  };
  return (
    <div className="stack">
      <p className="hand quote-small">“Hey, it’s me. Your hand is up there.”</p>
      <div className="row">
        {state !== 'rec'
          ? <button className="btn" disabled={state === 'busy'} onClick={() => void start()}>{value ? 'Record again' : 'Record (up to 8 s)'}</button>
          : <button className="btn primary" onClick={() => void stop()}>Stop recording</button>}
        {value && state === 'idle' && <button className="btn ghost" onClick={() => new Audio(URL.createObjectURL(value)).play()}>Play</button>}
      </div>
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<><SiteHeader /><Demo /></>);
