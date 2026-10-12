// Maps local records to the Supabase pilot schema (supabase/schema.sql). Output is plain JSON only:
// timestamps, labels and numbers. Never media. Checked by test/privacy.test.ts.
import type { Calibration, Episode } from '../core/types';
import type { EventRow, SessionRow } from './db';
import { APP_VERSION } from './config';

export { APP_VERSION };
const iso = (t?: number) => (t == null ? null : new Date(t).toISOString());

export function episodeRow(e: Episode, code: string) {
  return {
    id: e.id, participant_code: code, session_id: e.sessionId,
    started_at: iso(e.startedAt), alert_at: iso(e.alertAt), ended_at: iso(e.endedAt),
    zone: e.zone, arm: e.arm, pilot_day: e.pilotDay ?? null, clip_count: e.clipIds.length, outcome: e.outcome,
    seconds_to_hand_down: e.secondsToHandDown ?? null, pinch_fraction: e.pinchFraction, r_median: e.rMedian,
    p_smooth_max: e.pSmoothMax, pulled_during: e.pulledDuring ?? null, app_version: APP_VERSION,
  };
}

export function sessionRow(s: SessionRow, code: string) {
  return {
    id: s.id, participant_code: code, started_at: iso(s.startedAt), ended_at: iso(s.endedAt),
    desk_minutes: s.deskMinutes, fps_avg: s.fpsAvg, delegate: s.delegate ?? null, output_mode: s.outputMode, app_version: APP_VERSION,
  };
}

export function eventRow(ev: EventRow, code: string) {
  return { id: ev.id, participant_code: code, session_id: ev.sessionId ?? null, type: ev.type, t: iso(ev.t), app_version: APP_VERSION };
}

export function calibrationRow(c: Calibration, code: string, dwellMs: number) {
  return {
    id: c.id, participant_code: code, created_at: iso(c.createdAt), zones: c.zones,
    validation_pos: c.validationPos ?? null, validation_neg: c.validationNeg ?? null, dwell_ms: dwellMs, app_version: APP_VERSION,
  };
}

export const EPISODE_COLUMNS = Object.keys(episodeRow({ id: '', sessionId: '', startedAt: 0, endedAt: 0, zone: null, arm: null, clipIds: [], outcome: 'brief_touch', pinchFraction: 0, rMedian: 0, pSmoothMax: 0 }, ''));
export const SESSION_COLUMNS = Object.keys(sessionRow({ id: '', startedAt: 0, deskMinutes: 0, fpsAvg: 0, outputMode: 'speakers' }, ''));
export const EVENT_COLUMNS = Object.keys(eventRow({ id: '', type: 'pause', t: 0 }, ''));

/** Throws if a row contains anything that could be media. Used before every upload. */
export function assertNoMedia(row: unknown, path = 'row'): void {
  if (row == null) return;
  if (typeof Blob !== 'undefined' && row instanceof Blob) throw new Error(`${path} is a Blob`);
  if (row instanceof ArrayBuffer || ArrayBuffer.isView(row)) throw new Error(`${path} is binary`);
  if (typeof ImageData !== 'undefined' && row instanceof ImageData) throw new Error(`${path} is ImageData`);
  if (typeof row === 'string') {
    if (row.length > 1024 && /^[A-Za-z0-9+/=\s]+$/.test(row)) throw new Error(`${path} looks like base64 > 1 KB`);
    if (row.startsWith('data:')) throw new Error(`${path} is a data URL`);
    return;
  }
  if (Array.isArray(row)) { row.forEach((v, i) => assertNoMedia(v, `${path}[${i}]`)); return; }
  if (typeof row === 'object') for (const [k, v] of Object.entries(row)) assertNoMedia(v, `${path}.${k}`);
}
