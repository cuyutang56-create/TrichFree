// Preference sync orchestration, independent of where the data lives (the extension uses IndexedDB and the
// service worker; the website keeps an in-memory copy). See merge.ts for the conflict policy.
import { threeWayMerge } from './merge';
import { PREF_KEYS, prefEquals, type PrefKey, type RemotePrefs, type SyncedPrefs } from './prefs';

export type DirtyMap = Partial<Record<PrefKey, number>>;

export interface SyncBase {
  version: number;
  prefs: SyncedPrefs;
}

export interface LocalSnapshot {
  prefs: SyncedPrefs;
  /** Server copy from the last successful sync with `linkedUserId`. */
  base: SyncBase | null;
  /** Field → time it was last changed on this device and not yet synced. */
  dirty: DirtyMap;
  linkedUserId: string | null;
}

export interface CommitArgs {
  userId: string;
  merged: SyncedPrefs;
  base: SyncBase;
  /** The dirty map as it was loaded. A field whose dirty time differs at commit time was changed again during
   *  the sync: the store must keep its newer local value and leave it dirty. */
  loadedDirty: DirtyMap;
}

export interface LocalStore {
  load(): Promise<LocalSnapshot>;
  commit(args: CommitArgs): Promise<void>;
}

export interface RemoteStore {
  get(userId: string): Promise<RemotePrefs | null>;
  /** Throws RowExistsError if another device created the row first. */
  create(userId: string, prefs: SyncedPrefs, deviceTag: string): Promise<RemotePrefs>;
  /** Returns null if the row's version is no longer `baseVersion` (someone else wrote first). */
  update(userId: string, patch: Partial<SyncedPrefs>, baseVersion: number, deviceTag: string): Promise<RemotePrefs | null>;
}

export class RowExistsError extends Error {
  constructor() { super('preferences row already exists'); }
}

export type SyncErrorKind = 'offline' | 'auth' | 'server';
export class SyncError extends Error {
  constructor(message: string, public kind: SyncErrorKind) { super(message); }
}

export type SyncOutcome =
  | {
    kind: 'ok';
    version: number;
    /** Fields this device sent to the server. */
    pushed: PrefKey[];
    /** Fields this device took from the server. */
    fromRemote: PrefKey[];
    /** Fields changed on both sides; the server's value was kept. */
    conflicts: PrefKey[];
    /** First sync of this device with an account that already had saved settings: those were loaded. */
    adoptedAccount: boolean;
    /** First sync of an account with no saved settings: this device's settings were uploaded. */
    createdRemote: boolean;
  }
  | { kind: SyncErrorKind; message: string };

const MAX_ATTEMPTS = 4;

export async function syncPreferences(local: LocalStore, remote: RemoteStore, userId: string, deviceTag: string): Promise<SyncOutcome> {
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snap = await local.load();
      const linked = snap.linkedUserId === userId && snap.base != null;
      const dirtyKeys = new Set(Object.keys(snap.dirty) as PrefKey[]);
      const server = await remote.get(userId);

      if (!server) {
        // The account has never saved settings: this device's settings become the account's.
        let created: RemotePrefs;
        try {
          created = await remote.create(userId, snap.prefs, deviceTag);
        } catch (e) {
          if (e instanceof RowExistsError) continue; // another device got there first: merge with theirs
          throw e;
        }
        await local.commit({ userId, merged: created.prefs, base: { version: created.version, prefs: created.prefs }, loadedDirty: snap.dirty });
        return ok(created.version, { pushed: [...PREF_KEYS], createdRemote: true });
      }

      if (!linked) {
        // First sync of this device with an account that already has settings: the account's settings win.
        const differing = PREF_KEYS.filter((k) => !prefEquals(k, snap.prefs[k] as never, server.prefs[k] as never));
        await local.commit({ userId, merged: server.prefs, base: { version: server.version, prefs: server.prefs }, loadedDirty: snap.dirty });
        return ok(server.version, { fromRemote: differing, adoptedAccount: true });
      }

      const m = threeWayMerge(snap.base!.prefs, snap.prefs, server.prefs, dirtyKeys);
      const pushKeys = Object.keys(m.toPush) as PrefKey[];
      if (!pushKeys.length) {
        await local.commit({ userId, merged: m.merged, base: { version: server.version, prefs: server.prefs }, loadedDirty: snap.dirty });
        return ok(server.version, { fromRemote: m.fromRemote, conflicts: m.conflicts });
      }
      const updated = await remote.update(userId, m.toPush, server.version, deviceTag);
      if (!updated) continue; // the row moved on while we were merging: fetch it again and re-merge
      await local.commit({ userId, merged: updated.prefs, base: { version: updated.version, prefs: updated.prefs }, loadedDirty: snap.dirty });
      return ok(updated.version, { pushed: pushKeys, fromRemote: m.fromRemote, conflicts: m.conflicts });
    }
    return { kind: 'server', message: 'Settings kept changing on another device. We will try again shortly.' };
  } catch (e) {
    if (e instanceof SyncError) return { kind: e.kind, message: e.message };
    return { kind: 'server', message: e instanceof Error ? e.message : String(e) };
  }
}

function ok(version: number, o: Partial<Omit<Extract<SyncOutcome, { kind: 'ok' }>, 'kind' | 'version'>>): SyncOutcome {
  return { kind: 'ok', version, pushed: [], fromRemote: [], conflicts: [], adoptedAccount: false, createdRemote: false, ...o };
}

/**
 * Applies a commit to a plain snapshot (shared by the in-memory store and the IndexedDB store, which runs it
 * inside a transaction). Fields changed again during the sync keep their local value and stay dirty.
 */
export function applyCommit(current: LocalSnapshot, args: CommitArgs): LocalSnapshot {
  const prefs = { ...args.merged } as Record<PrefKey, unknown>;
  const dirty: DirtyMap = {};
  for (const k of PREF_KEYS) {
    const now = current.dirty[k];
    if (now !== undefined && now !== args.loadedDirty[k]) {
      prefs[k] = current.prefs[k];
      dirty[k] = now;
    }
  }
  return { prefs: prefs as unknown as SyncedPrefs, base: args.base, dirty, linkedUserId: args.userId };
}

/** In-memory LocalStore (website, tests). */
export class MemoryStore implements LocalStore {
  constructor(public snap: LocalSnapshot) {}
  async load() { return structuredClone(this.snap); }
  async commit(args: CommitArgs) { this.snap = applyCommit(this.snap, args); }
  /** A user edit on this device. */
  set<K extends PrefKey>(key: K, value: SyncedPrefs[K], at = Date.now()) {
    this.snap = { ...this.snap, prefs: { ...this.snap.prefs, [key]: value }, dirty: { ...this.snap.dirty, [key]: at } };
  }
}
