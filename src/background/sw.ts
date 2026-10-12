// Service worker: owns the desk on/off intent, the offscreen document's lifecycle, commands, notifications,
// alarms (heartbeat, auto-stop, pause), idle detection and the toolbar badge. Keeps no real-time state in globals.
import { db, getSettings, setSettings, uid } from '../shared/db';
import { COPY } from '../shared/copy';
import { mochiSays } from '../shared/mochi';
import { loadProgress } from '../shared/progress';
import { INITIAL_DESK, on, readDesk, send, type DeskState, type FeedbackKind } from '../shared/messages';

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const ALERT_NOTIF_PREFIX = 'alert:';
const WATCHDOG_NOTIF = 'watchdog';
const HEARTBEAT_STALE_MS = 15_000;
const AUTO_STOP_MIN = 180;

// ---------- state helpers ----------

// Serialise read-modify-write so concurrent STATUS messages can't overwrite each other.
let patchChain: Promise<unknown> = Promise.resolve();
function patchDesk(p: Partial<DeskState>): Promise<DeskState> {
  const run = patchChain.then(async () => {
    const next = { ...(await readDesk()), ...p };
    await chrome.storage.local.set({ deskState: next });
    await renderBadge(next);
    return next;
  });
  patchChain = run.catch(() => {});
  return run;
}

async function renderBadge(s: DeskState) {
  let text = '';
  let color = '#3f8f6b';
  if (s.status === 'paused' || s.status === 'camera_busy') { text = 'II'; color = '#8a7a55'; }
  else if (s.status === 'problem' || s.status === 'error') { text = '!'; color = '#d08a1e'; }
  else if (s.wanted && (s.status === 'watching' || s.status === 'slow' || s.status === 'starting')) { text = '•'; color = '#3f8f6b'; }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// ---------- offscreen lifecycle ----------

async function hasOffscreen(): Promise<boolean> {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return ctxs.length > 0;
}

let creating: Promise<void> | null = null;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'On-device hand-to-hair detection from the webcam and playback of the user’s own voice clips.',
    })
    .finally(() => { creating = null; });
  await creating;
}

async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

async function startDesk() {
  const settings = await getSettings();
  await patchDesk({ wanted: true, status: 'starting', startedAt: Date.now(), pausedUntil: undefined, interrupted: false, error: undefined, lastHeartbeat: Date.now(), outputMode: settings.outputMode });
  await chrome.alarms.clear('resume');
  await chrome.alarms.create('autostop', { delayInMinutes: AUTO_STOP_MIN });
  await chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  chrome.idle.setDetectionInterval(600);
  if (await hasOffscreen()) await send({ target: 'offscreen', type: 'OFF_START' });
  else await ensureOffscreen(); // the document announces OFFSCREEN_READY, and we answer with OFF_START
}

async function stopDesk(status: DeskState['status'] = 'off') {
  await patchDesk({ wanted: false, status, fps: 0, phase: undefined });
  await chrome.alarms.clear('autostop');
  await chrome.alarms.clear('heartbeat');
  if (await hasOffscreen()) {
    await Promise.race([send({ target: 'offscreen', type: 'OFF_STOP' }), new Promise((r) => setTimeout(r, 4000))]);
    await closeOffscreen();
  }
  await clearAlertNotifications();
}

async function pauseDesk(minutes: number) {
  await stopDesk('paused');
  await patchDesk({ pausedUntil: Date.now() + minutes * 60_000 });
  await chrome.alarms.create('resume', { delayInMinutes: minutes });
  await logEvent('pause', { minutes });
}

// ---------- feedback ----------

async function feedback(kind: FeedbackKind) {
  const desk = await readDesk();
  const handled = desk.wanted && (await hasOffscreen()) ? ((await send({ target: 'offscreen', type: 'OFF_FEEDBACK', kind })) as { ok?: boolean } | undefined) : undefined;
  if (!handled?.ok) await logEvent(kind === 'i_pulled' ? 'manual_pull' : 'false_alarm', kind === 'i_pulled' ? { missed: true, deskOff: true } : { deskOff: true });
  await clearAlertNotifications();
  chrome.notifications.create(`ack:${Date.now()}`, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: 'Mochi', silent: true, priority: -1,
    message: mochiSays(kind === 'i_pulled' ? 'afterPull' : 'afterNotPull', (await getSettings()).mochiTone),
  }, (id) => setTimeout(() => chrome.notifications.clear(id), 3000));
}

async function logEvent(type: 'manual_pull' | 'false_alarm' | 'pause' | 'watchdog' | 'auto_stop' | 'idle_stop' | 'resume', data?: Record<string, number | string | boolean>) {
  await db.events.add({ id: uid(), type, t: Date.now(), data });
}

async function clearAlertNotifications() {
  const all = await chrome.notifications.getAll();
  for (const id of Object.keys(all)) if (id.startsWith(ALERT_NOTIF_PREFIX)) chrome.notifications.clear(id);
}

// ---------- messages ----------

on('sw', async (msg) => {
  switch (msg.type) {
    case 'DESK_START': await startDesk(); return { ok: true };
    case 'DESK_STOP': await stopDesk(); return { ok: true };
    case 'DESK_PAUSE': await pauseDesk(msg.minutes); return { ok: true };
    case 'FEEDBACK': await feedback(msg.kind); return { ok: true };
    case 'SET_OUTPUT_MODE':
      await setSettings({ outputMode: msg.mode });
      await patchDesk({ outputMode: msg.mode });
      await send({ target: 'offscreen', type: 'OFF_SETTINGS_CHANGED' });
      return { ok: true };
    case 'SETTINGS_CHANGED':
      await scheduleReminder();
      await send({ target: 'offscreen', type: 'OFF_SETTINGS_CHANGED' });
      return { ok: true };
    case 'OFFSCREEN_READY': {
      const d = await readDesk();
      if (d.wanted) await send({ target: 'offscreen', type: 'OFF_START' });
      else await closeOffscreen();
      return { ok: true };
    }
    case 'STATUS': {
      const d = await readDesk();
      if (!d.wanted) return { ok: true };
      const prev = d.status;
      await patchDesk({ status: msg.status, fps: msg.fps, delegate: msg.delegate, phase: msg.phase, today: msg.today, error: msg.error, lastHeartbeat: Date.now() });
      if (msg.status === 'problem' && prev !== 'problem') await watchdogNotify('fps');
      if (msg.status === 'watching') chrome.notifications.clear(WATCHDOG_NOTIF);
      return { ok: true };
    }
    case 'ALERT':
      chrome.notifications.create(`${ALERT_NOTIF_PREFIX}${msg.episodeId}`, {
        type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: `Mochi: ${COPY.alertTitle}`, message: 'Tap a button if I got it wrong. It helps me learn your hands.',
        silent: true, priority: 0, buttons: [{ title: 'Not a pull' }, { title: 'I just pulled' }],
      });
      return { ok: true };
    case 'EPISODE_END':
      chrome.notifications.clear(`${ALERT_NOTIF_PREFIX}${msg.episodeId}`);
      return { ok: true };
    case 'CAMERA_LOST':
      await stopDesk('off');
      chrome.notifications.create(WATCHDOG_NOTIF, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: 'TrichFree paused', message: COPY.cameraLost, silent: true });
      return { ok: true };
    case 'STOPPED':
      return { ok: true };
  }
});

// ---------- Mochi's daily reminder ----------

async function scheduleReminder() {
  const s = await getSettings();
  await chrome.alarms.clear('reminder');
  if (!s.reminderTime || !s.onboarded) return;
  const [h, m] = s.reminderTime.split(':').map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  await chrome.alarms.create('reminder', { when: next.getTime(), periodInMinutes: 24 * 60 });
}

async function remind() {
  const s = await getSettings();
  const d = await readDesk();
  if (!s.onboarded || d.wanted) return;
  const p = await loadProgress(s);
  if (p.streak.todayDone) return; // already showed up today: no nagging
  const seed = new Date().getDate();
  chrome.notifications.create('reminder', {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: 'Mochi', silent: false, priority: 0,
    message: p.streak.current ? mochiSays('reminder', s.mochiTone, { streak: p.streak.current }, seed) : mochiSays('reminderFresh', s.mochiTone, {}, seed),
    buttons: [{ title: 'Start a desk session' }],
  });
}

// ---------- watchdog / alarms ----------

async function watchdogNotify(why: string) {
  await patchDesk({ status: 'problem' });
  await logEvent('watchdog', { why });
  chrome.notifications.create(WATCHDOG_NOTIF, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: COPY.pausedTitle, message: 'Detection stopped responding.', silent: true, requireInteraction: true,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const d = await readDesk();
  if (alarm.name === 'heartbeat') {
    if (!d.wanted) return;
    if (!(await hasOffscreen())) {
      // Chrome closed the document (e.g. AUDIO_PLAYBACK idle timeout): recreate it.
      await ensureOffscreen();
      return;
    }
    if (d.lastHeartbeat && Date.now() - d.lastHeartbeat > HEARTBEAT_STALE_MS && d.status !== 'problem') await watchdogNotify('heartbeat');
  } else if (alarm.name === 'autostop') {
    if (!d.wanted) return;
    await logEvent('auto_stop');
    await stopDesk();
    chrome.notifications.create('autostop', { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: 'Break time?', message: COPY.autoStop, silent: true });
  } else if (alarm.name === 'reminder') {
    await remind();
  } else if (alarm.name === 'resume') {
    if (d.status === 'paused') { await logEvent('resume'); await startDesk(); }
  }
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'active') return;
  const d = await readDesk();
  if (!d.wanted) return;
  await logEvent('idle_stop', { state });
  await stopDesk();
  chrome.notifications.create('idle', { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: 'TrichFree', message: COPY.idleStop, silent: true });
});

// ---------- notifications & commands ----------

chrome.notifications.onButtonClicked.addListener((id, idx) => {
  if (id === 'reminder') { chrome.notifications.clear(id); void startDesk(); return; }
  if (!id.startsWith(ALERT_NOTIF_PREFIX)) return;
  void feedback(idx === 0 ? 'not_a_pull' : 'i_pulled');
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id === 'reminder') { chrome.notifications.clear(id); await chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html#/home') }); return; }
  if (id === WATCHDOG_NOTIF) {
    chrome.notifications.clear(id);
    await stopDesk();
    await startDesk();
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'not-a-pull') await feedback('not_a_pull');
  else if (command === 'i-just-pulled') await feedback('i_pulled');
  else if (command === 'toggle-desk') {
    const d = await readDesk();
    if (d.wanted) await stopDesk(); else await startDesk();
  }
});

// ---------- install / startup ----------

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.storage.local.set({ deskState: INITIAL_DESK });
  await renderBadge(INITIAL_DESK);
  await scheduleReminder();
  if (details.reason === 'install') await chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') });
});

// Chrome restarted while desk mode was on: never restart the camera silently; the popup offers a restart.
chrome.runtime.onStartup.addListener(async () => {
  const d = await readDesk();
  await patchDesk({ wanted: false, status: 'off', fps: 0, interrupted: d.wanted || d.status === 'paused' });
  await chrome.alarms.clearAll();
  await scheduleReminder();
});
