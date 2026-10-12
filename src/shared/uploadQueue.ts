import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, getSettings, type TrichFreeDB, type UploadRow, type UploadTable } from './db';
import { assertNoMedia } from './telemetry';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export const telemetryConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  if (!telemetryConfigured) return null;
  // Anonymous, separate from any signed-in account: pilot rows are keyed by participant code only.
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

/** True when rows should be queued: a participant has consented, sharing is on, and a backend is configured. */
export async function sharingEnabled(d: TrichFreeDB = db): Promise<{ on: boolean; code?: string }> {
  const s = await getSettings(d);
  return { on: telemetryConfigured && !!s.participantCode && s.pilotConsent && s.pilotSharing, code: s.participantCode };
}

export async function enqueue(table: UploadTable, row: Record<string, unknown>, d: TrichFreeDB = db): Promise<void> {
  assertNoMedia(row);
  await d.uploadQueue.add({ table, row, createdAt: Date.now(), attempts: 0, nextAttemptAt: 0 });
}

/**
 * Inserts rows into one pilot table. Plain INSERT only: the anon key has no SELECT rights (so nothing can be
 * read back), which rules out INSERT ... ON CONFLICT. A duplicate key means an earlier attempt already got
 * through (e.g. the response was lost), so it counts as sent.
 */
export async function uploadBatch(sb: SupabaseClient, table: UploadTable, rows: Record<string, unknown>[]): Promise<{ sent: number[]; failed: number[] }> {
  rows.forEach((r) => assertNoMedia(r));
  const all = rows.map((_, i) => i);
  const { error } = await sb.from(table).insert(rows);
  if (!error) return { sent: all, failed: [] };
  if (error.code !== '23505') return { sent: [], failed: all };
  const sent: number[] = [], failed: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = await sb.from(table).insert(rows[i]);
    (!r.error || r.error.code === '23505' ? sent : failed).push(i);
  }
  return { sent, failed };
}

let flushing = false;
/** Flush queued rows with exponential backoff per row. */
export async function flush(d: TrichFreeDB = db): Promise<{ sent: number; failed: number }> {
  const sb = supabase();
  if (!sb || flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    const now = Date.now();
    const due = (await d.uploadQueue.toArray()).filter((r) => r.nextAttemptAt <= now).slice(0, 500);
    const byTable = new Map<UploadTable, UploadRow[]>();
    for (const r of due) byTable.set(r.table, [...(byTable.get(r.table) ?? []), r]);
    for (const [table, rows] of byTable) {
      rows.forEach((r) => assertNoMedia(r.row));
      const res = await uploadBatch(sb, table, rows.map((r) => r.row));
      await d.uploadQueue.bulkDelete(res.sent.map((i) => rows[i].seq!));
      sent += res.sent.length;
      failed += res.failed.length;
      if (res.failed.length) {
        await d.uploadQueue.bulkPut(res.failed.map((i) => rows[i]).map((r) => ({ ...r, attempts: r.attempts + 1, nextAttemptAt: now + Math.min(3_600_000, 30_000 * 2 ** r.attempts) })));
      }
    }
  } catch {
    // offline: leave rows for the next flush
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
