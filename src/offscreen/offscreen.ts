// Offscreen document: owns all real-time state while desk mode is on. Camera → worker → engine → reminder + logs.
// Offscreen documents only get chrome.runtime, so all chrome.storage / notifications / badge work goes via the SW.
import { localDate, resolveArm } from '../core/arms';
import { configFor, LIGHT_FPS, type DetectorConfig } from '../core/detectorConfig';
import { initialEngine, reduce, type Effect, type EngineContext, type EngineEvent, type EngineState } from '../core/engine';
import { featureVector } from '../core/features';
import { deskHealth } from '../core/health';
import type { Calibration, ClipMeta, DetectorEvent, Episode } from '../core/types';
import { activeCalibration, db, getSettings, outputModeOf, setSettings, uid, type AppSettings, type EventRow, type SessionRow } from '../shared/db';
import { on, send, type DeskErrorKind, type DeskStatus, type OverlayFrame } from '../shared/messages';
import { enqueue, flush, sharingEnabled } from '../shared/uploadQueue';
import { episodeRow, eventRow, sessionRow } from '../shared/telemetry';
import { openCamera, VisionClient } from '../shared/visionClient';
import type { WorkerOut, WorkerStats } from '../workers/protocol';
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
  errorKind?: DeskErrorKind;
  today: { detections: number; interrupted: number };
  fpsSamples: number[];
  faceSeconds: number;
  slowSince: number | null;
  slowWarned: boolean;
  attachedAt: number;
  lastFrameAt: number | null;
  lastFaceAt: number | undefined;
  alertCount: number;
  cameraRetry: { until: number; timer: number } | null;
  timers: number[];
  featureRing: { t: number; x: number[] }[];
  overlayUntil: number;
  lastOverlayPost: number;
  pendingAlertAt: number | null;
}

let run: Run | null = null;
let starting: Promise<void> | null = null;

const configOf = (s: AppSettings, calib: Calibration | null) => configFor(s.sensitivity, calib?.extraDwellMs ?? 0, {
  cooldownMs: s.cooldownSeconds * 1000, ...(s.lighterDetection ? { targetFps: LIGHT_FPS } : {}),
});

// ---------- lifecycle ----------

async function start() {
  if (run) return;
  const settings = await getSettings();
  const calib = await activeCalibration(settings);
  const cfg = configOf(settings, calib);
  const clipRows = await db.clips.toArray();
  const player = new Player(settings.chimeVolume / 100);
  await player.load(clipRows);
  await player.resume();

  const session: SessionRow = {
    id: uid(), participantCode: settings.participantCode, startedAt: Date.now(), deskMinutes: 0, fpsAvg: 0, outputMode: outputModeOf(settings.intervention),
  };
  await db.sessions.put(session);

  const clips: ClipMeta[] = clipRows.filter((c) => player.has(c.id)).map(({ id, category, createdAt, lastPlayedAt, playCount }) => ({ id, category, createdAt, lastPlayedAt, playCount }));
  const r: Run = {
    settings, cfg, stream: null, vision: null, player, engine: initialEngine(), session, stats: null, status: 'starting',
    today: await todayCounts(), fpsSamples: [], faceSeconds: 0, slowSince: null, slowWarned: false,
    attachedAt: Date.now(), lastFrameAt: null, lastFaceAt: undefined, alertCount: 0,
    cameraRetry: null, timers: [], featureRing: [], overlayUntil: 0, lastOverlayPost: 0, pendingAlertAt: null,
    ctx: {
      sessionId: session.id, participantCode: settings.participantCode, clips,
      checkMs: cfg.checkMs, cooldownMs: cfg.cooldownMs, followUp: settings.followUp, chimeMs: CHIME_MS, chimeToClipGapMs: cfg.chimeToClipGapMs,
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
    r.attachedAt = Date.now();
    r.lastFrameAt = null;
    if (r.cameraRetry) { clearInterval(r.cameraRetry.timer); r.cameraRetry = null; logEvent('camera_restored'); }
    setStatus('starting');
    return true;
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      r.error = 'TrichFree needs permission to use the camera. Open TrichFree and allow the camera.';
      r.errorKind = 'camera_permission';
      setStatus('error');
      return false;
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      r.error = 'No camera was found. Connect a camera and start again.';
      r.errorKind = 'camera_unavailable';
      setStatus('error');
      return false;
    }
    onCameraLost(name || 'getUserMedia failed');
    return false;
  }
}

/** The camera permission was removed (e.g. in the browser's site settings): waiting for the camera will not help. */
function permissionRemoved(r: Run) {
  if (r.cameraRetry) { clearInterval(r.cameraRetry.timer); r.cameraRetry = null; }
  r.error = 'TrichFree needs permission to use the camera. Open TrichFree and allow the camera.';
  r.errorKind = 'camera_permission';
  setStatus('error');
}

async function cameraPermissionDenied(): Promise<boolean> {
  try { return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state === 'denied'; } catch { return false; }
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
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') permissionRemoved(r);
      /* otherwise still busy: try again */
    }
  }, 10_000);
  r.cameraRetry = { until, timer };
  // A track that ends because the permission was revoked: say so now, not "waiting for the camera" for 5 minutes.
  void cameraPermissionDenied().then((denied) => { if (denied && run === r) permissionRemoved(r); });
}

// ---------- worker → engine ----------

function onWorker(m: WorkerOut) {
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
      if (m.message.startsWith('model load')) {
        r.error = 'The on-device detector could not load. Try restarting TrichFree.';
        r.errorKind = 'models';
        setStatus('error');
      }
      break;
  }
}

function onFrame(r: Run, d: OverlayFrame) {
  const now = Date.now();
  r.lastFrameAt = now;
  if (d.frame.face) r.lastFaceAt = now;
  // Keep ~5 s of feature vectors for feedback labels (Section 4.8). Never pixels.
  r.featureRing.push({ t: d.frame.t, x: featureVector(d.features, d.pSmooth) });
  while (r.featureRing.length && d.frame.t - r.featureRing[0].t > 5000) r.featureRing.shift();
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
  const res = resolveArm({ outputMode: outputModeOf(s.intervention), pilot, now: Date.now() });
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
        if (e.alertNo === 1) r.today.detections += 1;
        // Visual mode: the notification *is* the reminder. Sound modes: an optional quiet notification with feedback buttons.
        if (e.arm === 'VISUAL' || r.settings.visualNotifications) {
          send({ target: 'sw', type: 'ALERT', episodeId: e.episodeId, arm: e.arm, alertNo: e.alertNo, n: r.alertCount++ });
        }
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
  if (ep.alertAt != null && ep.arm === 'SILENT') r.today.detections += 1; // counted here: silent alerts emit no notifyAlert
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
  if (r.status === 'starting' || r.status === 'watching' || r.status === 'slow' || r.status === 'problem') {
    const h = deskHealth({ now: Date.now(), attachedAt: r.attachedAt, lastFrameAt: r.lastFrameAt, fps, slowSince: r.slowSince, targetFps: r.cfg.targetFps });
    r.slowSince = h.slowSince;
    r.status = h.status;
    r.errorKind = h.status === 'problem' ? (h.reason === 'no_frames' ? 'models' : 'stalled') : undefined;
    if (h.status === 'slow' && !r.slowWarned) { r.slowWarned = true; logEvent('fps_warning', { fps: Math.round(fps * 10) / 10 }); }
    if (h.status === 'watching') r.slowWarned = false;
  }
  send({
    target: 'sw', type: 'STATUS', status: r.status, fps, delegate: r.stats?.delegate, phase: r.engine.phase, today: r.today,
    error: r.status === 'error' ? r.error : undefined, errorKind: r.errorKind, lastFaceAt: r.lastFaceAt,
  });
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
  r.cfg = configOf(r.settings, calib);
  r.ctx.cooldownMs = r.cfg.cooldownMs;
  r.ctx.followUp = r.settings.followUp;
  r.player.setVolume(r.settings.chimeVolume / 100);
  r.vision?.update({ cfg: r.cfg, calib, zones: r.settings.zones });
  r.session.outputMode = outputModeOf(r.settings.intervention);
  // Clips may have been re-recorded or deleted.
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
        send({ target: 'sw', type: 'STATUS', status: 'error', fps: 0, phase: 'IDLE', today: { detections: 0, interrupted: 0 }, error: 'TrichFree could not start. Try again.', errorKind: 'other' });
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
