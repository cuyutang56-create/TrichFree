import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../App';
import type { Calibration, FrameInput } from '../../core/types';
import { activeCalibration, db, uid, type LandmarkRecordRow } from '../../shared/db';
import { downloadBlob } from '../../shared/csvExport';
import type { OverlayFrame } from '../../shared/messages';
import { configFor } from '../../core/detectorConfig';
import { DetectorPipeline } from '../../core/pipeline';
import { useLocalVision } from '../calibrationSession';
import { CameraBlocked } from '../components/CameraBlocked';
import { drawOverlay, readouts } from '../overlay';

const RECORD_MS = 60_000;

export function Debug({ settings }: ScreenProps) {
  const [calib, setCalib] = useState<Calibration | null>(null);
  const zones = settings.zones; // Settings owns the enabled zones; calibration only widens them
  const v = useLocalVision(true, zones, calib);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [last, setLast] = useState<OverlayFrame | null>(null);
  const [recording, setRecording] = useState<{ start: number; frames: FrameInput[] } | null>(null);
  const [records, setRecords] = useState<LandmarkRecordRow[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const recRef = useRef(recording);
  recRef.current = recording;
  const pipe = useRef<DetectorPipeline | null>(null);

  const reload = async () => setRecords(await db.landmarkRecords.orderBy('createdAt').reverse().toArray());
  useEffect(() => { activeCalibration(settings).then(setCalib); void reload(); }, [settings]);
  useEffect(() => { pipe.current = new DetectorPipeline(configFor(settings.sensitivity, calib?.extraDwellMs ?? 0), calib, zones); }, [calib, settings.sensitivity, zones]);

  useEffect(() => v.subscribe((f) => {
    // Re-run the pipeline here with the user's calibration so readouts match desk mode.
    const out = pipe.current?.process(f.frame);
    const d: OverlayFrame = out ? { ...f, features: out.features, p: out.p, pSmooth: out.pSmooth, phase: out.phase, tipsUV: out.tipsUV } : f;
    if (out?.events.length) setEvents((e) => [...out.events.map((x) => `${new Date(x.t).toLocaleTimeString()} ${x.type}`), ...e].slice(0, 12));
    setLast(d);
    if (canvasRef.current) drawOverlay(canvasRef.current, d, zones, calib);
    const r = recRef.current;
    if (r) {
      r.frames.push(f.frame);
      if (Date.now() - r.start >= RECORD_MS) void finish();
    }
  }), [v, zones, calib]);

  const finish = async () => {
    const r = recRef.current;
    if (!r) return;
    setRecording(null);
    recRef.current = null;
    const first = r.frames[0];
    const row: LandmarkRecordRow = {
      id: uid(), createdAt: Date.now(), name: `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
      meta: { width: first?.width ?? 640, height: first?.height ?? 480, fps: v.stats?.fps, zones }, frames: r.frames,
    };
    await db.landmarkRecords.put(row);
    await reload();
  };

  const download = (r: LandmarkRecordRow) => downloadBlob(new Blob([JSON.stringify({ meta: { name: r.name, ...r.meta }, frames: r.frames })], { type: 'application/json' }), `${r.name}.json`);

  if (v.denied) return <CameraBlocked />;
  return (
    <div>
      <div className="card"><h1>Debug</h1><p className="muted small">Live landmarks and features. Recordings hold landmarks only, never pixels. Replay them with <code>npm run replay -- file.json</code>.</p></div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="videoWrap" style={{ flex: '1 1 400px' }}>
          <video ref={v.videoRef} muted playsInline />
          <canvas ref={canvasRef} />
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <div className="card">
            <table className="kv"><tbody>{readouts(last, v.stats?.fps, v.delegate ?? undefined).map(([k, val]) => <tr key={k}><td>{k}</td><td>{val}</td></tr>)}</tbody></table>
            {v.stats && <p className="small muted" style={{ marginTop: 8 }}>inference {v.stats.inferMs.toFixed(1)} ms · face seen {(v.stats.faceSeenRatio * 100).toFixed(0)}%</p>}
            {calib && <p className="small muted">rMin {calib.rMin.toFixed(2)} · rMax {calib.rMax.toFixed(2)} · pinch &lt; {calib.pinchThresh.toFixed(2)} · +{calib.extraDwellMs} ms</p>}
          </div>
          <div className="card">
            {recording
              ? <><p>Recording… {Math.round((Date.now() - recording.start) / 1000)} s / 60 s ({recording.frames.length} frames)</p><button onClick={finish}>Stop now</button></>
              : <button className="primary" disabled={!v.ready} onClick={() => setRecording({ start: Date.now(), frames: [] })}>Record 60 s</button>}
          </div>
          <div className="card small"><h3>Detector events</h3>{events.length ? events.map((e, i) => <div key={i}>{e}</div>) : <span className="muted">None yet</span>}</div>
        </div>
      </div>
      <div className="card">
        <h3>Recordings</h3>
        {!records.length && <p className="muted small">No recordings yet.</p>}
        {records.map((r) => (
          <div className="row small" key={r.id} style={{ padding: '4px 0' }}>
            <span>{r.name} · {r.frames.length} frames</span><span className="spacer" />
            <button onClick={() => download(r)}>Download</button>
            <button className="ghost" onClick={async () => { await db.landmarkRecords.delete(r.id); await reload(); }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
