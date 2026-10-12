import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../App';
import { deriveCalibration, type CalibFrame } from '../../core/calibration';
import { configFor, DEFAULT_CONFIG } from '../../core/detectorConfig';
import { computeFaceGeom } from '../../core/faceFrame';
import { featureVector } from '../../core/features';
import { HAIR_TOUCH } from '../../core/hair';
import { DetectorPipeline } from '../../core/pipeline';
import type { Calibration, Sensitivity, ZoneId } from '../../core/types';
import { db, uid, type FeatureSampleRow } from '../../shared/db';
import { calibrationRow } from '../../shared/telemetry';
import { enqueue, sharingEnabled } from '../../shared/uploadQueue';
import { CHIME_MS, Player } from '../../offscreen/player';
import { useLocalVision } from '../calibrationSession';
import { CameraBlocked } from '../components/CameraBlocked';
import { ProgressRing } from '../components/ProgressRing';
import { ZONE_LABELS, ZonePicker } from '../components/ZonePicker';
import { drawOverlay } from '../overlay';
import { maybeRetrain } from '../../shared/personalModel';

// Short on purpose: camera check (auto) → zones → one 30-second guided "show me" run → free "try it" play.
type Step = 'camera' | 'zones' | 'show' | 'try' | 'done';

interface Pose { id: string; label: 0 | 1; zone?: ZoneId; pinch?: boolean; title: string; text: string }

const PREP_MS = 1800;
const CAPTURE_MS = 3500;

function reachText(z: ZoneId): string {
  if (z === 'strands') return 'Hold a strand of your hair between thumb and finger, where you usually do. Don’t actually pull.';
  return `Pinch at your ${ZONE_LABELS[z].toLowerCase()}, as if you’re about to pull. Don’t actually pull.`;
}

function buildPoses(zones: ZoneId[]): Pose[] {
  const reaches: Pose[] = zones.map((z) => ({ id: z, label: 1, zone: z, pinch: true, title: ZONE_LABELS[z], text: reachText(z) }));
  const everyday: Pose[] = [
    { id: 'chin-rest', label: 0, title: 'Chin on hand', text: 'Rest your chin on your hand, like you’re thinking.' },
    { id: 'drink', label: 0, title: 'Take a sip', text: 'Drink from a cup or bottle. Miming is fine.' },
    { id: 'touch-face', label: 0, title: 'Touch your face', text: 'Scratch your nose or push up your glasses.' },
  ];
  return [...reaches, ...everyday];
}

export function Calibrate({ settings, update, go }: ScreenProps) {
  const [step, setStep] = useState<Step>('camera');
  const [zones, setZones] = useState<ZoneId[]>(settings.zones);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const v = useLocalVision(step !== 'done', zones);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => v.subscribe((f) => {
    if (canvasRef.current) drawOverlay(canvasRef.current, f, step === 'camera' ? [] : zones, calib);
  }), [v, zones, calib, step]);

  if (v.denied) return <CameraBlocked />;

  const finish = async (pos: number, neg: number, sensitivity: Sensitivity) => {
    const c = { ...calib!, validationPos: pos, validationNeg: neg };
    await db.calibration.put(c);
    await db.events.add({ id: uid(), type: 'validation', t: Date.now(), data: { pos, neg } });
    await update({ activeCalibrationId: c.id, zones, sensitivity, onboarded: true, onboardingStep: 'done' });
    await maybeRetrain(true);
    const share = await sharingEnabled();
    if (share.on && share.code) await enqueue('calibrations', calibrationRow(c, share.code, configFor(sensitivity, c.extraDwellMs).dwellMs));
    setStep('done');
  };

  const stepNo = { camera: 1, zones: 2, show: 3, try: 4, done: 4 }[step];
  return (
    <div>
      <div className="card">
        <div className="row"><h1 style={{ margin: 0 }}>Calibration</h1><span className="spacer" /><span className="pill">Step {stepNo} of 4 · about 2 minutes</span></div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {step === 'camera' && 'A quick camera check. Sit like you normally do.'}
          {step === 'zones' && 'Where do you usually pull? Pick every place that applies.'}
          {step === 'show' && 'Show TrichFree what your hands do. It moves on by itself, so just follow the prompts.'}
          {step === 'try' && 'Now play with it. Reach for your hair and listen.'}
          {step === 'done' && 'You’re all set.'}
        </p>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        {step !== 'done' && (
          <div className="videoWrap" style={{ flex: '1 1 380px' }}>
            <video ref={v.videoRef} muted playsInline />
            <canvas ref={canvasRef} />
            {step === 'camera' && <div className="faceGuide" />}
            {!v.ready && !v.error && <div className="hud">Loading the on-device models…</div>}
          </div>
        )}
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          {v.error && <div className="card warn small" role="alert">{v.error}</div>}
          {step === 'camera' && <CameraCheck v={v} videoRef={v.videoRef} onDone={() => setStep('zones')} />}
          {step === 'zones' && (
            <div className="card">
              <ZonePicker value={zones} onChange={setZones} />
              <p className="small muted" style={{ marginTop: 10 }}><b>Strands / ends</b> covers hair you hold away from your scalp, like a lock beside your face or at your shoulder.</p>
              <button className="primary big" disabled={!zones.length} onClick={async () => { await update({ zones }); setStep('show'); }}>
                {zones.length ? 'Next' : 'Pick at least one'}
              </button>
            </div>
          )}
          {step === 'show' && (
            <ShowMe v={v} zones={zones} onDone={async (frames) => {
              const c = deriveCalibration(frames, zones, DEFAULT_CONFIG, uid(), Date.now());
              await db.calibration.put(c);
              setCalib(c);
              setStep('try');
            }} />
          )}
          {step === 'try' && calib && <TryIt v={v} calib={calib} initial={settings.sensitivity} onFinish={finish} />}
          {step === 'done' && (
            <div className="card soft">
              <h2>Calibration saved</h2>
              <p>Start desk mode from the toolbar button or the Desk page. TrichFree works quietly in the background while you study or work.</p>
              <button className="primary big" onClick={() => go('home')}>Go to desk mode</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- camera check (7.1) ----------------

function CameraCheck({ v, videoRef, onDone }: { v: ReturnType<typeof useLocalVision>; videoRef: React.RefObject<HTMLVideoElement>; onDone: () => void }) {
  const [checks, setChecks] = useState({ face: 0, size: NaN, light: NaN });
  const [okSince, setOkSince] = useState<number | null>(null);
  const [startedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const hist = useRef<{ t: number; seen: boolean }[]>([]);
  const lastBox = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const size = useRef(NaN);

  useEffect(() => v.subscribe((f) => {
    if (f.frame.faceRan === false) return;
    const t = f.frame.t;
    hist.current.push({ t, seen: !!f.frame.face });
    hist.current = hist.current.filter((h) => t - h.t <= 3000);
    if (f.frame.face) {
      const g = computeFaceGeom(f.frame.face, f.frame.width, f.frame.height);
      if (g) { size.current = g.faceW / f.frame.width; lastBox.current = g.faceBoxPx; }
    }
  }), [v]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const t = setInterval(() => {
      const video = videoRef.current;
      let light = NaN;
      const box = lastBox.current;
      if (video && box && video.videoWidth) {
        const w = Math.max(1, Math.round(box.x1 - box.x0)), h = Math.max(1, Math.round(box.y1 - box.y0));
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, box.x0, box.y0, w, h, 0, 0, 32, 32);
        const px = ctx.getImageData(0, 0, 32, 32).data; // analysed locally, then discarded
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        light = sum / (px.length / 4);
      }
      const hs = hist.current;
      const face = hs.length >= 5 && hs.at(-1)!.t - hs[0].t > 2500 ? hs.filter((h) => h.seen).length / hs.length : 0;
      const c = { face, size: size.current, light };
      setChecks(c);
      const ok = face > 0.9 && c.size >= 0.18 && c.size <= 0.45 && c.light > 60;
      setOkSince((s) => (ok ? s ?? Date.now() : null));
      setNow(Date.now());
    }, 500);
    return () => clearInterval(t);
  }, [videoRef]);

  const faceOk = checks.face > 0.9;
  const sizeOk = checks.size >= 0.18 && checks.size <= 0.45;
  const lightOk = checks.light > 60;
  const passed = okSince != null && now - okSince >= 1000;
  const timedOut = now - startedAt > 20_000;
  // Move on by itself as soon as everything looks good: no button to hunt for.
  const advanced = useRef(false);
  useEffect(() => { if (passed && !advanced.current) { advanced.current = true; setTimeout(onDone, 700); } }, [passed, onDone]);
  const item = (ok: boolean, good: string, bad: string) => <li style={{ color: ok ? 'var(--accent)' : undefined }}>{ok ? '✓ ' : '○ '}{ok ? good : bad}</li>;

  return (
    <div className="card">
      <p>Sit as you normally do at your desk, and look at the screen.</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {item(faceOk, 'Face found', 'Looking for your face… keep it inside the oval')}
        {item(sizeOk, 'Good distance', Number.isNaN(checks.size) ? 'Checking distance…' : checks.size < 0.18 ? 'Move a little closer' : 'Move a little farther back')}
        {item(lightOk, 'Enough light', Number.isNaN(checks.light) ? 'Checking light…' : 'Add some light in front of you')}
      </ul>
      {v.stats && <p className="small muted">Running at {v.stats.fps.toFixed(0)} fps ({v.delegate}).</p>}
      {passed ? <p style={{ color: 'var(--accent)', fontWeight: 600 }}>Looks good ✓</p> : timedOut && <button className="primary big" onClick={onDone}>Continue anyway</button>}
    </div>
  );
}


// ---------------- show me: one continuous, auto-advancing run ----------------

type Phase = { kind: 'idle' } | { kind: 'prep'; until: number } | { kind: 'capture'; start: number } | { kind: 'paused' };

function ShowMe({ v, zones, onDone }: { v: ReturnType<typeof useLocalVision>; zones: ZoneId[]; onDone: (frames: CalibFrame[]) => void }) {
  const [poses, setPoses] = useState(() => buildPoses(zones));
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [now, setNow] = useState(Date.now());
  const [hint, setHint] = useState('');
  const frames = useRef<CalibFrame[]>([]);
  const samples = useRef<FeatureSampleRow[]>([]);
  const handFrames = useRef(0);
  const retried = useRef(new Set<string>());
  const pipe = useRef(new DetectorPipeline(DEFAULT_CONFIG, null, zones));
  const st = useRef({ phase, i, poses });
  st.current = { phase, i, poses };
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => v.subscribe((f) => {
    const { phase: ph, i: k, poses: ps } = st.current;
    const out = pipe.current.process(f.frame);
    if (ph.kind !== 'capture' || !out.geom) return;
    const pose = ps[k];
    if (pose.label === 1 && !out.features.hasHand) return;
    if (out.features.hasHand) handFrames.current++;
    samples.current.push({ t: f.frame.t, label: pose.label, source: 'calibration', x: featureVector(out.features, out.pSmooth) });
    if (!out.features.hasHand || !out.tipsUV) return;
    frames.current.push({
      label: pose.label, pose: pose.id, zone: pose.zone, pinchPose: pose.pinch, tipsUV: out.tipsUV, r: out.features.r,
      pinch: out.features.pinch, geom: { v10: out.geom.v10, vBrow: out.geom.vBrow, eyes: out.geom.eyes },
    });
  }), [v]);

  // The clock that drives prep → capture → next pose.
  useEffect(() => {
    const t = setInterval(async () => {
      const n = Date.now();
      setNow(n);
      const { phase: ph, i: k, poses: ps } = st.current;
      if (ph.kind === 'prep' && n >= ph.until) { handFrames.current = 0; setPhase({ kind: 'capture', start: n }); }
      if (ph.kind === 'capture' && n - ph.start >= CAPTURE_MS) {
        const pose = ps[k];
        // Didn't see the hand on a reach: repeat that one pose once, with a hint, instead of failing the run.
        if (pose.label === 1 && handFrames.current < 8 && !retried.current.has(pose.id)) {
          retried.current.add(pose.id);
          setHint('We couldn’t see your hand. Keep it in view of the camera.');
          setPhase({ kind: 'prep', until: n + PREP_MS });
          return;
        }
        setHint('');
        if (k + 1 < ps.length) { setI(k + 1); setPhase({ kind: 'prep', until: n + PREP_MS }); }
        else { setPhase({ kind: 'idle' }); setI(-1); await db.featureSamples.bulkAdd(samples.current); doneRef.current(frames.current); }
      }
    }, 100);
    return () => clearInterval(t);
  }, []);

  const pose = poses[Math.max(0, i)];
  const start = () => { setPoses(buildPoses(zones)); setPhase({ kind: 'prep', until: Date.now() + PREP_MS }); };
  const totalS = Math.round((poses.length * (PREP_MS + CAPTURE_MS)) / 1000);
  const progress = phase.kind === 'capture' ? Math.min(1, (now - phase.start) / CAPTURE_MS) : 0;

  if (i === -1) return <div className="card"><p>Saving…</p></div>;
  if (phase.kind === 'idle' && i === 0) {
    return (
      <div className="card">
        <h2>Show me (about {totalS} seconds)</h2>
        <p>You’ll see {poses.filter((p) => p.label).length === 1 ? 'one reach' : `${poses.filter((p) => p.label).length} reaches`} and 3 everyday moves. Each one lasts a few seconds and the next starts by itself.</p>
        <ol className="small muted">{poses.map((p) => <li key={p.id}>{p.label ? 'Reach: ' : ''}{p.title}</li>)}</ol>
        <button className="primary big" disabled={!v.ready} onClick={start}>{v.ready ? 'Start' : 'Loading…'}</button>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="row">
        <span className={`pill ${pose.label ? 'ok' : ''}`}>{pose.label ? 'Reach' : 'Everyday move'}</span>
        <span className="spacer" />
        <span className="row" aria-label={`Pose ${i + 1} of ${poses.length}`} style={{ gap: 4 }}>
          {poses.map((p, k) => <span key={p.id} style={{ width: 8, height: 8, borderRadius: 4, background: k < i ? 'var(--accent)' : k === i ? 'var(--text)' : 'var(--surface-2)' }} />)}
        </span>
      </div>
      <h2 style={{ marginTop: 12 }}>{pose.title}</h2>
      <p>{pose.text}</p>
      {hint && <p className="small" style={{ color: 'var(--warn)' }}>{hint}</p>}
      <div className="row" style={{ minHeight: 72 }}>
        {phase.kind === 'prep' && <><div className="meter" style={{ flex: 1 }}><div style={{ width: `${100 - Math.max(0, (phase.until - now) / PREP_MS) * 100}%`, background: 'var(--muted)' }} /></div><span className="small muted">Get ready…</span></>}
        {phase.kind === 'capture' && <><ProgressRing value={progress} label="Hold" /><span className="muted">Hold it…</span></>}
        {phase.kind === 'paused' && <span className="muted">Paused</span>}
      </div>
      <div className="row">
        {phase.kind === 'paused'
          ? <button onClick={() => setPhase({ kind: 'prep', until: Date.now() + PREP_MS })}>Resume</button>
          : <button className="ghost" onClick={() => setPhase({ kind: 'paused' })}>Pause</button>}
      </div>
    </div>
  );
}

// ---------------- try it: free play with the real chime and your own voice ----------------

function TryIt({ v, calib, initial, onFinish }: {
  v: ReturnType<typeof useLocalVision>; calib: Calibration; initial: Sensitivity;
  onFinish: (pos: number, neg: number, sensitivity: Sensitivity) => void;
}) {
  const [sens, setSens] = useState<Sensitivity>(initial);
  const [catches, setCatches] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [live, setLive] = useState({ p: 0, zone: null as ZoneId | null, hair: false });
  const [flash, setFlash] = useState(false);
  const [note, setNote] = useState('');
  const player = useRef<Player | null>(null);
  const clipIds = useRef<string[]>([]);
  const pipe = useRef<DetectorPipeline | null>(null);
  const lastUi = useRef(0);
  // Last 3 s of feature vectors, labelled when you catch a reach (1) or say it went off by mistake (0).
  const ring = useRef<{ t: number; x: number[] }[]>([]);
  const label = (y: 0 | 1, windowMs: number) => {
    const now = Date.now();
    const rows = ring.current.filter((f) => now - f.t <= windowMs && f.x[8] >= 0).map((f) => ({ t: f.t, label: y, source: 'calibration' as const, x: f.x }));
    if (rows.length) void db.featureSamples.bulkAdd(rows);
  };

  // Short cooldown here so people can try again quickly.
  useEffect(() => { pipe.current = new DetectorPipeline(configFor(sens, calib.extraDwellMs, { cooldownMs: 1500 }), calib, calib.zones); }, [sens, calib]);

  useEffect(() => {
    const p = new Player();
    player.current = p;
    db.clips.toArray().then(async (rows) => {
      const pick = rows.filter((r) => r.category === 'notice' || r.category === 'instead');
      await p.load(pick.length ? pick : rows);
      clipIds.current = (pick.length ? pick : rows).map((r) => r.id);
    });
    return () => { void p.close(); };
  }, []);

  useEffect(() => v.subscribe((f) => {
    const out = pipe.current?.process(f.frame);
    if (!out) return;
    ring.current.push({ t: Date.now(), x: featureVector(out.features, out.pSmooth) });
    while (ring.current.length && Date.now() - ring.current[0].t > 3000) ring.current.shift();
    if (out.events.some((e) => e.type === 'alertThresholdReached')) {
      label(1, 2000);
      setCatches((c) => c + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
      const pl = player.current;
      if (pl) {
        void pl.resume();
        pl.chime();
        const ids = clipIds.current;
        if (ids.length) pl.clip(ids[Math.floor(Math.random() * ids.length)], CHIME_MS + 250);
      }
    }
    const n = Date.now();
    if (n - lastUi.current > 80) {
      lastUi.current = n;
      setLive({ p: out.pSmooth, zone: out.features.zone, hair: out.features.hairContact >= HAIR_TOUCH });
    }
  }), [v]);

  const missed = () => { setSens('sensitive'); setNote('Switched to Sensitive: it reacts after 1 second.'); };
  const falseAlarm = () => {
    label(0, 3000);
    setMistakes((m) => m + 1);
    if (sens !== 'relaxed') { setSens('relaxed'); setNote('Switched to Relaxed: it waits 2.5 seconds before speaking.'); }
  };
  const goal = 3;

  return (
    <div className={`card ${flash ? 'soft' : ''}`} style={{ transition: 'background .3s' }}>
      <h2>{flash ? 'Caught it ✓' : 'Try it'}</h2>
      <p>Reach for your hair the way you usually do and hold it. When the bar fills, you’ll hear your chime and your own voice. Then try an everyday move and check it stays quiet.</p>
      <div className="stack" style={{ margin: '12px 0' }}>
        <div className="meter" style={{ height: 14, position: 'relative' }} aria-label="Detection level">
          <div style={{ width: `${Math.round(live.p * 100)}%`, background: live.p >= 0.6 ? 'var(--accent)' : 'var(--muted)' }} />
        </div>
        <div className="row small muted">
          <span>{live.zone ? `Hand at: ${ZONE_LABELS[live.zone]}` : 'Hand not at a zone'}</span>
          {live.hair && <span className="pill ok">in hair</span>}
        </div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 12 }} aria-label={`${catches} caught`}>
        {Array.from({ length: Math.max(goal, catches) }, (_, k) => (
          <span key={k} style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', background: k < catches ? 'var(--accent)' : 'var(--surface-2)', color: 'var(--accent-ink)', fontSize: 14 }}>{k < catches ? '✓' : ''}</span>
        ))}
        <span className="small muted">{catches >= goal ? 'Nice. It knows you.' : `${goal - catches} more to go`}</span>
      </div>
      <div className="row small">
        <span className="muted">Speed:</span>
        <div className="seg">
          {(['relaxed', 'balanced', 'sensitive'] as Sensitivity[]).map((s) => <button key={s} className={sens === s ? 'on' : ''} onClick={() => { setSens(s); setNote(''); }}>{s[0].toUpperCase() + s.slice(1)}</button>)}
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="ghost" onClick={missed}>It’s missing me</button>
        <button className="ghost" onClick={falseAlarm}>It went off by mistake</button>
      </div>
      {note && <p className="small muted" role="status">{note}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={catches < 1} onClick={() => onFinish(Math.min(catches, 5), mistakes, sens)}>{catches >= 1 ? 'Looks good, finish' : 'Catch at least one reach'}</button>
        <button className="ghost" onClick={() => onFinish(Math.min(catches, 5), mistakes, sens)}>Skip</button>
      </div>
    </div>
  );
}
