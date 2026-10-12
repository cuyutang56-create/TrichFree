import JSZip from 'jszip';
import { PREF_KEYS, isValidPref, type PrefKey } from '../sync/prefs';
import { clearSyncLink, db, migrateSettingsV1, type ClipRow, type SettingRow } from './db';

// The `meta` table (sync link, device id) is deliberately not part of a backup.
const TABLES = ['settings', 'calibration', 'sessions', 'episodes', 'events', 'featureSamples', 'landmarkRecords', 'uploadQueue'] as const;

/** Whole-profile backup: data.json (every table but audio) + clips/<id>.wav. Stays on the user's device. */
export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const clips = await db.clips.toArray();
  data.clips = clips.map(({ blob: _b, ...meta }) => meta);
  zip.file('data.json', JSON.stringify({ format: 'trichfree-backup', version: 2, exportedAt: new Date().toISOString(), data }));
  for (const c of clips) zip.file(`clips/${c.id}.wav`, c.blob);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function backupFilename(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `trichfree-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`;
}

/** Settings rows from any backup version, upgraded and with invalid preference values dropped. */
export function cleanSettingRows(rows: SettingRow[]): SettingRow[] {
  const obj: Record<string, unknown> = Object.fromEntries(rows.filter((r) => r && typeof r.key === 'string').map((r) => [r.key, r.value]));
  const { put, remove } = migrateSettingsV1(obj);
  for (const k of remove) delete obj[k];
  Object.assign(obj, put);
  for (const k of PREF_KEYS) if (k in obj && !isValidPref(k as PrefKey, obj[k])) delete obj[k];
  return Object.entries(obj).map(([key, value]) => ({ key, value }));
}

/**
 * Replaces all local data with the backup's contents. If this device is signed in, the account's settings
 * still take priority at the next sync (the backup is treated like a fresh device).
 */
export async function importBackup(file: Blob): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const json = await zip.file('data.json')?.async('string');
  if (!json) throw new Error('This file is not a TrichFree backup (no data.json).');
  const parsed = JSON.parse(json);
  if (parsed.format !== 'trichfree-backup') throw new Error('This file is not a TrichFree backup.');
  const data = parsed.data as Record<string, unknown[]>;
  const clipRows: ClipRow[] = [];
  for (const meta of (data.clips ?? []) as Omit<ClipRow, 'blob'>[]) {
    const buf = await zip.file(`clips/${meta.id}.wav`)?.async('arraybuffer');
    if (buf) clipRows.push({ ...meta, blob: new Blob([buf], { type: 'audio/wav' }) });
  }
  const settings = cleanSettingRows((data.settings ?? []) as SettingRow[]);
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'meta') await t.clear();
    for (const t of TABLES) {
      const rows = t === 'settings' ? settings : data[t];
      if (rows?.length) await db.table(t).bulkPut(rows);
    }
    if (clipRows.length) await db.clips.bulkPut(clipRows);
  });
  await clearSyncLink();
}

/** Removes everything TrichFree stored in this browser (IndexedDB + extension storage). */
export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear(); });
  if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.clear();
}
