// Record → preview → save (or discard) → play / re-record / delete. Clips stay in this browser's IndexedDB.
import { useEffect, useRef, useState } from 'react';
import type { ClipCategory } from '../../core/types';
import { db, uid, type ClipRow } from '../../shared/db';
import { send } from '../../shared/messages';
import { MAX_RECORD_MS, type PromptCard } from '../../shared/prompts';
import { ClipRecorder } from '../recorder';
import { LevelMeter } from './LevelMeter';

type Pending = { blob: Blob; durationMs: number; sourceMimeType: string };

export function VoiceRecorder({ prompt, clip, onChange }: { prompt: PromptCard; clip?: ClipRow; onChange?: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'processing' | 'preview'>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [msg, setMsg] = useState('');
  const rec = useRef<ClipRecorder | null>(null);
  const started = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = window.setInterval(() => setElapsed(Date.now() - started.current), 100);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => { rec.current?.cancel(); stopAudio(); }, []);

  const stopAudio = () => {
    if (audio.current) { audio.current.pause(); URL.revokeObjectURL(audio.current.src); audio.current = null; }
  };
  const play = (blob: Blob) => {
    stopAudio();
    const a = new Audio(URL.createObjectURL(blob));
    audio.current = a;
    a.onended = stopAudio;
    void a.play();
  };

  const start = async () => {
    setMsg('');
    const r = new ClipRecorder();
    rec.current = r;
    try {
      await r.start(setLevel, () => void stop());
      started.current = Date.now();
      setElapsed(0);
      setState('recording');
    } catch (e) {
      rec.current = null;
      if ((e as DOMException).name === 'AbortError') return; // left the page while the microphone was starting
      setMsg((e as DOMException).name === 'NotAllowedError'
        ? 'The microphone is blocked for TrichFree. Allow it in the browser’s site settings, then try again.'
        : `The microphone could not start (${(e as Error).message}).`);
    }
  };

  const stop = async () => {
    const r = rec.current;
    rec.current = null;
    setLevel(0);
    if (!r) return;
    setState('processing');
    const out = await r.stop().catch(() => null);
    if (!out) { setState('idle'); setMsg('We didn’t hear anything. Try again a little closer to the microphone.'); return; }
    setPending(out);
    setState('preview');
  };

  const save = async () => {
    if (!pending) return;
    try {
      // One transaction: if storing the new recording fails, the old one is not deleted either.
      await db.transaction('rw', db.clips, async () => {
        const old = await db.clips.where('category').equals(prompt.category).toArray();
        await db.clips.bulkDelete(old.map((c) => c.id));
        await db.clips.put({
          id: uid(), category: prompt.category as ClipCategory, blob: pending.blob, mimeType: 'audio/wav', sourceMimeType: pending.sourceMimeType,
          durationMs: pending.durationMs, createdAt: Date.now(), playCount: 0, recordedBySomeoneElse: clip?.recordedBySomeoneElse ?? false,
        });
      });
    } catch (e) {
      const full = /quota/i.test(`${(e as Error)?.name} ${(e as Error)?.message} ${(e as { inner?: Error })?.inner?.name ?? ''}`);
      setMsg(`This recording could not be saved${full ? ': the computer seems to be out of storage space' : ''}. Your earlier recording is unchanged. Free some space, then press Save again.`);
      return; // keep the preview so the user can try again
    }
    setPending(null);
    setState('idle');
    setMsg('Saved.');
    await send({ target: 'sw', type: 'SETTINGS_CHANGED' }); // the running detector reloads its clips
    onChange?.();
  };

  const remove = async () => {
    if (!clip) return;
    stopAudio();
    await db.clips.delete(clip.id);
    setMsg('Deleted.');
    await send({ target: 'sw', type: 'SETTINGS_CHANGED' });
    onChange?.();
  };

  return (
    <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
      {state === 'recording' && (
        <>
          <LevelMeter rms={level} />
          <p className="small muted" aria-live="polite">Recording… {(elapsed / 1000).toFixed(0)} of {MAX_RECORD_MS / 1000} seconds</p>
          <button className="btn primary" onClick={() => void stop()}>Stop recording</button>
        </>
      )}
      {state === 'processing' && <p className="small muted" role="status">Processing…</p>}
      {state === 'preview' && pending && (
        <>
          <p className="small" role="status">Listen back. Keep it if it sounds right.</p>
          <div className="row">
            <button className="btn" onClick={() => play(pending.blob)}>Play ({(pending.durationMs / 1000).toFixed(1)} s)</button>
            <button className="btn primary" onClick={() => void save()}>Save</button>
            <button className="btn ghost" onClick={() => { setPending(null); setState('idle'); }}>Discard</button>
          </div>
        </>
      )}
      {state === 'idle' && (
        <div className="row">
          <button className={`btn ${clip ? '' : 'primary'}`} onClick={() => void start()} aria-label={`${clip ? 'Re-record' : 'Record'}: ${prompt.title}`}>{clip ? 'Re-record' : 'Record'}</button>
          {clip && <button className="btn" onClick={() => play(clip.blob)} aria-label={`Play: ${prompt.title}`}>Play ({(clip.durationMs / 1000).toFixed(1)} s)</button>}
          {clip && <button className="btn ghost" onClick={() => void remove()} aria-label={`Delete: ${prompt.title}`}>Delete</button>}
        </div>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}
