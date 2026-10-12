import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cleanSettingRows } from '../src/shared/backup';
import { TrichFreeDB, getSettings, getSyncMeta, migrateSettingsV1, outputModeOf, setSettings } from '../src/shared/db';
import { dexieStore } from '../src/shared/syncStore';
import { resolveArm } from '../src/core/arms';
import { syncPreferences, type RemoteStore } from '../src/sync/engine';
import { DEFAULT_PREFS, type SyncedPrefs } from '../src/sync/prefs';

let n = 0;
const freshDb = () => new TrichFreeDB(`test-${++n}-${Date.now()}`);

describe('settings migration from the first release', () => {
  it('maps old keys onto the intervention model', () => {
    const { put, remove } = migrateSettingsV1({ outputMode: 'earbuds', notifications: false, mochiTone: 'sassy', onboarded: true, onboardingStep: 'done' });
    expect(put).toMatchObject({ intervention: 'voice', visualNotifications: false, companionTone: 'playful', companionEnabled: true, companionOffered: true, onboardingStep: 'done' });
    expect(remove.sort()).toEqual(['mochiTone', 'notifications', 'outputMode']);
    expect(migrateSettingsV1({ outputMode: 'silent_log' }).put.intervention).toBe('off');
    expect(migrateSettingsV1({ outputMode: 'chime_only' }).put.intervention).toBe('chime');
  });
  it('people mid-way through the old onboarding restart the new, shorter one', () => {
    expect(migrateSettingsV1({ onboarded: false, onboardingStep: 'record' }).put.onboardingStep).toBe('welcome');
  });
  it('upgrades a real v1 database in place (Dexie version 2 upgrade)', async () => {
    const name = `upgrade-${Date.now()}`;
    const { default: Dexie } = await import('dexie');
    const v1 = new Dexie(name);
    v1.version(1).stores({ settings: 'key', clips: 'id, category, createdAt', calibration: 'id, createdAt', sessions: 'id, startedAt', episodes: 'id, sessionId, startedAt, arm, outcome', events: '++seq, type, t, sessionId', featureSamples: '++seq, label, source, t', landmarkRecords: 'id, createdAt', uploadQueue: '++seq, table, createdAt' });
    await v1.table('settings').bulkPut([{ key: 'outputMode', value: 'chime_only' }, { key: 'onboarded', value: true }, { key: 'sensitivity', value: 'relaxed' }]);
    v1.close();
    const d = new TrichFreeDB(name);
    const s = await getSettings(d);
    expect(s).toMatchObject({ intervention: 'chime', sensitivity: 'relaxed', companionEnabled: true, onboarded: true });
    expect((s as unknown as Record<string, unknown>).outputMode).toBeUndefined();
  });
  it('backups from any version are cleaned before import (invalid values dropped)', () => {
    const rows = cleanSettingRows([{ key: 'outputMode', value: 'speakers' }, { key: 'sensitivity', value: 'max' }, { key: 'cooldownSeconds', value: 60 }]);
    const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(obj).toEqual({ intervention: 'voice', cooldownSeconds: 60 });
  });
});

describe('setSettings and sync bookkeeping', () => {
  it('remembers which synced fields changed, and only real changes', async () => {
    const d = freshDb();
    await setSettings({ sensitivity: 'sensitive', debug: true }, d);
    await setSettings({ intervention: DEFAULT_PREFS.intervention }, d); // unchanged value
    const meta = await getSyncMeta(d);
    expect(Object.keys(meta.dirty)).toEqual(['sensitivity']);
  });
  it('rejects invalid preference values', async () => {
    await expect(setSettings({ cooldownSeconds: 1 }, freshDb())).rejects.toThrow(/cooldownSeconds/);
  });
  it('writes from the sync engine are not marked dirty', async () => {
    const d = freshDb();
    await setSettings({ chimeVolume: 10 }, d, { fromSync: true });
    expect((await getSyncMeta(d)).dirty).toEqual({});
  });
});

describe('IndexedDB sync store', () => {
  class Server implements RemoteStore {
    row: { version: number; prefs: SyncedPrefs } | null = null;
    beforeUpdate?: () => Promise<void>;
    async get() { return this.row && { prefs: { ...this.row.prefs }, version: this.row.version, updatedAt: '', updatedBy: null, invalid: [] }; }
    async create(_u: string, prefs: SyncedPrefs) { this.row = { version: 1, prefs: { ...prefs } }; return (await this.get())!; }
    async update(_u: string, patch: Partial<SyncedPrefs>, base: number) {
      await this.beforeUpdate?.();
      if (!this.row || this.row.version !== base) return null;
      this.row = { version: base + 1, prefs: { ...this.row.prefs, ...patch } };
      return (await this.get())!;
    }
  }

  it('uploads, then keeps an edit made in another tab while the sync was in flight', async () => {
    const d = freshDb();
    const srv = new Server();
    await setSettings({ intervention: 'visual' }, d);
    expect(await syncPreferences(dexieStore(d), srv, 'u1', 'extension:t')).toMatchObject({ kind: 'ok', createdRemote: true });
    expect(srv.row!.prefs.intervention).toBe('visual');
    expect((await getSyncMeta(d)).dirty).toEqual({});

    await setSettings({ chimeVolume: 20 }, d);
    srv.beforeUpdate = async () => { await setSettings({ chimeVolume: 90 }, d); }; // the user moves the slider again mid-sync
    expect(await syncPreferences(dexieStore(d), srv, 'u1', 'extension:t')).toMatchObject({ kind: 'ok', pushed: ['chimeVolume'] });
    expect((await getSettings(d)).chimeVolume).toBe(90); // newer local value kept
    expect(Object.keys((await getSyncMeta(d)).dirty)).toEqual(['chimeVolume']); // and still queued
    srv.beforeUpdate = undefined;
    await syncPreferences(dexieStore(d), srv, 'u1', 'extension:t');
    expect(srv.row!.prefs.chimeVolume).toBe(90);
    expect((await getSyncMeta(d)).linkedUserId).toBe('u1');
  });

  it('applies settings from the server without marking them dirty', async () => {
    const d = freshDb();
    const srv = new Server();
    srv.row = { version: 5, prefs: { ...DEFAULT_PREFS, sensitivity: 'relaxed', zones: ['brows'] } };
    expect(await syncPreferences(dexieStore(d), srv, 'u2', 'extension:t')).toMatchObject({ kind: 'ok', adoptedAccount: true });
    expect(await getSettings(d)).toMatchObject({ sensitivity: 'relaxed', zones: ['brows'] });
    expect((await getSyncMeta(d))).toMatchObject({ dirty: {}, linkedUserId: 'u2', base: { version: 5 } });
  });
});

describe('intervention → pilot arm', () => {
  it('visual-only reminders use their own arm and never consume a randomisation slot', () => {
    expect(outputModeOf('visual')).toBe('visual');
    expect(resolveArm({ outputMode: 'visual', now: Date.now() })).toEqual({ arm: 'VISUAL', consumesIndex: false });
    const enrolled = new Date(Date.now() - 6 * 86_400_000);
    const ymd = `${enrolled.getFullYear()}-${String(enrolled.getMonth() + 1).padStart(2, '0')}-${String(enrolled.getDate()).padStart(2, '0')}`;
    expect(resolveArm({ outputMode: 'visual', now: Date.now(), pilot: { code: 'TF-AB12', enrolledDate: ymd, nextIndex: 0 } })).toMatchObject({ arm: 'VISUAL', consumesIndex: false });
    expect(outputModeOf('off')).toBe('silent_log');
    expect(outputModeOf('voice')).toBe('speakers');
  });
});
