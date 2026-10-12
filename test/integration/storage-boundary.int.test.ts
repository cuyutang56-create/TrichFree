// Release audit: what leaves the device. The extension's real IndexedDB store and sync engine run against the real
// database with every local-only setting filled in; only the synced preference columns may reach the server, and the
// account export must not contain anything that is only on the device.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { TrichFreeDB, setSettings } from '../../src/shared/db';
import { dexieStore } from '../../src/shared/syncStore';
import { syncPreferences } from '../../src/sync/engine';
import { COLUMN } from '../../src/sync/prefs';
import { exportAccountData, supabaseRemote } from '../../src/sync/remote';
import { adminClient, signIn, uniqueEmail } from './env';

const META = ['user_id', 'version', 'schema_version', 'created_at', 'updated_at', 'updated_by'];

describe('storage boundary', () => {
  it('only the synced preference columns reach the server; device-only data never does', async () => {
    const d = new TrichFreeDB(`audit-boundary-${Date.now()}`);
    await setSettings({
      // device-only settings and state
      lighterDetection: true, debug: true, onboarded: true, consentAt: Date.now(), participantCode: 'TF-K7QM-3XWD',
      pilotConsent: true, pilotSharing: true, activeCalibrationId: 'calib-1', squeezes: { '2026-10-12': 3 },
      // synced settings, including the user's own words
      intervention: 'visual', supportiveText: 'You are doing fine', cooldownSeconds: 120,
    }, d);
    await d.clips.put({ id: 'c1', category: 'notice', blob: new Blob([new Uint8Array(44)]), mimeType: 'audio/wav', durationMs: 1000, createdAt: Date.now(), playCount: 0 });
    await d.episodes.put({ id: 'e1', sessionId: 's1', startedAt: Date.now(), zone: 'crown', arm: 'VOICE', outcome: 'interrupted' } as never);

    const { client, userId } = await signIn(uniqueEmail('boundary'));
    expect(await syncPreferences(dexieStore(d), supabaseRemote(client), userId, 'extension:boundary1')).toMatchObject({ kind: 'ok', createdRemote: true });

    const row = (await adminClient().from('user_preferences').select('*').eq('user_id', userId).single()).data as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([...Object.values(COLUMN), ...META].sort());
    expect(row).toMatchObject({ intervention: 'visual', supportive_text: 'You are doing fine', cooldown_seconds: 120 });

    const exported = JSON.stringify(await exportAccountData(client));
    for (const local of ['lighter', 'debug', 'TF-K7QM', 'participant', 'calib-1', 'squeez', 'clip', 'episode', 'consent_at']) {
      expect(exported, local).not.toContain(local);
    }
    // Nothing else in the database belongs to this user except their profile.
    for (const t of ['reflections', 'episodes', 'sessions', 'events', 'calibrations']) {
      const col = t === 'reflections' ? 'user_id' : 'participant_code';
      const val = t === 'reflections' ? userId : 'TF-K7QM-3XWD';
      const { count } = await adminClient().from(t).select('*', { count: 'exact', head: true }).eq(col, val);
      expect(count, t).toBe(0);
    }
    d.close();
  });
});
