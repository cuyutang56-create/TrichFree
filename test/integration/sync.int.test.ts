// The real sync engine against the real database: two independently signed-in "devices" on one account.
// (The browser-level version with two separate Chrome profiles is e2e/cross-device.spec.ts.)
import { describe, expect, it } from 'vitest';
import { MemoryStore, syncPreferences, type LocalSnapshot } from '../../src/sync/engine';
import { DEFAULT_PREFS, type SyncedPrefs } from '../../src/sync/prefs';
import { supabaseRemote } from '../../src/sync/remote';
import { adminClient, signIn, uniqueEmail } from './env';

const guest = (p: Partial<SyncedPrefs> = {}): LocalSnapshot => ({ prefs: { ...DEFAULT_PREFS, ...p }, base: null, dirty: {}, linkedUserId: null });

describe('cross-device sync through the database', () => {
  it('laptop A saves, laptop B retrieves and changes, laptop A picks up the change', async () => {
    const email = uniqueEmail('xdev');
    const devA = await signIn(email);
    const devB = await signIn(email); // separate session, same account
    expect(devB.userId).toBe(devA.userId);
    const uid = devA.userId;
    const a = new MemoryStore(guest({ intervention: 'voice' }));
    const b = new MemoryStore(guest({ sensitivity: 'relaxed' })); // B's guest settings must not leak into the account

    // 1–3. A signs in (guest settings become the account's), then changes a preference.
    expect(await syncPreferences(a, supabaseRemote(devA.client), uid, 'extension:aaaa')).toMatchObject({ kind: 'ok', createdRemote: true });
    a.set('cooldownSeconds', 120);
    expect(await syncPreferences(a, supabaseRemote(devA.client), uid, 'extension:aaaa')).toMatchObject({ kind: 'ok', pushed: ['cooldownSeconds'] });
    const row = (await adminClient().from('user_preferences').select('*').eq('user_id', uid).single()).data;
    expect(row).toMatchObject({ cooldown_seconds: 120, intervention: 'voice', updated_by: 'extension:aaaa' });

    // 4–5. B signs in and gets A's preferences.
    expect(await syncPreferences(b, supabaseRemote(devB.client), uid, 'extension:bbbb')).toMatchObject({ kind: 'ok', adoptedAccount: true });
    expect(b.snap.prefs).toMatchObject({ cooldownSeconds: 120, intervention: 'voice', sensitivity: DEFAULT_PREFS.sensitivity });

    // 6. B changes something.
    b.set('intervention', 'visual');
    await syncPreferences(b, supabaseRemote(devB.client), uid, 'extension:bbbb');

    // 7. A had an unsynced change of a different field meanwhile; both survive.
    a.set('chimeVolume', 25);
    const outA = await syncPreferences(a, supabaseRemote(devA.client), uid, 'extension:aaaa');
    expect(outA).toMatchObject({ kind: 'ok', pushed: ['chimeVolume'], fromRemote: ['intervention'], conflicts: [] });
    expect(a.snap.prefs).toMatchObject({ intervention: 'visual', chimeVolume: 25, cooldownSeconds: 120 });

    // Same field on both: the copy that reached the server first is kept; the other device is told.
    a.set('sensitivity', 'sensitive');
    b.set('sensitivity', 'relaxed');
    await syncPreferences(b, supabaseRemote(devB.client), uid, 'extension:bbbb');
    const outConflict = await syncPreferences(a, supabaseRemote(devA.client), uid, 'extension:aaaa');
    expect(outConflict).toMatchObject({ kind: 'ok', conflicts: ['sensitivity'] });
    expect(a.snap.prefs.sensitivity).toBe('relaxed');
    const final = (await adminClient().from('user_preferences').select('sensitivity, chime_volume, intervention').eq('user_id', uid).single()).data;
    expect(final).toEqual({ sensitivity: 'relaxed', chime_volume: 25, intervention: 'visual' });
  });

  it('an expired or revoked session reports an auth problem instead of silently dropping changes', async () => {
    const email = uniqueEmail('signedout');
    const dev = await signIn(email);
    const store = new MemoryStore(guest());
    await syncPreferences(store, supabaseRemote(dev.client), dev.userId, 'extension:cccc');
    store.set('followUp', false);
    await dev.client.auth.signOut();
    const out = await syncPreferences(store, supabaseRemote(dev.client), dev.userId, 'extension:cccc');
    expect(out.kind).not.toBe('ok');
    expect(store.snap.dirty.followUp).toBeDefined(); // still queued for the next successful sync
  });
});
