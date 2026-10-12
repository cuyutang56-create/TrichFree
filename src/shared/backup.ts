import JSZip from 'jszip';
import { db, type ClipRow } from './db';

const TABLES = ['settings', 'calibration', 'sessions', 'episodes', 'events', 'featureSamples', 'landmarkRecords', 'uploadQueue'] as const;

/** Whole-profile backup: data.json (every table but audio) + clips/<id>.wav. Stays on the user's device. */
export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const clips = await db.clips.toArray();
  data.clips = clips.map(({ blob: _b, ...meta }) => meta);
  zip.file('data.json', JSON.stringify({ format: 'trichfree-backup', version: 1, exportedAt: new Date().toISOString(), data }));
  for (const c of clips) zip.file(`clips/${c.id}.wav`, c.blob);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function backupFilename(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `trichfree-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`;
}

/** Replaces all local data with the backup's contents. */
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
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
    for (const t of TABLES) if (data[t]?.length) await db.table(t).bulkPut(data[t]);
    if (clipRows.length) await db.clips.bulkPut(clipRows);
  });
}

export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear(); });
  if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.clear();
}
