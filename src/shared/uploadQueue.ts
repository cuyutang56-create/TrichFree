import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, getSettings, type TrichFreeDB, type UploadTable } from './db';
import { assertNoMedia } from './telemetry';

const URL_ = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
export const telemetryConfigured = !!(URL_ && KEY);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  if (!telemetryConfigured) return null;
  client ??= createClient(URL_!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
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

let flushing = false;
/** Flush queued rows (idempotent upserts by id) with exponential backoff per row. */
export async function flush(d: TrichFreeDB = db): Promise<{ sent: number; failed: number }> {
  const sb = supabase();
  if (!sb || flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    const now = Date.now();
    const due = (await d.uploadQueue.toArray()).filter((r) => r.nextAttemptAt <= now).slice(0, 500);
    const byTable = new Map<UploadTable, typeof due>();
    for (const r of due) byTable.set(r.table, [...(byTable.get(r.table) ?? []), r]);
    for (const [table, rows] of byTable) {
      rows.forEach((r) => assertNoMedia(r.row));
      const { error } = await sb.from(table).upsert(rows.map((r) => r.row), { onConflict: 'id', ignoreDuplicates: true });
      if (!error) {
        await d.uploadQueue.bulkDelete(rows.map((r) => r.seq!));
        sent += rows.length;
      } else {
        failed += rows.length;
        await d.uploadQueue.bulkPut(rows.map((r) => ({ ...r, attempts: r.attempts + 1, nextAttemptAt: now + Math.min(3_600_000, 30_000 * 2 ** r.attempts) })));
      }
    }
  } catch {
    // offline: leave rows for the next flush
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
