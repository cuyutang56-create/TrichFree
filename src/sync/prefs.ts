// Cross-device preferences: the single source of truth for which settings sync, their defaults and their
// validation. Mirrors the CHECK constraints of public.user_preferences (supabase/migrations/*_accounts.sql);
// test/integration/schema.int.test.ts proves both sides accept and reject the same values.
// Pure TypeScript: used by the extension service worker, the extension pages and the website.
import { ALL_ZONES, type Sensitivity, type ZoneId } from '../core/types';

export const PREFS_SCHEMA_VERSION = 1;

export type Intervention = 'voice' | 'chime' | 'visual' | 'off';
export type MicroPrompt = 'none' | 'lower_hand' | 'hold_something' | 'posture' | 'break' | 'rotate';
export type CompanionTone = 'gentle' | 'playful';

export interface SyncedPrefs {
  /** What happens when a possible hand-to-hair movement is noticed. */
  intervention: Intervention;
  sensitivity: Sensitivity;
  zones: ZoneId[];
  /** Quiet period after an episode ends before a new reminder can start. */
  cooldownSeconds: number;
  /** One more cue if the hand is still up 10 s after the first (never more than two per episode). */
  followUp: boolean;
  /** 0–100, applied to the chime and voice clips. */
  chimeVolume: number;
  /** Also show a quiet on-screen notification with feedback buttons (always shown in visual mode). */
  visualNotifications: boolean;
  microPrompt: MicroPrompt;
  /** Optional words of the user's own, shown with the visual cue. */
  supportiveText: string | null;
  companionEnabled: boolean;
  companionTone: CompanionTone;
  dailyGoalMinutes: number;
  /** 'HH:MM' local time for an opt-in daily nudge, or null (off). */
  reminderTime: string | null;
  reduceMotion: boolean;
}

export type PrefKey = keyof SyncedPrefs;

export const DEFAULT_PREFS: SyncedPrefs = {
  intervention: 'chime',
  sensitivity: 'balanced',
  zones: ['crown', 'hairline', 'strands'],
  cooldownSeconds: 30,
  followUp: true,
  chimeVolume: 70,
  visualNotifications: true,
  microPrompt: 'lower_hand',
  supportiveText: null,
  companionEnabled: false,
  companionTone: 'gentle',
  dailyGoalMinutes: 30,
  reminderTime: null,
  reduceMotion: false,
};

export const PREF_KEYS = Object.keys(DEFAULT_PREFS) as PrefKey[];

export const INTERVENTIONS: Intervention[] = ['voice', 'chime', 'visual', 'off'];
export const SENSITIVITIES: Sensitivity[] = ['relaxed', 'balanced', 'sensitive'];
export const MICRO_PROMPTS: MicroPrompt[] = ['none', 'lower_hand', 'hold_something', 'posture', 'break', 'rotate'];
export const COOLDOWN_OPTIONS = [5, 15, 30, 60, 120, 300];
export const SUPPORTIVE_TEXT_MAX = 140;

/** Column names in public.user_preferences. */
export const COLUMN: Record<PrefKey, string> = {
  intervention: 'intervention',
  sensitivity: 'sensitivity',
  zones: 'zones',
  cooldownSeconds: 'cooldown_seconds',
  followUp: 'follow_up',
  chimeVolume: 'chime_volume',
  visualNotifications: 'visual_notifications',
  microPrompt: 'micro_prompt',
  supportiveText: 'supportive_text',
  companionEnabled: 'companion_enabled',
  companionTone: 'companion_tone',
  dailyGoalMinutes: 'daily_goal_minutes',
  reminderTime: 'reminder_time',
  reduceMotion: 'reduce_motion',
};

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): v is T => typeof v === 'string' && (xs as readonly string[]).includes(v);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const VALIDATORS: { [K in PrefKey]: (v: unknown) => v is SyncedPrefs[K] } = {
  intervention: (v): v is Intervention => oneOf(v, INTERVENTIONS),
  sensitivity: (v): v is Sensitivity => oneOf(v, SENSITIVITIES),
  zones: (v): v is ZoneId[] => Array.isArray(v) && v.length >= 1 && v.length <= ALL_ZONES.length
    && v.every((z) => oneOf(z, ALL_ZONES)) && new Set(v).size === v.length,
  cooldownSeconds: (v): v is number => isInt(v, 5, 600),
  followUp: (v): v is boolean => typeof v === 'boolean',
  chimeVolume: (v): v is number => isInt(v, 0, 100),
  visualNotifications: (v): v is boolean => typeof v === 'boolean',
  microPrompt: (v): v is MicroPrompt => oneOf(v, MICRO_PROMPTS),
  // Counted in code points, like Postgres char_length().
  supportiveText: (v): v is string | null => v === null || (typeof v === 'string' && [...v].length <= SUPPORTIVE_TEXT_MAX && !CONTROL.test(v)),
  companionEnabled: (v): v is boolean => typeof v === 'boolean',
  companionTone: (v): v is CompanionTone => oneOf(v, ['gentle', 'playful'] as const),
  dailyGoalMinutes: (v): v is number => isInt(v, 5, 480),
  reminderTime: (v): v is string | null => v === null || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)),
  reduceMotion: (v): v is boolean => typeof v === 'boolean',
};

export function isValidPref<K extends PrefKey>(key: K, value: unknown): value is SyncedPrefs[K] {
  return VALIDATORS[key](value);
}

/** Normalises user input before validation (trims text, empty text → null). */
export function normalizePref<K extends PrefKey>(key: K, value: SyncedPrefs[K]): SyncedPrefs[K] {
  if (key === 'supportiveText' && typeof value === 'string') {
    const t = value.trim();
    return (t ? t : null) as SyncedPrefs[K];
  }
  return value;
}

/** Keeps every valid field and replaces invalid or missing ones with defaults. Reports what was replaced. */
export function sanitizePrefs(input: unknown): { prefs: SyncedPrefs; invalid: PrefKey[] } {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const prefs = { ...DEFAULT_PREFS } as Record<PrefKey, unknown>;
  const invalid: PrefKey[] = [];
  for (const k of PREF_KEYS) {
    if (!(k in src)) continue;
    if (isValidPref(k, src[k])) prefs[k] = k === 'zones' ? [...(src[k] as ZoneId[])] : src[k];
    else invalid.push(k);
  }
  return { prefs: prefs as unknown as SyncedPrefs, invalid };
}

export function prefEquals<K extends PrefKey>(key: K, a: SyncedPrefs[K], b: SyncedPrefs[K]): boolean {
  if (key === 'zones') {
    const x = a as ZoneId[], y = b as ZoneId[];
    // Zone order carries no meaning.
    return x.length === y.length && x.every((z) => y.includes(z));
  }
  return a === b;
}

export function pickPrefs(src: Partial<Record<PrefKey, unknown>>): Partial<SyncedPrefs> {
  const out: Partial<Record<PrefKey, unknown>> = {};
  for (const k of PREF_KEYS) if (k in src) out[k] = src[k];
  return out as Partial<SyncedPrefs>;
}

/** camelCase prefs → table columns. Only the given keys. */
export function toRow(p: Partial<SyncedPrefs>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const k of PREF_KEYS) if (k in p) row[COLUMN[k]] = p[k];
  return row;
}

export interface RemotePrefs {
  prefs: SyncedPrefs;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  /** Columns the server sent that this client version did not understand (newer schema) or found invalid. */
  invalid: PrefKey[];
}

/** Table row → camelCase prefs. Unknown or invalid values fall back to defaults (and are reported). */
export function fromRow(row: Record<string, unknown>): RemotePrefs {
  const camel: Record<string, unknown> = {};
  for (const k of PREF_KEYS) if (COLUMN[k] in row) camel[k] = row[COLUMN[k]];
  const { prefs, invalid } = sanitizePrefs(camel);
  return {
    prefs,
    version: Number(row.version),
    updatedAt: String(row.updated_at ?? ''),
    updatedBy: (row.updated_by as string | null) ?? null,
    invalid,
  };
}

/** Labels for UI copy ("changed on another device: Reminder, Sensitivity"). */
export const PREF_LABELS: Record<PrefKey, string> = {
  intervention: 'Reminder type',
  sensitivity: 'Sensitivity',
  zones: 'Areas to watch',
  cooldownSeconds: 'Quiet time between reminders',
  followUp: 'Follow-up reminder',
  chimeVolume: 'Volume',
  visualNotifications: 'On-screen notification',
  microPrompt: 'Suggested action',
  supportiveText: 'Your supportive words',
  companionEnabled: 'Mochi companion',
  companionTone: 'Mochi’s tone',
  dailyGoalMinutes: 'Daily focus goal',
  reminderTime: 'Daily check-in reminder',
  reduceMotion: 'Reduce motion',
};

export const MICRO_PROMPT_TEXT: Record<Exclude<MicroPrompt, 'none' | 'rotate'>, string> = {
  lower_hand: 'Lower your hand gently.',
  hold_something: 'Hold something comfortable for a moment.',
  posture: 'Try a small change of posture.',
  break: 'Maybe take a short break.',
};

/** The suggestion shown with a reminder. `n` rotates through the list for 'rotate'. */
export function microPromptText(p: MicroPrompt, n = 0): string | null {
  if (p === 'none') return null;
  if (p === 'rotate') {
    const all = Object.values(MICRO_PROMPT_TEXT);
    return all[Math.abs(n) % all.length];
  }
  return MICRO_PROMPT_TEXT[p];
}
