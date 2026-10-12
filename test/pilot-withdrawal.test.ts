// Release audit: switching "Send pilot data to the research team" off must stop sending at once, including rows
// that were already queued (an offline backlog, or the last minute's rows). The Supabase client is a recording
// stand-in; the database is a real (fake-indexeddb) TrichFree database.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrichFreeDB, setSettings } from '../src/shared/db';
import { eventRow } from '../src/shared/telemetry';
import { enqueue, flush, sharingEnabled } from '../src/shared/uploadQueue';

const inserts: { table: string; rows: unknown }[] = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => ({ insert: async (rows: unknown) => { inserts.push({ table, rows }); return { error: null }; } }) }),
}));
// A build with a research server configured.
vi.mock('../src/shared/config', async (importOriginal) => ({ ...(await importOriginal<object>()), SUPABASE_URL: 'https://research.example.test', SUPABASE_KEY: 'public-anon-key' }));

describe('pilot data sharing: withdrawal', () => {
  beforeEach(() => { inserts.length = 0; });

  it('rows queued before sharing was switched off are not sent; they stay on this computer unless it is switched back on', async () => {
    const d = new TrichFreeDB(`withdraw-${Date.now()}`);
    await setSettings({ participantCode: 'TF-AB12-CD34', pilotConsent: true, pilotSharing: true }, d);
    expect((await sharingEnabled(d)).on).toBe(true);
    await enqueue('events', eventRow({ id: 'v1', type: 'pause', t: 1 }, 'TF-AB12-CD34'), d); // e.g. queued while offline

    await setSettings({ pilotSharing: false }, d); // the participant switches sharing off
    await flush(d);
    expect(inserts, 'nothing is sent after sharing is switched off').toEqual([]);
    expect(await d.uploadQueue.count()).toBe(1);

    await setSettings({ pilotSharing: true }, d); // …and back on: the rows collected while they agreed are sent
    expect(await flush(d)).toEqual({ sent: 1, failed: 0 });
    expect(inserts.map((i) => i.table)).toEqual(['events']);
    expect(await d.uploadQueue.count()).toBe(0);
  });
});
