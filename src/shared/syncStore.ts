// IndexedDB (Dexie) implementation of the sync LocalStore. Commits run in one transaction so a setting the
// user changes in another tab while a sync is in flight is never overwritten (see applyCommit).
import { applyCommit, type LocalStore } from '../sync/engine';
import { db, getSettings, getSyncMeta, pickSynced, setSettings, type TrichFreeDB } from './db';

export function dexieStore(d: TrichFreeDB = db): LocalStore {
  const snapshot = async () => {
    const [s, m] = await Promise.all([getSettings(d), getSyncMeta(d)]);
    return { prefs: pickSynced(s), base: m.base, dirty: m.dirty, linkedUserId: m.linkedUserId };
  };
  return {
    load: () => d.transaction('r', d.settings, d.meta, snapshot),
    commit: (args) => d.transaction('rw', d.settings, d.meta, async () => {
      const next = applyCommit(await snapshot(), args);
      await setSettings(next.prefs, d, { fromSync: true });
      await d.meta.bulkPut([
        { key: 'syncBase', value: next.base },
        { key: 'syncDirty', value: next.dirty },
        { key: 'syncUser', value: next.linkedUserId },
      ]);
    }),
  };
}
