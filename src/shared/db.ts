import Dexie, { type Table } from 'dexie';
import type { PersonalModel } from '../core/classifier';
import type { Calibration, ClipCategory, Episode, FrameInput, Arm, OutputMode, Sensitivity, ZoneId } from '../core/types';

export interface SettingRow { key: string; value: unknown }
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
  | 'watchdog' | 'alert_latency' | 'auto_stop' | 'idle_stop' | 'validation' | 'checkin';
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

export interface AppSettings {
  onboarded: boolean;
  onboardingStep: 'welcome' | 'consent' | 'safety' | 'record' | 'calibrate' | 'done';
  consentAt?: number;
  guardianHelping?: boolean;
  participantCode?: string;
  pilotConsent: boolean;
  pilotSharing: boolean;
  enrolledDate?: string;
  pilotEpisodeIndex: number;
  outputMode: OutputMode;
  sensitivity: Sensitivity;
  zones: ZoneId[];
  activeCalibrationId?: string;
  notifications: boolean;
  debug: boolean;
  faceMissingPolicy: 'hold';
  personalModel?: PersonalModel | null;
  mochiTone: 'sassy' | 'gentle';
  dailyGoalMinutes: number;
  reminderTime: string | null; // 'HH:MM' local, or null for off
  squeezes: Record<string, number>; // per local date
  lastLevelSeen: number;
  lastRecapId?: string;
  /** featureSamples count when the model was last trained */
  modelTrainedOnCount?: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboarded: false,
  onboardingStep: 'welcome',
  pilotConsent: false,
  pilotSharing: false,
  pilotEpisodeIndex: 0,
  outputMode: 'speakers',
  sensitivity: 'balanced',
  zones: ['crown', 'hairline', 'strands'],
  notifications: true,
  debug: false,
  faceMissingPolicy: 'hold',
  mochiTone: 'sassy',
  dailyGoalMinutes: 30,
  reminderTime: '19:00',
  squeezes: {},
  lastLevelSeen: 1,
};

export class TrichFreeDB extends Dexie {
  settings!: Table<SettingRow, string>;
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
  }
}

export const db = new TrichFreeDB();

export async function getSettings(d: TrichFreeDB = db): Promise<AppSettings> {
  const rows = await d.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

export async function setSettings(patch: Partial<AppSettings>, d: TrichFreeDB = db): Promise<void> {
  await d.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}

export async function activeCalibration(s: AppSettings, d: TrichFreeDB = db): Promise<Calibration | null> {
  if (!s.activeCalibrationId) return null;
  return (await d.calibration.get(s.activeCalibrationId)) ?? null;
}

export const uid = () => crypto.randomUUID();

export type { Arm };
