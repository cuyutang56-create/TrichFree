// Offscreen document: owns all real-time state while desk mode is on. Camera → worker → engine → audio + logs.
// Offscreen documents only get chrome.runtime, so all chrome.storage / notifications / badge work goes via the SW.
import { localDate, resolveArm } from '../core/arms';
import { configFor, type DetectorConfig } from '../core/detectorConfig';
import { initialEngine, reduce, type Effect, type EngineContext, type EngineEvent, type EngineState } from '../core/engine';
import { featureVector } from '../core/features';
import type { ClipMeta, DetectorEvent, Episode } from '../core/types';
import { activeCalibration, db, getSettings, setSettings, uid, type AppSettings, type EventRow, type SessionRow } from '../shared/db';
import { on, send, type DeskStatus, type OverlayFrame } from '../shared/messages';
import { enqueue, flush, sharingEnabled } from '../shared/uploadQueue';
import { episodeRow, eventRow, sessionRow } from '../shared/telemetry';
import { openCamera, VisionClient } from '../shared/visionClient';
import type { WorkerStats } from '../workers/protocol';
import { CHIME_MS, Player } from './player';
import { maybeRetrain } from '../shared/personalModel';

interface Run {
  settings: AppSettings;
  cfg: DetectorConfig;
  stream: MediaStream | null;
  vision: VisionClient | null;
  player: Player;
  engine: EngineState;
  ctx: EngineContext;
  session: SessionRow;
  stats: WorkerStats | null;
  status: DeskStatus;
  error?: string;
  today: { detections: number; interrupted: number };
  fpsSamples: number[];
  faceSeconds: number;
  slowSince: number | null;
  problemSince: number | null;
  slowWarned: boolean;
  cameraRetry: { until: number; timer: number } | null;
  timers: number[];
  featureRing: { t: number; x: number[] }[];
  overlayUntil: number;
  lastOverlayPost: number;
  pendingAlertAt: number | null;
}

let run: Run | null = null;
let starting: Promise<void> | null = null;

// ---------- lifecycle ----------

async function start() {
  if (run) return;
  const settings = await getSettings();
  const calib = await activeCalibration(settings);
  const cfg = configFor(settings.sensitivity, calib?.extraDwellMs ?? 0);
  const clipRows = await db.clips.toArray();
  const player = new Player();
  await player.load(clipRows);
  await player.resume();

  const session: SessionRow = {
    id: uid(), participantCode: settings.participantCode, startedAt: Date.now(), deskMinutes: 0, fpsAvg: 0, outputMode: settings.outputMode,
  };
  await db.sessions.put(session);

  const clips: ClipMeta[] = clipRows.filter((c) => player.has(c.id)).map(({ id, category, createdAt, lastPlayedAt, playCount }) => ({ id, category, createdAt, lastPlayedAt, playCount }));
  const r: Run = {
    settings, cfg, stream: null, vision: null, player, engine: initialEngine(), session, stats: null, status: 'starting',
    today: await todayCounts(), fpsSamples: [], faceSeconds: 0, slowSince: null, problemSince: null, slowWarned: false,
    cameraRetry: null, timers: [], featureRing: [], overlayUntil: 0, lastOverlayPost: 0, pendingAlertAt: null,
    ctx: {
      sessionId: session.id, participantCode: settings.participantCode, clips,
      checkMs: cfg.checkMs, cooldownMs: cfg.cooldownMs, chimeMs: CHIME_MS, chimeToClipGapMs: cfg.chimeToClipGapMs,
      newId: uid,
      decideArm: () => decideArm(),
    },
  };
  run = r;
  r.vision = new VisionClient({ cfg, calib, zones: settings.zones, emitFrames: true, onMessage: onWorker });
  await attachCamera();
  void maybeRetrain().then((m) => r.vision?.update({ model: m }));

  r.timers.push(window.setInterval(() => dispatch({ type: 'tick', t: Date.now() }), 250));
  r.timers.push(window.setInterval(statusTick, 1000));
  r.timers.push(window.setInterval(() => { void persistSession(); void flush(); }, 60_000));
  statusTick();
}

async function stop() {
  const r = run;
  if (!r) return;
  run = null;
  r.timers.forEach(clearInterval);
  if (r.cameraRetry) clearInterval(r.cameraRetry.timer);
  // Close any open episode as if the hand had left now.
  if (r.engine.episode) {
    const t = Date.now();
    handleEffects(r, reduce(r.engine, { type: 'handLeft', t, leftAt: t, stats: { zone: r.engine.episode.zone, pinchFraction: r.engine.episode.pinchFraction, rMedian: r.engine.episode.rMedian, pSmoothMax: r.engine.episode.pSmoothMax } }, t, r.ctx).effects);
  }
  r.vision?.terminate();
  r.stream?.getTracks().forEach((t) => t.stop());
  await r.player.close();
  r.session.endedAt = Date.now();
  await persistSession(r);
  const share = await sharingEnabled();
  if (share.on && share.code) await enqueue('sessions', sessionRow(r.session, share.code));
  await flush();
}

// ---------- camera ----------

async function attachCamera(): Promise<boolean> {
  const r = run;
  if (!r) return false;
  try {
    const stream = await openCamera();
    const track = stream.getVideoTracks()[0];
    r.stream = stream;
    track.addEventListener('ended', () => onCameraLost('ended'));
    track.addEventListener('mute', () => { if (run === r) { setStatus('camera_busy'); logEvent('camera_busy'); } });
    track.addEventListener('unmute', () => { if (run === r) setStatus('watching'); });
    r.vision!.attach(track);
    if (r.cameraRetry) { clearInterval(r.cameraRetry.timer); r.cameraRetry = null; logEvent('camera_restored'); }
    setStatus('watching');
    return true;
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError') { r.error = 'Camera permission is needed. Open TrichFree and allow the camera.'; setStatus('error'); return false; }
    onCameraLost(name || 'getUserMedia failed');
    return false;
  }
}

function onCameraLost(reason: string) {
  const r = run;
  if (!r || r.cameraRetry) return;
  setStatus('camera_busy');
  logEvent('camera_busy', { reason });
  r.stream?.getTracks().forEach((t) => t.stop());
  r.stream = null;
  // The worker's stream is gone; start a fresh worker on reconnect.
  r.vision?.terminate();
  r.vision = null;
  const until = Date.now() + 5 * 60_000;
  const timer = window.setInterval(async () => {
    if (run !== r) return;
    if (Date.now() > until) {
      clearInterval(timer);
      r.cameraRetry = null;
      send({ target: 'sw', type: 'CAMERA_LOST' });
      return;
    }
    try {
      const probe = await openCamera();
      probe.getTracks().forEach((t) => t.stop());
      const calib = await activeCalibration(r.settings);
      r.vision = new VisionClient({ cfg: r.cfg, calib, zones: r.settings.zones, emitFrames: true, onMessage: onWorker });
      await attachCamera();
      r.vision?.update({ model: (await getSettings()).personalModel ?? null });
    } catch { /* still busy */ }
  }, 10_000);
  r.cameraRetry = { until, timer };
}

// ---------- worker → engine ----------

function onWorker(m: import('../workers/protocol').WorkerOut) {
  const r = run;
  if (!r) return;
  switch (m.type) {
    case 'events':
      for (const ev of m.events) dispatch(ev);
      break;
    case 'stats':
      r.stats = m.stats;
      r.fpsSamples.push(m.stats.fps);
      if (m.stats.faceSeenRatio > 0.5) r.faceSeconds += 1;
      r.session.delegate = m.stats.delegate;
      break;
    case 'frame':
      onFrame(r, m.data);
      break;
    case 'streamEnded':
      onCameraLost('stream ended');
      break;
    case 'error':
      console.warn('[offscreen] worker', m.message);
      if (m.message.startsWith('model load')) { r.error = m.message; setStatus('error'); }
      break;
  }
}

function onFrame(r: Run, d: OverlayFrame) {
  // Keep ~5 s of feature vectors for feedback labels (Section 4.8). Never pixels.
  r.featureRing.push({ t: d.frame.t, x: featureVector(d.features, d.pSmooth) });
  while (r.featureRing.length && d.frame.t - r.featureRing[0].t > 5000) r.featureRing.shift();
  const now = Date.now();
  if (now < r.overlayUntil && now - r.lastOverlayPost > 90) {
    r.lastOverlayPost = now;
    send({ target: 'ui', type: 'OVERLAY', data: { ...d, enginePhase: r.engine.phase } });
  }
}

function decideArm() {
  const r = run!;
  const s = r.settings;
  const pilot = s.participantCode && s.pilotConsent && s.enrolledDate
    ? { code: s.participantCode, enrolledDate: s.enrolledDate, nextIndex: s.pilotEpisodeIndex, baselineDays: r.cfg.pilotBaselineDays, totalDays: r.cfg.pilotTotalDays }
    : null;
  const res = resolveArm({ outputMode: s.outputMode, pilot, now: Date.now() });
  if (res.consumesIndex) {
    s.pilotEpisodeIndex += 1;
    void setSettings({ pilotEpisodeIndex: s.pilotEpisodeIndex });
  }
  return { arm: res.arm, pilotDay: res.pilotDay };
}

function dispatch(ev: EngineEvent | DetectorEvent) {
  const r = run;
  if (!r) return;
  if (r.status === 'camera_busy' && ev.type !== 'tick' && ev.type !== 'feedback') return;
  const now = Date.now();
  if (ev.type === 'alertThresholdReached') r.pendingAlertAt = now;
  const { state, effects } = reduce(r.engine, ev, now, r.ctx);
  r.engine = state;
  handleEffects(r, effects);
}

function handleEffects(r: Run, effects: Effect[]) {
  for (const e of effects) {
    switch (e.type) {
      case 'play': {
        const startAt = e.sound === 'chime' ? r.player.chime() : r.player.clip(e.clipId, e.delayMs);
        if (startAt && r.pendingAlertAt != null) {
          logEvent('alert_latency', { ms: startAt - r.pendingAlertAt, sound: e.sound });
          r.pendingAlertAt = null;
        }
        break;
      }
      case 'clipPlayed': {
        const c = r.ctx.clips.find((x) => x.id === e.clipId);
        if (c) { c.lastPlayedAt = e.t; c.playCount += 1; }
        void db.clips.update(e.clipId, { lastPlayedAt: e.t, playCount: c?.playCount ?? 1 });
        break;
      }
      case 'notifyAlert':
        r.today.detections += 1;
        if (r.settings.notifications) send({ target: 'sw', type: 'ALERT', episodeId: e.episodeId });
        break;
      case 'closeNotify':
        send({ target: 'sw', type: 'EPISODE_END', episodeId: e.episodeId });
        break;
      case 'logEpisode':
        void logEpisode(r, e.episode);
        break;
      case 'logEvent':
        logEvent(e.eventType, e.missed != null ? { missed: e.missed } : undefined, e.episodeId);
        labelFromFeedback(r, e.eventType === 'false_alarm' ? 0 : 1, e.eventType === 'false_alarm' ? 3000 : 5000, e.eventType === 'false_alarm' ? 'not_a_pull' : 'i_pulled');
        break;
    }
  }
}

async function logEpisode(r: Run, ep: Episode) {
  if (ep.outcome === 'interrupted' || ep.outcome === 'interrupted_after_2') r.today.interrupted += 1;
  await db.episodes.put(ep);
  if (ep.outcome === 'interrupted' && ep.alertAt != null) labelFromFeedback(r, 1, ep.endedAt - ep.alertAt, 'hand_down_after_alert', true);
  const share = await sharingEnabled();
  if (share.on && share.code) await enqueue('episodes', episodeRow(ep, share.code));
}

function labelFromFeedback(r: Run, label: 0 | 1, windowMs: number, source: 'not_a_pull' | 'i_pulled' | 'hand_down_after_alert', weak = false) {
  const now = Date.now();
  const rows = r.featureRing.filter((f) => now - f.t <= windowMs && f.x[8] >= 0).map((f) => ({ t: f.t, label, source, weak, x: f.x }));
  if (rows.length) void db.featureSamples.bulkAdd(rows).then(() => maybeRetrain()).then((m) => { if (run === r) r.vision?.update({ model: m }); });
}

function logEvent(type: EventRow['type'], data?: EventRow['data'], episodeId?: string) {
  const ev: EventRow = { id: uid(), type, t: Date.now(), sessionId: run?.session.id, episodeId, data };
  void db.events.add(ev);
  void sharingEnabled().then((s) => { if (s.on && s.code) void enqueue('events', eventRow(ev, s.code)); });
}

// ---------- status ----------

function setStatus(s: DeskStatus) {
  if (!run) return;
  run.status = s;
  statusTick();
}

function statusTick() {
  const r = run;
  if (!r) return;
  const fps = r.stats?.fps ?? 0;
  const now = Date.now();
  let status = r.status;
  if (status === 'watching' || status === 'slow' || status === 'problem') {
    // fps < 8 for 10 s → slow warning; fps < 3 for 10 s → watchdog problem.
    r.slowSince = fps < 8 ? r.slowSince ?? now : null;
    r.problemSince = fps < 3 ? r.problemSince ?? now : null;
    status = r.problemSince && now - r.problemSince > 10_000 ? 'problem' : r.slowSince && now - r.slowSince > 10_000 ? 'slow' : 'watching';
    if (status === 'slow' && !r.slowWarned) { r.slowWarned = true; logEvent('fps_warning', { fps: Math.round(fps * 10) / 10 }); }
    if (status === 'watching') r.slowWarned = false;
    r.status = status;
  }
  send({ target: 'sw', type: 'STATUS', status, fps, delegate: r.stats?.delegate, phase: r.engine.phase, today: r.today, error: r.error });
}

async function persistSession(r = run) {
  if (!r) return;
  const n = r.fpsSamples.length;
  r.session.fpsAvg = n ? r.fpsSamples.reduce((a, b) => a + b, 0) / n : 0;
  r.session.deskMinutes = r.faceSeconds / 60;
  await db.sessions.put({ ...r.session });
}

async function todayCounts() {
  const today = localDate(Date.now());
  const start = new Date(`${today}T00:00:00`).getTime();
  const eps = await db.episodes.where('startedAt').aboveOrEqual(start).toArray();
  const alerted = eps.filter((e) => e.alertAt != null);
  return { detections: alerted.length, interrupted: alerted.filter((e) => e.outcome === 'interrupted' || e.outcome === 'interrupted_after_2').length };
}

async function reloadSettings() {
  const r = run;
  if (!r) return;
  r.settings = await getSettings();
  const calib = await activeCalibration(r.settings);
  r.cfg = configFor(r.settings.sensitivity, calib?.extraDwellMs ?? 0);
  r.vision?.update({ cfg: r.cfg, calib, zones: r.settings.zones });
  r.session.outputMode = r.settings.outputMode;
  // Clips may have been re-recorded.
  const rows = await db.clips.toArray();
  await r.player.load(rows);
  r.ctx.clips = rows.filter((c) => r.player.has(c.id)).map(({ id, category, createdAt, lastPlayedAt, playCount }) => ({ id, category, createdAt, lastPlayedAt, playCount }));
}

// ---------- messages ----------

on('offscreen', async (msg) => {
  switch (msg.type) {
    case 'OFF_START':
      starting ??= start().catch((e) => {
        console.error(e);
        send({ target: 'sw', type: 'STATUS', status: 'error', fps: 0, phase: 'IDLE', today: { detections: 0, interrupted: 0 }, error: String(e) });
      }).finally(() => { starting = null; });
      await starting;
      return { ok: true };
    case 'OFF_STOP':
      await starting;
      await stop();
      send({ target: 'sw', type: 'STOPPED' });
      return { ok: true };
    case 'OFF_FEEDBACK':
      if (!run) return { ok: false };
      await run.player.resume();
      dispatch({ type: 'feedback', kind: msg.kind, t: Date.now() });
      return { ok: true };
    case 'OFF_SETTINGS_CHANGED':
      await reloadSettings();
      return { ok: true };
    case 'OFF_OVERLAY':
      if (run) run.overlayUntil = msg.on ? Date.now() + 5000 : 0;
      return { ok: true };
  }
});

send({ target: 'sw', type: 'OFFSCREEN_READY' });
