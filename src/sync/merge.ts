// Field-level three-way merge for cross-device preferences.
//
// Policy (documented in ARCHITECTURE.md → "Conflict resolution"):
//  · A change made on only one side is kept.
//  · Changes to *different* fields on two devices are combined.
//  · If the *same* field changed on both sides since this device last synced, the value already on the server
//    wins (it reached the server first) and the device reports the field as a conflict so the UI can say so.
//    A stale device can therefore never silently overwrite a newer setting.
import { PREF_KEYS, prefEquals, type PrefKey, type SyncedPrefs } from './prefs';

export interface MergeResult {
  /** The values this device should use now. */
  merged: SyncedPrefs;
  /** Local changes the server does not have yet. Empty when nothing needs to be sent. */
  toPush: Partial<SyncedPrefs>;
  /** Fields changed on both sides; the server's value was kept. */
  conflicts: PrefKey[];
  /** Fields this device took from the server (changed elsewhere). */
  fromRemote: PrefKey[];
}

/**
 * @param base   the server values this device last synced (null: never synced with this account)
 * @param local  this device's current values
 * @param remote the server's current values
 * @param dirty  fields the user changed on this device since the last successful sync
 */
export function threeWayMerge(base: SyncedPrefs | null, local: SyncedPrefs, remote: SyncedPrefs, dirty: ReadonlySet<PrefKey>): MergeResult {
  const merged = { ...remote } as Record<PrefKey, unknown>;
  const toPush: Partial<Record<PrefKey, unknown>> = {};
  const conflicts: PrefKey[] = [];
  const fromRemote: PrefKey[] = [];
  for (const k of PREF_KEYS) {
    const eq = (a: unknown, b: unknown) => prefEquals(k, a as never, b as never);
    const localChanged = dirty.has(k);
    // Without a base we cannot tell whether the server changed, so treat any difference as a remote change.
    const remoteChanged = base ? !eq(remote[k], base[k]) : !eq(remote[k], local[k]);
    if (localChanged && !remoteChanged) {
      merged[k] = local[k];
      if (!eq(local[k], remote[k])) toPush[k] = local[k];
    } else if (localChanged && remoteChanged) {
      merged[k] = remote[k];
      if (!eq(local[k], remote[k])) conflicts.push(k);
    } else if (remoteChanged && !eq(local[k], remote[k])) {
      fromRemote.push(k);
    } else if (!eq(local[k], remote[k])) {
      // Not dirty and the server did not change since the base, yet the values differ. That happens when local
      // storage was edited outside the tracked path (e.g. a restored backup). The server's value is authoritative.
      fromRemote.push(k);
    }
  }
  return { merged: merged as unknown as SyncedPrefs, toPush: toPush as Partial<SyncedPrefs>, conflicts, fromRemote };
}
