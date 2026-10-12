import { db, getSettings } from './db';
import { EPISODE_COLUMNS, EVENT_COLUMNS, SESSION_COLUMNS, episodeRow, eventRow, sessionRow } from './telemetry';

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = Array.isArray(v) ? `{${v.join(',')}}` : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}

/** Pilot log as three CSVs in the Supabase column layout (fallback when there is no backend). */
export async function pilotCsvs(): Promise<Record<string, string>> {
  const s = await getSettings();
  const code = s.participantCode ?? '';
  const [eps, sess, evs] = await Promise.all([db.episodes.toArray(), db.sessions.toArray(), db.events.toArray()]);
  return {
    'episodes.csv': toCsv(EPISODE_COLUMNS, eps.map((e) => episodeRow(e, code))),
    'sessions.csv': toCsv(SESSION_COLUMNS, sess.map((x) => sessionRow(x, code))),
    'events.csv': toCsv(EVENT_COLUMNS, evs.map((e) => eventRow(e, code))),
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
