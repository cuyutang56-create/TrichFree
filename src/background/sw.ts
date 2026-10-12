// Service worker: owns the desk on/off intent, the offscreen document's lifecycle, commands, notifications,
// alarms (heartbeat, auto-stop, pause, sync), idle/presence handling, the toolbar badge, the account session
// and the website bridge. Keeps no real-time state in globals: everything durable is in chrome.storage / IndexedDB.
import { db, getSettings, uid } from '../shared/db';
import { COPY } from '../shared/copy';
import { mochiSays } from '../shared/mochi';
import { loadProgress } from '../shared/progress';
import { idleMeansAway, isAway } from '../core/health';
import { INITIAL_DESK, on, readAccount, readDesk, send, type DeskState, type FeedbackKind, type StopReason } from '../shared/messages';
import { microPromptText } from '../sync/prefs';
import { APP_VERSION } from '../shared/config';
import { bridgeAllowed } from '../shared/bridge';
import { SYNC_ALARM, SYNC_EVERY_MIN, deleteMyAccount, dismissNotice, exportMine, hasSession, initAccount, sendCode, signOut, syncNow, verifyCode } from './account';

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const APP_URL = 'src/app/index.html';
const ALERT_NOTIF_PREFIX = 'alert:';
const WATCHDOG_NOTIF = 'watchdog';
const HEARTBEAT_STALE_MS = 15_000;
const AUTO_STOP_MIN = 180;
const ICON = () => chrome.runtime.getURL('icons/128.png');

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
  let color = '#5b6b5f';
  if (s.status === 'paused' || s.status === 'camera_busy') { text = 'II'; color = '#7a6f8f'; }
  else if (s.status === 'problem' || s.status === 'error') { text = '!'; color = '#b4532a'; }
  else if (s.wanted && (s.status === 'watching' || s.status === 'slow' || s.status === 'starting')) { text = '•'; color = '#4f7a5c'; }
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
      justification: 'On-device hand-to-hair detection from the webcam and playback of the user’s chosen reminder.',
    })
    .finally(() => { creating = null; });
  await creating;
}

async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

async function startDesk() {
  await patchDesk({
    wanted: true, status: 'starting', startedAt: Date.now(), pausedUntil: undefined, interrupted: false,
    error: undefined, errorKind: undefined, stopReason: undefined, lastHeartbeat: Date.now(), lastFaceAt: undefined,
  });
  await chrome.alarms.clear('resume');
  await chrome.alarms.create('autostop', { delayInMinutes: AUTO_STOP_MIN });
  await chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  chrome.idle.setDetectionInterval(600);
  if (await hasOffscreen()) await send({ target: 'offscreen', type: 'OFF_START' });
  else await ensureOffscreen(); // the document announces OFFSCREEN_READY, and we answer with OFF_START
}

async function stopDesk(status: DeskState['status'] = 'off', reason?: StopReason) {
  await patchDesk({ wanted: false, status, fps: 0, phase: undefined, ...(reason && reason !== 'user' ? { stopReason: reason } : {}) });
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
  const s = await getSettings();
  const message = s.companionEnabled
    ? mochiSays(kind === 'i_pulled' ? 'afterPull' : 'afterNotPull', s.companionTone)
    : kind === 'i_pulled' ? COPY.loggedNeutral : COPY.notAPullThanks;
  chrome.notifications.create(`ack:${Date.now()}`, { type: 'basic', iconUrl: ICON(), title: 'TrichFree', silent: true, priority: -1, message },
    (id) => setTimeout(() => chrome.notifications.clear(id), 3000));
}

async function logEvent(type: 'manual_pull' | 'false_alarm' | 'pause' | 'watchdog' | 'auto_stop' | 'idle_stop' | 'away_stop' | 'resume', data?: Record<string, number | string | boolean>) {
  await db.events.add({ id: uid(), type, t: Date.now(), data });
}

async function clearAlertNotifications() {
  const all = await chrome.notifications.getAll();
  for (const id of Object.keys(all)) if (id.startsWith(ALERT_NOTIF_PREFIX)) chrome.notifications.clear(id);
}

/** The reminder notification: a gentle question, the chosen suggestion and the user's own words. */
async function reminderNotification(id: string, n: number, test = false) {
  const s = await getSettings();
  const lines = [microPromptText(s.microPrompt, n), s.supportiveText].filter(Boolean);
  chrome.notifications.create(id, {
    type: 'basic', iconUrl: ICON(), title: test ? 'Test reminder: hands down?' : COPY.alertTitle,
    message: lines.join(' ') || COPY.alertFallback,
    contextMessage: test ? 'This is how a visual reminder looks.' : 'Tap a button if this was wrong. It helps TrichFree learn.',
    silent: true, priority: 1, buttons: test ? [] : [{ title: 'Not a pull' }, { title: 'I just pulled' }],
  });
}

// ---------- messages ----------

const prefsChanged = async () => {
  await scheduleReminder();
  await send({ target: 'offscreen', type: 'OFF_SETTINGS_CHANGED' });
};

let syncSoon: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(delayMs = 1500) {
  clearTimeout(syncSoon);
  syncSoon = setTimeout(async () => { if (await hasSession()) await syncNow(prefsChanged); }, delayMs);
}

on('sw', async (msg) => {
  switch (msg.type) {
    case 'DESK_START': await startDesk(); return { ok: true };
    case 'DESK_STOP': await stopDesk('off', 'user'); return { ok: true };
    case 'DESK_PAUSE': await pauseDesk(msg.minutes); return { ok: true };
    case 'FEEDBACK': await feedback(msg.kind); return { ok: true };
    case 'SETTINGS_CHANGED':
      await prefsChanged();
      scheduleSync();
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
      await patchDesk({ status: msg.status, fps: msg.fps, delegate: msg.delegate, phase: msg.phase, today: msg.today, error: msg.error, errorKind: msg.errorKind, lastHeartbeat: Date.now(), ...(msg.lastFaceAt ? { lastFaceAt: msg.lastFaceAt } : {}) });
      if (msg.status === 'problem' && prev !== 'problem') await watchdogNotify(msg.errorKind ?? 'stalled');
      if (msg.status === 'watching' || msg.status === 'slow') chrome.notifications.clear(WATCHDOG_NOTIF);
      return { ok: true };
    }
    case 'ALERT':
      await reminderNotification(`${ALERT_NOTIF_PREFIX}${msg.episodeId}`, msg.n);
      return { ok: true };
    case 'EPISODE_END':
      chrome.notifications.clear(`${ALERT_NOTIF_PREFIX}${msg.episodeId}`);
      return { ok: true };
    case 'CAMERA_LOST':
      await stopDesk('off', 'camera_lost');
      chrome.notifications.create(WATCHDOG_NOTIF, { type: 'basic', iconUrl: ICON(), title: 'TrichFree paused', message: COPY.cameraLost, silent: true });
      return { ok: true };
    case 'STOPPED':
      return { ok: true };
    case 'TEST_VISUAL':
      await reminderNotification(`test:${Date.now()}`, Math.floor(Math.random() * 4), true);
      return { ok: true };
    case 'DISMISS_STOP_REASON':
      await patchDesk({ stopReason: undefined, interrupted: false });
      return { ok: true };
    case 'ACCOUNT_SEND_CODE': return sendCode(msg.email);
    case 'ACCOUNT_VERIFY': return verifyCode(msg.email, msg.code, prefsChanged);
    case 'ACCOUNT_SIGN_OUT': return signOut();
    case 'ACCOUNT_DELETE': return deleteMyAccount();
    case 'ACCOUNT_EXPORT': return exportMine();
    case 'SYNC_NOW': return syncNow(prefsChanged);
    case 'NOTICE_DISMISS': await dismissNotice(); return { ok: true };
  }
});

// ---------- optional daily check-in reminder (off by default) ----------

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
  if (!s.onboarded || d.wanted || !s.reminderTime) return;
  const p = await loadProgress(s);
  if (p.streak.todayDone) return; // already had a session today: no nudge
  const seed = new Date().getDate();
  const message = s.companionEnabled
    ? (p.streak.current ? mochiSays('reminder', s.companionTone, { streak: p.streak.current }, seed) : mochiSays('reminderFresh', s.companionTone, {}, seed))
    : COPY.dailyNudge;
  chrome.notifications.create('reminder', {
    type: 'basic', iconUrl: ICON(), title: 'TrichFree', silent: true, priority: 0, message,
    buttons: [{ title: 'Start a session' }],
  });
}

// ---------- watchdog / alarms ----------

async function watchdogNotify(why: string) {
  await patchDesk({ status: 'problem' });
  await logEvent('watchdog', { why });
  chrome.notifications.create(WATCHDOG_NOTIF, {
    type: 'basic', iconUrl: ICON(), title: COPY.pausedTitle, silent: true, requireInteraction: true,
    message: why === 'models' ? 'The detector could not start. Click to try again.' : 'The camera stopped sending pictures. Click to restart.',
  });
}

async function awayStop(kind: 'away' | 'locked' | 'idle') {
  await logEvent(kind === 'away' ? 'away_stop' : 'idle_stop', { state: kind });
  await stopDesk('off', kind);
  chrome.notifications.create('idle', { type: 'basic', iconUrl: ICON(), title: 'TrichFree', message: kind === 'locked' ? COPY.lockedStop : COPY.awayStop, silent: true });
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
    if (d.lastHeartbeat && Date.now() - d.lastHeartbeat > HEARTBEAT_STALE_MS && d.status !== 'problem') { await watchdogNotify('heartbeat'); return; }
    // Nobody in view for a long time: switch the camera off.
    if (d.status !== 'starting' && isAway(Date.now(), d.lastFaceAt, d.startedAt)) await awayStop('away');
  } else if (alarm.name === 'autostop') {
    if (!d.wanted) return;
    await logEvent('auto_stop');
    await stopDesk('off', 'auto_stop');
    chrome.notifications.create('autostop', { type: 'basic', iconUrl: ICON(), title: 'Break time?', message: COPY.autoStop, silent: true });
  } else if (alarm.name === 'reminder') {
    await remind();
  } else if (alarm.name === 'resume') {
    if (d.status === 'paused') { await logEvent('resume'); await startDesk(); }
  } else if (alarm.name === SYNC_ALARM) {
    if (await hasSession()) await syncNow(prefsChanged);
  }
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'active') return;
  const d = await readDesk();
  if (!d.wanted) return;
  // "idle" only means no keyboard/mouse input (e.g. watching a lecture). Stop only if nobody is in view either.
  if (state === 'locked') await awayStop('locked');
  else if (idleMeansAway(Date.now(), d.lastFaceAt)) await awayStop('idle');
});

// ---------- notifications & commands ----------

chrome.notifications.onButtonClicked.addListener((id, idx) => {
  if (id === 'reminder') { chrome.notifications.clear(id); void startDesk(); return; }
  if (!id.startsWith(ALERT_NOTIF_PREFIX)) return;
  void feedback(idx === 0 ? 'not_a_pull' : 'i_pulled');
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id === 'reminder') { chrome.notifications.clear(id); await openApp('#/home'); return; }
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
    if (d.wanted) await stopDesk('off', 'user'); else await startDesk();
  }
});

async function openApp(hash = '') {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${APP_URL}${hash}`) });
}

// ---------- website bridge ----------
// The TrichFree website (and only it: see externally_connectable in the manifest) may ask whether the extension
// is installed, nudge a sync after the user saved settings on the web, open the extension, or stop monitoring.
// It can never start the camera: that always needs a click inside the extension.

chrome.runtime.onMessageExternal.addListener((msg: unknown, sender, reply) => {
  const allowed = bridgeAllowed(sender.origin ?? (sender.url ? new URL(sender.url).origin : undefined));
  if (!allowed || !msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  (async () => {
    const desk = await readDesk();
    const acct = await readAccount();
    switch (type) {
      case 'PING': return { ok: true, version: APP_VERSION, monitoring: desk.wanted, status: desk.status, signedIn: acct.signedIn };
      case 'SYNC_NOW': if (acct.signedIn) await syncNow(prefsChanged); return { ok: true };
      case 'OPEN': await openApp('#/home'); return { ok: true };
      case 'STOP': if (desk.wanted) await stopDesk('off', 'user'); return { ok: true };
      default: return { ok: false, message: 'unknown request' };
    }
  })().then(reply, () => reply({ ok: false }));
  return true;
});

// ---------- install / startup ----------

void initAccount();

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.storage.local.set({ deskState: INITIAL_DESK });
  await renderBadge(INITIAL_DESK);
  await scheduleReminder();
  await initAccount();
  if (await hasSession()) await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_EVERY_MIN });
  if (details.reason === 'install') await openApp();
});

// Chrome restarted while desk mode was on: never restart the camera silently; the dashboard offers a restart.
chrome.runtime.onStartup.addListener(async () => {
  const d = await readDesk();
  await patchDesk({ wanted: false, status: 'off', fps: 0, interrupted: d.wanted || d.status === 'paused', stopReason: d.wanted ? 'restart' : d.stopReason });
  await chrome.alarms.clearAll();
  await scheduleReminder();
  if (await hasSession()) {
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_EVERY_MIN });
    await syncNow(prefsChanged);
  }
});

