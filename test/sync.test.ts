import { describe, expect, it } from 'vitest';
import { MemoryStore, RowExistsError, SyncError, applyCommit, syncPreferences, type LocalSnapshot, type RemoteStore } from '../src/sync/engine';
import { threeWayMerge } from '../src/sync/merge';
import {
  DEFAULT_PREFS, PREF_KEYS, fromRow, isValidPref, microPromptText, prefEquals, sanitizePrefs, toRow,
  type PrefKey, type RemotePrefs, type SyncedPrefs,
} from '../src/sync/prefs';

/** In-memory stand-in for public.user_preferences with the same version semantics as the database trigger. */
class FakeServer implements RemoteStore {
  rows = new Map<string, { version: number; prefs: SyncedPrefs; updatedBy: string | null }>();
  offline = false;
  /** Simulate another device writing between our read and our write, this many times. */
  interleave = 0;
  calls: string[] = [];
  private snap(id: string): RemotePrefs {
    const r = this.rows.get(id)!;
    return { prefs: structuredClone(r.prefs), version: r.version, updatedAt: '', updatedBy: r.updatedBy, invalid: [] };
  }
  async get(id: string) {
    this.calls.push('get');
    if (this.offline) throw new SyncError('You appear to be offline.', 'offline');
    return this.rows.has(id) ? this.snap(id) : null;
  }
  async create(id: string, prefs: SyncedPrefs, tag: string) {
    this.calls.push('create');
    if (this.offline) throw new SyncError('offline', 'offline');
    if (this.rows.has(id)) throw new RowExistsError();
    this.rows.set(id, { version: 1, prefs: structuredClone(prefs), updatedBy: tag });
    return this.snap(id);
  }
  async update(id: string, patch: Partial<SyncedPrefs>, base: number, tag: string) {
    this.calls.push('update');
    if (this.offline) throw new SyncError('offline', 'offline');
    if (this.interleave > 0) { this.interleave--; this.write(id, { followUp: !this.rows.get(id)!.prefs.followUp }, 'web:other'); }
    const r = this.rows.get(id);
    if (!r || r.version !== base) return null;
    this.write(id, patch, tag);
    return this.snap(id);
  }
  /** A write by some other device, bypassing our client. */
  write(id: string, patch: Partial<SyncedPrefs>, tag = 'extension:other') {
    const r = this.rows.get(id)!;
    this.rows.set(id, { version: r.version + 1, prefs: { ...r.prefs, ...structuredClone(patch) }, updatedBy: tag });
  }
}

const guest = (patch: Partial<SyncedPrefs> = {}): LocalSnapshot => ({ prefs: { ...DEFAULT_PREFS, ...patch }, base: null, dirty: {}, linkedUserId: null });
const U = 'user-1';

describe('preference schema', () => {
  it('defaults are valid and cover every key', () => {
    for (const k of PREF_KEYS) expect(isValidPref(k, DEFAULT_PREFS[k]), k).toBe(true);
    expect(sanitizePrefs(DEFAULT_PREFS).invalid).toEqual([]);
  });

  it('rejects out-of-range and malformed values (mirrors the database CHECK constraints)', () => {
    const bad: [PrefKey, unknown][] = [
      ['intervention', 'haptic'], ['sensitivity', 'max'], ['zones', []], ['zones', ['crown', 'crown']], ['zones', ['ears']],
      ['cooldownSeconds', 4], ['cooldownSeconds', 601], ['cooldownSeconds', 30.5], ['chimeVolume', -1], ['chimeVolume', 101],
      ['followUp', 'yes'], ['microPrompt', 'dance'], ['supportiveText', 'x'.repeat(141)], ['supportiveText', 'line\nbreak'],
      ['companionTone', 'sassy'], ['dailyGoalMinutes', 4], ['dailyGoalMinutes', 481], ['reminderTime', '24:00'], ['reminderTime', '7:00'],
    ];
    for (const [k, v] of bad) expect(isValidPref(k, v), `${k}=${JSON.stringify(v)}`).toBe(false);
  });

  it('counts supportive text in code points, like Postgres char_length', () => {
    expect(isValidPref('supportiveText', '🌿'.repeat(140))).toBe(true); // 280 UTF-16 units, 140 code points
    expect(isValidPref('supportiveText', '🌿'.repeat(141))).toBe(false);
  });

  it('sanitize keeps valid fields, replaces invalid ones and reports them', () => {
    const { prefs, invalid } = sanitizePrefs({ sensitivity: 'sensitive', intervention: 'laser', unknownFutureField: 1 });
    expect(prefs.sensitivity).toBe('sensitive');
    expect(prefs.intervention).toBe(DEFAULT_PREFS.intervention);
    expect(invalid).toEqual(['intervention']);
  });

  it('round-trips through table rows', () => {
    const p: SyncedPrefs = { ...DEFAULT_PREFS, cooldownSeconds: 120, supportiveText: 'You are doing fine.', reminderTime: '08:30', zones: ['brows', 'lashes'] };
    const back = fromRow({ ...toRow(p), version: 7, updated_at: 'x', updated_by: 'web:abc' });
    expect(back.prefs).toEqual(p);
    expect(back.version).toBe(7);
    expect(toRow({ cooldownSeconds: 60 })).toEqual({ cooldown_seconds: 60 });
  });

  it('treats zone order as irrelevant', () => {
    expect(prefEquals('zones', ['crown', 'brows'], ['brows', 'crown'])).toBe(true);
    expect(prefEquals('zones', ['crown'], ['crown', 'brows'])).toBe(false);
  });

  it('micro prompts rotate and can be off', () => {
    expect(microPromptText('none')).toBeNull();
    expect(microPromptText('posture')).toMatch(/posture/);
    expect(new Set([0, 1, 2, 3].map((n) => microPromptText('rotate', n))).size).toBe(4);
  });
});

describe('three-way merge', () => {
  const base = DEFAULT_PREFS;
  it('pushes a local-only change', () => {
    const m = threeWayMerge(base, { ...base, sensitivity: 'sensitive' }, base, new Set(['sensitivity']));
    expect(m.toPush).toEqual({ sensitivity: 'sensitive' });
    expect(m.merged.sensitivity).toBe('sensitive');
    expect(m.conflicts).toEqual([]);
  });
  it('applies a remote-only change', () => {
    const m = threeWayMerge(base, base, { ...base, intervention: 'visual' }, new Set());
    expect(m.merged.intervention).toBe('visual');
    expect(m.fromRemote).toEqual(['intervention']);
    expect(m.toPush).toEqual({});
  });
  it('combines changes to different fields', () => {
    const m = threeWayMerge(base, { ...base, chimeVolume: 20 }, { ...base, followUp: false }, new Set(['chimeVolume']));
    expect(m.merged).toEqual({ ...base, chimeVolume: 20, followUp: false });
    expect(m.toPush).toEqual({ chimeVolume: 20 });
  });
  it('same field changed on both sides: server wins and the conflict is reported', () => {
    const m = threeWayMerge(base, { ...base, cooldownSeconds: 5 }, { ...base, cooldownSeconds: 300 }, new Set(['cooldownSeconds']));
    expect(m.merged.cooldownSeconds).toBe(300);
    expect(m.toPush).toEqual({});
    expect(m.conflicts).toEqual(['cooldownSeconds']);
  });
  it('the same change made on both sides is not a conflict', () => {
    const m = threeWayMerge(base, { ...base, sensitivity: 'relaxed' }, { ...base, sensitivity: 'relaxed' }, new Set(['sensitivity']));
    expect(m.conflicts).toEqual([]);
    expect(m.toPush).toEqual({});
  });
});

describe('sync engine', () => {
  it('first device uploads its guest settings to a new account', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest({ intervention: 'voice', cooldownSeconds: 60 }));
    const out = await syncPreferences(a, srv, U, 'extension:a');
    expect(out).toMatchObject({ kind: 'ok', createdRemote: true, version: 1 });
    expect(srv.rows.get(U)!.prefs).toMatchObject({ intervention: 'voice', cooldownSeconds: 60 });
    expect(a.snap.linkedUserId).toBe(U);
    expect(a.snap.base?.version).toBe(1);
  });

  it('a second device adopts the account settings instead of its own guest settings', async () => {
    const srv = new FakeServer();
    await syncPreferences(new MemoryStore(guest({ sensitivity: 'sensitive' })), srv, U, 'extension:a');
    const b = new MemoryStore(guest({ sensitivity: 'relaxed', chimeVolume: 10 }));
    b.set('chimeVolume', 15); // guest edit before signing in
    const out = await syncPreferences(b, srv, U, 'extension:b');
    expect(out).toMatchObject({ kind: 'ok', adoptedAccount: true });
    expect(b.snap.prefs.sensitivity).toBe('sensitive');
    expect(b.snap.prefs.chimeVolume).toBe(DEFAULT_PREFS.chimeVolume);
    expect(b.snap.dirty).toEqual({});
  });

  it('A → server → B → server → A (the cross-device round trip)', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest());
    await syncPreferences(a, srv, U, 'extension:a');
    a.set('sensitivity', 'sensitive');
    expect(await syncPreferences(a, srv, U, 'extension:a')).toMatchObject({ kind: 'ok', pushed: ['sensitivity'], version: 2 });
    const b = new MemoryStore(guest());
    await syncPreferences(b, srv, U, 'extension:b');
    expect(b.snap.prefs.sensitivity).toBe('sensitive');
    b.set('intervention', 'visual');
    await syncPreferences(b, srv, U, 'extension:b');
    const outA = await syncPreferences(a, srv, U, 'extension:a');
    expect(outA).toMatchObject({ kind: 'ok', fromRemote: ['intervention'], pushed: [] });
    expect(a.snap.prefs).toMatchObject({ sensitivity: 'sensitive', intervention: 'visual' });
    expect(srv.rows.get(U)!.version).toBe(3);
  });

  it('combines offline edits of different fields from two devices', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest()), b = new MemoryStore(guest());
    await syncPreferences(a, srv, U, 'extension:a');
    await syncPreferences(b, srv, U, 'extension:b');
    a.set('chimeVolume', 30);
    b.set('followUp', false);
    await syncPreferences(b, srv, U, 'extension:b');
    const out = await syncPreferences(a, srv, U, 'extension:a');
    expect(out).toMatchObject({ kind: 'ok', pushed: ['chimeVolume'], fromRemote: ['followUp'], conflicts: [] });
    expect(srv.rows.get(U)!.prefs).toMatchObject({ chimeVolume: 30, followUp: false });
    await syncPreferences(b, srv, U, 'extension:b');
    expect(b.snap.prefs).toEqual(a.snap.prefs);
  });

  it('a stale device cannot overwrite a newer value: the server copy wins and the conflict is reported', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest()), b = new MemoryStore(guest());
    await syncPreferences(a, srv, U, 'extension:a');
    await syncPreferences(b, srv, U, 'extension:b');
    a.set('cooldownSeconds', 5); // made offline on A
    b.set('cooldownSeconds', 300); // reaches the server first
    await syncPreferences(b, srv, U, 'extension:b');
    const out = await syncPreferences(a, srv, U, 'extension:a');
    expect(out).toMatchObject({ kind: 'ok', conflicts: ['cooldownSeconds'], pushed: [] });
    expect(srv.rows.get(U)!.prefs.cooldownSeconds).toBe(300);
    expect(a.snap.prefs.cooldownSeconds).toBe(300);
    expect(a.snap.dirty).toEqual({});
  });

  it('retries when another device writes between read and write (optimistic concurrency)', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest());
    await syncPreferences(a, srv, U, 'extension:a');
    a.set('chimeVolume', 40);
    srv.interleave = 1;
    const out = await syncPreferences(a, srv, U, 'extension:a');
    expect(out).toMatchObject({ kind: 'ok', pushed: ['chimeVolume'], fromRemote: ['followUp'] });
    expect(srv.calls.filter((c) => c === 'update')).toHaveLength(2);
    expect(srv.rows.get(U)!.prefs).toMatchObject({ chimeVolume: 40, followUp: false });
    expect(a.snap.prefs.followUp).toBe(false);
  });

  it('keeps an edit the user made while a sync was in flight', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest());
    await syncPreferences(a, srv, U, 'extension:a');
    a.set('sensitivity', 'relaxed', 1000);
    const loaded = await a.load();
    a.set('sensitivity', 'sensitive', 2000); // changed again before the commit
    const next = applyCommit(a.snap, { userId: U, merged: { ...loaded.prefs }, base: { version: 2, prefs: { ...loaded.prefs } }, loadedDirty: loaded.dirty });
    expect(next.prefs.sensitivity).toBe('sensitive');
    expect(next.dirty).toEqual({ sensitivity: 2000 });
  });

  it('offline: reports offline and leaves local changes queued', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest());
    await syncPreferences(a, srv, U, 'extension:a');
    a.set('intervention', 'off');
    srv.offline = true;
    expect(await syncPreferences(a, srv, U, 'extension:a')).toEqual({ kind: 'offline', message: 'You appear to be offline.' });
    expect(a.snap.dirty.intervention).toBeDefined();
    srv.offline = false;
    expect(await syncPreferences(a, srv, U, 'extension:a')).toMatchObject({ kind: 'ok', pushed: ['intervention'] });
  });

  it('two devices creating the account row at the same time end up merged, not overwritten', async () => {
    const srv = new FakeServer();
    const b = new MemoryStore(guest({ sensitivity: 'relaxed' }));
    // Device A creates the row between B's read (none) and B's create.
    const realCreate = srv.create.bind(srv);
    let first = true;
    srv.create = async (id, p, t) => {
      if (first) { first = false; await realCreate(id, { ...DEFAULT_PREFS, sensitivity: 'sensitive' }, 'extension:a'); }
      return realCreate(id, p, t);
    };
    const out = await syncPreferences(b, srv, U, 'extension:b');
    expect(out).toMatchObject({ kind: 'ok', adoptedAccount: true });
    expect(b.snap.prefs.sensitivity).toBe('sensitive');
  });

  it('switching accounts on one device loads the other account instead of leaking settings across', async () => {
    const srv = new FakeServer();
    const a = new MemoryStore(guest({ chimeVolume: 11 }));
    await syncPreferences(a, srv, 'user-1', 'extension:a');
    srv.rows.set('user-2', { version: 4, prefs: { ...DEFAULT_PREFS, chimeVolume: 99 }, updatedBy: null });
    const out = await syncPreferences(a, srv, 'user-2', 'extension:a');
    expect(out).toMatchObject({ kind: 'ok', adoptedAccount: true });
    expect(a.snap.prefs.chimeVolume).toBe(99);
    expect(srv.rows.get('user-1')!.prefs.chimeVolume).toBe(11);
  });
});
