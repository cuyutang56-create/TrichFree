import Dexie, { type Table } from 'dexie';
import type { PersonalModel } from '../core/classifier';
import type { Calibration, ClipCategory, Episode, FrameInput, Arm, OutputMode, ZoneId } from '../core/types';
import { DEFAULT_PREFS, PREF_KEYS, isValidPref, prefEquals, type Intervention, type PrefKey, type SyncedPrefs } from '../sync/prefs';
import type { DirtyMap, SyncBase } from '../sync/engine';

export interface SettingRow { key: string; value: unknown }
export interface MetaRow { key: string; value: unknown }
export interface ClipRow {
  id: string;
  category: ClipCategory;
  blob: Blob; // 16-bit mono WAV, 22.05 kHz
  mimeType: string;
  sourceMimeType?: string;
  durationMs: number;
  createdAt: number;
  lastPlayedAt?: number;
  playCount: number;
  recordedBySomeoneElse?: boolean;
}
export interface SessionRow {
  id: string;
  participantCode?: string;
  startedAt: number;
  endedAt?: number;
  deskMinutes: number;
  fpsAvg: number;
  delegate?: string;
  outputMode: OutputMode;
}
export type EventType =
  | 'manual_pull' | 'false_alarm' | 'pause' | 'resume' | 'fps_warning' | 'camera_busy' | 'camera_restored'
  | 'watchdog' | 'alert_latency' | 'auto_stop' | 'idle_stop' | 'away_stop' | 'validation' | 'checkin';
export interface EventRow {
  seq?: number;
  id: string;
  type: EventType;
  t: number;
  sessionId?: string;
  episodeId?: string;
  data?: Record<string, number | string | boolean | null>;
}
export interface FeatureSampleRow {
  seq?: number;
  t: number;
  label: 0 | 1;
  source: 'calibration' | 'not_a_pull' | 'i_pulled' | 'hand_down_after_alert';
  weak?: boolean;
  x: number[]; // feature vector (Section 4.8), never pixels
}
export interface LandmarkRecordRow { id: string; createdAt: number; name: string; meta: { width: number; height: number; fps?: number; zones?: ZoneId[] }; frames: FrameInput[] }
export type UploadTable = 'episodes' | 'sessions' | 'events' | 'calibrations';
export interface UploadRow { seq?: number; table: UploadTable; createdAt: number; row: Record<string, unknown>; attempts: number; nextAttemptAt: number }

/**
 * Settings on this device. The SyncedPrefs part follows the user across devices when they have an account
 * (src/sync); everything else is specific to this browser (camera calibration, personal model, pilot identity).
 */
export interface AppSettings extends SyncedPrefs {
  onboarded: boolean;
  onboardingStep: 'welcome' | 'start' | 'done';
  /** When the user acknowledged the welcome statement (18+ or with a guardian; self-help, not treatment). */
  consentAt?: number;
  participantCode?: string;
  pilotConsent: boolean;
  pilotSharing: boolean;
  enrolledDate?: string;
  pilotEpisodeIndex: number;
  activeCalibrationId?: string;
  debug: boolean;
  faceMissingPolicy: 'hold';
  personalModel?: PersonalModel | null;
  squeezes: Record<string, number>; // per local date
  lastLevelSeen: number;
  lastRecapId?: string;
  /** featureSamples count when the model was last trained */
  modelTrainedOnCount?: number;
  /** The "Meet Mochi" card was answered (yes or no). */
  companionOffered: boolean;
}

export const LOCAL_DEFAULTS: Omit<AppSettings, keyof SyncedPrefs> = {
  onboarded: false,
  onboardingStep: 'welcome',
  pilotConsent: false,
  pilotSharing: false,
  pilotEpisodeIndex: 0,
  debug: false,
  faceMissingPolicy: 'hold',
  squeezes: {},
  lastLevelSeen: 1,
  companionOffered: false,
};

export const DEFAULT_SETTINGS: AppSettings = { ...DEFAULT_PREFS, ...LOCAL_DEFAULTS };

/** The engine's output mode (also logged for the pilot) for an intervention choice. */
export function outputModeOf(i: Intervention): OutputMode {
  return i === 'voice' ? 'speakers' : i === 'chime' ? 'chime_only' : i === 'visual' ? 'visual' : 'silent_log';
}

export class TrichFreeDB extends Dexie {
  settings!: Table<SettingRow, string>;
  meta!: Table<MetaRow, string>;
  clips!: Table<ClipRow, string>;
  calibration!: Table<Calibration, string>;
  sessions!: Table<SessionRow, string>;
  episodes!: Table<Episode, string>;
  events!: Table<EventRow, number>;
  featureSamples!: Table<FeatureSampleRow, number>;
  landmarkRecords!: Table<LandmarkRecordRow, string>;
  uploadQueue!: Table<UploadRow, number>;

  constructor(name = 'trichfree') {
    super(name);
    this.version(1).stores({
      settings: 'key',
      clips: 'id, category, createdAt',
      calibration: 'id, createdAt',
      sessions: 'id, startedAt',
      episodes: 'id, sessionId, startedAt, arm, outcome',
      events: '++seq, type, t, sessionId',
      featureSamples: '++seq, label, source, t',
      landmarkRecords: 'id, createdAt',
      uploadQueue: '++seq, table, createdAt',
    });
    // v2: sync metadata + device id, and settings renamed for the intervention model (see migrateSettingsV1).
    this.version(2).stores({ meta: 'key' }).upgrade(async (tx) => {
      const rows = await tx.table('settings').toArray() as SettingRow[];
      const patch = migrateSettingsV1(Object.fromEntries(rows.map((r) => [r.key, r.value])));
      await tx.table('settings').bulkDelete(patch.remove);
      await tx.table('settings').bulkPut(Object.entries(patch.put).map(([key, value]) => ({ key, value })));
    });
  }
}

/** Version 1 settings → the account-ready model. Pure, exported for tests. */
export function migrateSettingsV1(old: Record<string, unknown>): { put: Record<string, unknown>; remove: string[] } {
  const put: Record<string, unknown> = {};
  const remove: string[] = [];
  const rename = (from: string, to: PrefKey, map: (v: unknown) => unknown = (v) => v) => {
    if (!(from in old)) return;
    remove.push(from);
    const v = map(old[from]);
    if (!(to in old) && isValidPref(to, v)) put[to] = v;
  };
  rename('outputMode', 'intervention', (v) => (v === 'speakers' || v === 'earbuds' ? 'voice' : v === 'chime_only' ? 'chime' : v === 'silent_log' ? 'off' : v));
  rename('notifications', 'visualNotifications');
  rename('mochiTone', 'companionTone', (v) => (v === 'sassy' ? 'playful' : v));
  if ('guardianHelping' in old) remove.push('guardianHelping');
  // Old builds had a 5-step onboarding. People who finished it keep Mochi, which they already know.
  if (old.onboarded === true) {
    if (!('companionEnabled' in old)) put.companionEnabled = true;
    put.companionOffered = true;
    put.onboardingStep = 'done';
  } else if ('onboardingStep' in old) {
    put.onboardingStep = 'welcome';
  }
  return { put, remove };
}

export const db = new TrichFreeDB();

export async function getSettings(d: TrichFreeDB = db): Promise<AppSettings> {
  const rows = await d.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

/**
 * Saves settings. Changes to synced preferences are validated and remembered as "dirty" (with the time of the
 * change) so the next sync can send them. The sync engine itself writes with `fromSync` and marks nothing.
 */
export async function setSettings(patch: Partial<AppSettings>, d: TrichFreeDB = db, opts: { fromSync?: boolean } = {}): Promise<void> {
  const prefKeys = PREF_KEYS.filter((k) => k in patch);
  for (const k of prefKeys) {
    if (!isValidPref(k, patch[k])) throw new Error(`Invalid value for ${k}`);
  }
  await d.transaction('rw', d.settings, d.meta, async () => {
    if (prefKeys.length && !opts.fromSync) {
      const cur = await getSettings(d);
      const dirty = ((await d.meta.get('syncDirty'))?.value ?? {}) as DirtyMap;
      const now = Date.now();
      let changed = false;
      for (const k of prefKeys) {
        if (!prefEquals(k, cur[k] as never, patch[k] as never)) { dirty[k] = now; changed = true; }
      }
      if (changed) await d.meta.put({ key: 'syncDirty', value: dirty });
    }
    await d.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
  });
}

export function pickSynced(s: AppSettings): SyncedPrefs {
  const out: Partial<Record<PrefKey, unknown>> = {};
  for (const k of PREF_KEYS) out[k] = s[k];
  return out as SyncedPrefs;
}

// ---------- sync metadata ----------

export interface SyncMeta { base: SyncBase | null; dirty: DirtyMap; linkedUserId: string | null }

export async function getSyncMeta(d: TrichFreeDB = db): Promise<SyncMeta> {
  const [base, dirty, user] = await Promise.all([d.meta.get('syncBase'), d.meta.get('syncDirty'), d.meta.get('syncUser')]);
  return {
    base: (base?.value as SyncBase | undefined) ?? null,
    dirty: (dirty?.value as DirtyMap | undefined) ?? {},
    linkedUserId: (user?.value as string | undefined) ?? null,
  };
}

/** Forget the link to an account (sign-out, deletion). Local settings stay as they are. */
export async function clearSyncLink(d: TrichFreeDB = db): Promise<void> {
  await d.meta.bulkDelete(['syncBase', 'syncUser']);
}

/** A random id for this browser install, sent as `updated_by` so other devices can say where a change came from. */
export async function deviceId(d: TrichFreeDB = db): Promise<string> {
  const row = await d.meta.get('deviceId');
  if (row) return row.value as string;
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await d.meta.put({ key: 'deviceId', value: id });
  return id;
}

export async function activeCalibration(s: AppSettings, d: TrichFreeDB = db): Promise<Calibration | null> {
  if (!s.activeCalibrationId) return null;
  return (await d.calibration.get(s.activeCalibrationId)) ?? null;
}

export const uid = () => crypto.randomUUID();

export type { Arm };
