import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../App';
import type { ClipCategory } from '../../core/types';
import { COPY } from '../../shared/copy';
import { db, uid, type ClipRow } from '../../shared/db';
import { send } from '../../shared/messages';
import { PROMPTS, REQUIRED_CATEGORIES, MAX_RECORD_MS } from '../../shared/prompts';
import { LevelMeter } from '../components/LevelMeter';
import { ClipRecorder, micPermission } from '../recorder';

export function Record({ settings, update, go }: ScreenProps) {
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [recording, setRecording] = useState<ClipCategory | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [msg, setMsg] = useState('');
  const [micDenied, setMicDenied] = useState(false);
  const rec = useRef<ClipRecorder | null>(null);
  const started = useRef(0);

  const reload = async () => setClips(await db.clips.orderBy('createdAt').toArray());
  useEffect(() => { void reload(); micPermission().then((p) => setMicDenied(p === 'denied')); }, []);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - started.current), 100);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => rec.current?.cancel(), []);

  const clipFor = (c: ClipCategory) => clips.filter((x) => x.category === c).at(-1);

  const start = async (cat: ClipCategory) => {
    setMsg('');
    const r = new ClipRecorder();
    rec.current = r;
    try {
      await r.start(setLevel, () => void stop(cat));
      started.current = Date.now();
      setElapsed(0);
      setRecording(cat);
    } catch (e) {
      rec.current = null;
      if ((e as DOMException).name === 'NotAllowedError') setMicDenied(true);
      else setMsg(`Couldn't start the microphone: ${(e as Error).message}`);
    }
  };

  const stop = async (cat: ClipCategory) => {
    const r = rec.current;
    rec.current = null;
    setRecording(null);
    setLevel(0);
    if (!r) return;
    const out = await r.stop();
    if (!out) { setMsg("We didn't hear anything. Try again a little closer to the mic."); return; }
    const old = clips.filter((c) => c.category === cat);
    const prev = old.at(-1);
    await db.transaction('rw', db.clips, async () => {
      await db.clips.bulkDelete(old.map((c) => c.id));
      await db.clips.put({
        id: uid(), category: cat, blob: out.blob, mimeType: 'audio/wav', sourceMimeType: out.sourceMimeType,
        durationMs: out.durationMs, createdAt: Date.now(), playCount: 0, recordedBySomeoneElse: prev?.recordedBySomeoneElse ?? false,
      });
    });
    await reload();
    await send({ target: 'sw', type: 'SETTINGS_CHANGED' }); // offscreen re-decodes clips
  };

  const play = (c: ClipRow) => { const a = new Audio(URL.createObjectURL(c.blob)); void a.play(); };
  const toggleOther = async (c: ClipRow) => { await db.clips.update(c.id, { recordedBySomeoneElse: !c.recordedBySomeoneElse }); await reload(); };

  const haveRequired = REQUIRED_CATEGORIES.every((c) => clipFor(c));
  const onboarding = !settings.onboarded;

  return (
    <div>
      <div className="card">
        <h1>Your voice library</h1>
        <p>Record a few short lines in your own voice. When your hand goes up, you'll hear one of them.</p>
        <p className="muted small">One clip (<b>Notice</b>) is enough to start. Add the others any time: the more lines, the less they get old. Up to 15 seconds each.</p>
        <p className="muted small">Tip: hand the mic to someone who loves you for <b>Your reason</b>. Hearing their voice can land differently.</p>
        <div className="card info small" style={{ margin: 0 }}>💡 {COPY.kindWords}</div>
      </div>
      {micDenied && (
        <div className="card warn">
          <h3>Microphone is blocked</h3>
          <p className="small">Click the icon at the right of the address bar (or open <code>chrome://settings/content/microphone</code>), allow the microphone for TrichFree Desk, then reload this page.</p>
        </div>
      )}
      {msg && <div className="card warn small" role="alert">{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {PROMPTS.map((p, idx) => {
          const c = clipFor(p.category);
          const isRec = recording === p.category;
          return (
            <div className={`card ${['lime', 'pink', 'lilac', 'peach', 'lime', 'pink'][idx]}`} key={p.category} style={{ marginBottom: 0 }}>
              <div className="row"><h3 style={{ margin: 0 }}>{p.title}</h3><span className="spacer" />{p.required ? <span className="pill" style={{ background: '#fff', color: 'var(--ink)' }}>Start here</span> : null}{c && <span className="pill" style={{ background: 'var(--ink)', color: '#fff' }}>✓ Saved</span>}</div>
              <p className="hand" style={{ fontSize: 22, lineHeight: 1.2, margin: '8px 0' }}>“{p.example}”</p>
              <p className="small muted">{p.hint}</p>
              {isRec ? (
                <div className="stack">
                  <LevelMeter rms={level} />
                  <div className="row small muted">Recording… {(elapsed / 1000).toFixed(1)} s / {MAX_RECORD_MS / 1000} s</div>
                  <button className="primary" onClick={() => stop(p.category)}>■ Stop</button>
                </div>
              ) : (
                <div className="row">
                  <button className={c ? '' : 'primary'} disabled={!!recording} onClick={() => start(p.category)}>● {c ? 'Re-record' : 'Record'}</button>
                  {c && <button onClick={() => play(c)}>▶ Play ({(c.durationMs / 1000).toFixed(1)} s)</button>}
                </div>
              )}
              {c && !isRec && (
                <label className="check small"><input type="checkbox" checked={!!c.recordedBySomeoneElse} onChange={() => toggleOther(c)} />Recorded by someone else (a parent, partner or friend)</label>
              )}
            </div>
          );
        })}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        {onboarding ? (
          <button className="primary big" disabled={!haveRequired || !!recording} onClick={async () => { await update({ onboardingStep: 'calibrate' }); go('calibrate'); }}>
            {haveRequired ? 'Next: calibrate' : 'Record your Notice clip to continue'}
          </button>
        ) : (
          <button className="primary" onClick={() => go('home')}>Done</button>
        )}
      </div>
    </div>
  );
}
