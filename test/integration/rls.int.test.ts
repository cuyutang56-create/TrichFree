// Real database tests against the local Supabase stack: authentication with one-time codes, row-level
// security between two users, constraint validation, export, account deletion and the public pilot form.
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, isValidPref, toRow, type PrefKey } from '../../src/sync/prefs';
import { deleteAccount, exportAccountData, submitPilotInterest } from '../../src/sync/remote';
import { uploadBatch } from '../../src/shared/uploadQueue';
import { adminClient, anonClient, signIn, uniqueEmail } from './env';

let A: { client: SupabaseClient; userId: string; email: string };
let B: { client: SupabaseClient; userId: string; email: string };

beforeAll(async () => {
  const ea = uniqueEmail('alice'), eb = uniqueEmail('bob');
  A = { ...(await signIn(ea)), email: ea };
  B = { ...(await signIn(eb)), email: eb };
  for (const u of [A, B]) {
    const { error } = await u.client.from('user_preferences').insert({ user_id: u.userId, ...toRow(DEFAULT_PREFS) });
    expect(error).toBeNull();
  }
});

describe('authentication', () => {
  it('a one-time code signs in and creates a profile automatically', async () => {
    const { data } = await A.client.from('profiles').select('id').single();
    expect(data?.id).toBe(A.userId);
  });
  it('a wrong code is rejected', async () => {
    const c = anonClient();
    const email = uniqueEmail('wrong');
    await c.auth.signInWithOtp({ email });
    const { data, error } = await c.auth.verifyOtp({ email, token: '000000', type: 'email' });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });
});

describe('row-level security: user B can never touch user A', () => {
  it('B cannot read A’s preferences, profile or reflections', async () => {
    await A.client.from('reflections').insert({ body: 'private note from A' });
    for (const [table, col] of [['user_preferences', 'user_id'], ['profiles', 'id'], ['reflections', 'user_id']] as const) {
      const { data, error } = await B.client.from(table).select('*').eq(col, A.userId);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it('B cannot update A’s preferences (0 rows affected, A’s row unchanged)', async () => {
    const { data } = await B.client.from('user_preferences').update({ sensitivity: 'relaxed' }).eq('user_id', A.userId).select();
    expect(data).toEqual([]);
    const mine = await A.client.from('user_preferences').select('sensitivity').single();
    expect(mine.data?.sensitivity).toBe(DEFAULT_PREFS.sensitivity);
  });

  it('B cannot create a row in A’s name', async () => {
    const { error } = await B.client.from('reflections').insert({ user_id: A.userId, body: 'forged' });
    expect(error?.code).toBe('42501');
    const prefs = await B.client.from('user_preferences').insert({ user_id: A.userId, ...toRow(DEFAULT_PREFS) });
    expect(prefs.error).not.toBeNull();
  });

  it('B cannot delete A’s reflections or preferences', async () => {
    const { data: aRows } = await A.client.from('reflections').select('id');
    const del = await B.client.from('reflections').delete().eq('id', aRows![0].id).select();
    expect(del.data ?? []).toEqual([]);
    expect((await A.client.from('reflections').select('id')).data).toHaveLength(aRows!.length);
    const delPrefs = await B.client.from('user_preferences').delete().eq('user_id', A.userId);
    expect(delPrefs.error?.code).toBe('42501'); // no delete privilege at all
  });

  it('a user cannot move their row to someone else (owner is immutable)', async () => {
    await A.client.from('user_preferences').update({ user_id: B.userId }).eq('user_id', A.userId);
    const { data } = await adminClient().from('user_preferences').select('user_id').eq('user_id', A.userId);
    expect(data).toHaveLength(1);
  });

  it('the anonymous key cannot read or write any account table', async () => {
    const anon = anonClient();
    for (const t of ['user_preferences', 'profiles', 'reflections', 'pilot_interest', 'pilot_codes']) {
      const { data, error } = await anon.from(t).select('*');
      expect(error !== null || (data ?? []).length === 0, t).toBe(true);
    }
    const ins = await anon.from('user_preferences').insert({ user_id: A.userId, ...toRow(DEFAULT_PREFS) });
    expect(ins.error).not.toBeNull();
  });
});

describe('preferences versioning (optimistic concurrency)', () => {
  it('every write bumps the version and server timestamps cannot be forged', async () => {
    const before = await A.client.from('user_preferences').select('version, updated_at').single();
    const { data } = await A.client.from('user_preferences')
      .update({ chime_volume: 33, version: 999, updated_at: '2000-01-01T00:00:00Z' }).eq('user_id', A.userId).select().single();
    expect(data.version).toBe(before.data!.version + 1);
    expect(Date.parse(data.updated_at)).toBeGreaterThan(Date.parse('2020-01-01'));
  });

  it('a write based on a stale version changes nothing', async () => {
    const cur = await A.client.from('user_preferences').select('version').single();
    const stale = cur.data!.version - 1;
    const { data } = await A.client.from('user_preferences').update({ chime_volume: 1 }).eq('user_id', A.userId).eq('version', stale).select();
    expect(data).toEqual([]);
  });

  it('two devices writing from the same version: exactly one wins', async () => {
    const second = await signIn(A.email); // same account, separate session ("device 2")
    const v = (await A.client.from('user_preferences').select('version').single()).data!.version;
    const [r1, r2] = await Promise.all([
      A.client.from('user_preferences').update({ cooldown_seconds: 15 }).eq('user_id', A.userId).eq('version', v).select(),
      second.client.from('user_preferences').update({ cooldown_seconds: 300 }).eq('user_id', A.userId).eq('version', v).select(),
    ]);
    expect([r1.data!.length, r2.data!.length].sort()).toEqual([0, 1]);
  });
});

describe('the database enforces the same rules as the apps', () => {
  const cases: [PrefKey, unknown, boolean][] = [
    ['intervention', 'visual', true], ['intervention', 'haptic', false],
    ['sensitivity', 'relaxed', true], ['sensitivity', 'extreme', false],
    ['zones', ['crown', 'lashes'], true], ['zones', [], false], ['zones', ['crown', 'crown'], false], ['zones', ['toes'], false],
    ['cooldownSeconds', 5, true], ['cooldownSeconds', 600, true], ['cooldownSeconds', 4, false], ['cooldownSeconds', 601, false],
    ['chimeVolume', 0, true], ['chimeVolume', 101, false],
    ['microPrompt', 'rotate', true], ['microPrompt', 'jump', false],
    ['supportiveText', 'You can do this.', true], ['supportiveText', 'x'.repeat(141), false], ['supportiveText', 'tab\there', false],
    ['companionTone', 'playful', true], ['companionTone', 'sassy', false],
    ['dailyGoalMinutes', 480, true], ['dailyGoalMinutes', 481, false],
    ['reminderTime', '23:59', true], ['reminderTime', '24:00', false], ['reminderTime', null, true],
  ];
  for (const [key, value, ok] of cases) {
    it(`${key} = ${JSON.stringify(value).slice(0, 24)} → ${ok ? 'accepted' : 'rejected'} by both`, async () => {
      expect(isValidPref(key, value)).toBe(ok);
      const { error } = await A.client.from('user_preferences').update(toRow({ [key]: value })).eq('user_id', A.userId);
      expect(error === null).toBe(ok);
      if (!ok) expect(error?.code).toBe('23514'); // check_violation
    });
  }
});

describe('profiles', () => {
  it('policy acceptance time is set by the server; protected columns cannot be written', async () => {
    const { data } = await A.client.from('profiles').update({ privacy_policy_version: '2026-10-12' }).eq('id', A.userId).select().single();
    expect(data.accepted_policy_at).not.toBeNull();
    const forged = await A.client.from('profiles').update({ accepted_policy_at: '2000-01-01T00:00:00Z' }).eq('id', A.userId);
    expect(forged.error?.code).toBe('42501');
  });
});

describe('export and deletion', () => {
  it('export contains only the caller’s data', async () => {
    const data = (await exportAccountData(B.client)) as Record<string, unknown> & { reflections: unknown[]; account: { id: string } };
    expect(data.format).toBe('trichfree-account-export');
    expect(data.account.id).toBe(B.userId);
    expect(JSON.stringify(data)).not.toContain(A.userId);
    expect(JSON.stringify(data)).not.toContain('private note from A');
  });

  it('the anonymous key cannot call account deletion', async () => {
    const { error } = await anonClient().rpc('delete_my_account');
    expect(error).not.toBeNull();
  });

  it('deleting an account removes the user and every row it owned, and only those rows', async () => {
    const email = uniqueEmail('leaver');
    const u = await signIn(email);
    await u.client.from('user_preferences').insert({ user_id: u.userId, ...toRow(DEFAULT_PREFS) });
    await u.client.from('reflections').insert({ body: 'bye' });
    const admin = adminClient();
    const aBefore = await admin.from('reflections').select('id', { count: 'exact', head: true }).eq('user_id', A.userId);

    await deleteAccount(u.client);

    for (const [t, col] of [['user_preferences', 'user_id'], ['reflections', 'user_id'], ['profiles', 'id']] as const) {
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, u.userId);
      expect(count, t).toBe(0);
    }
    const { data: au } = await admin.auth.admin.getUserById(u.userId);
    expect(au.user).toBeNull();
    const aAfter = await admin.from('reflections').select('id', { count: 'exact', head: true }).eq('user_id', A.userId);
    expect(aAfter.count).toBe(aBefore.count);
  });
});

describe('public pilot interest form', () => {
  it('anyone can submit; resubmitting is silent (no way to learn whether an email is listed)', async () => {
    const anon = anonClient();
    const email = uniqueEmail('pilot');
    await expect(submitPilotInterest(anon, { email, role: 'self', ageConfirmed: true, contactConsent: true, note: 'hi' })).resolves.toBeUndefined();
    await expect(submitPilotInterest(anon, { email: email.toUpperCase(), role: 'other', ageConfirmed: true, contactConsent: true })).resolves.toBeUndefined();
    const { count } = await adminClient().from('pilot_interest').select('*', { count: 'exact', head: true }).eq('email', email);
    expect(count).toBe(1);
  });
  it('rejects invalid submissions and cannot be read back', async () => {
    const anon = anonClient();
    await expect(submitPilotInterest(anon, { email: 'not-an-email', role: 'self', ageConfirmed: true, contactConsent: true })).rejects.toThrow();
    await expect(submitPilotInterest(anon, { email: uniqueEmail('p'), role: 'self', ageConfirmed: false, contactConsent: true })).rejects.toThrow();
    const { data, error } = await anon.from('pilot_interest').select('*');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe('pilot telemetry (anonymous research uploads)', () => {
  const row = (code: string) => ({ id: crypto.randomUUID(), participant_code: code, type: 'pause', t: new Date().toISOString(), app_version: 'test' });
  it('the database only accepts issued codes in the long random format', async () => {
    const { error } = await adminClient().from('pilot_codes').insert({ code: 'TF-AB12' });
    expect(error?.code).toBe('23514'); // check_violation: short, guessable codes cannot even be registered
  });
  it('rejects codes the team did not issue', async () => {
    const { error } = await anonClient().from('events').insert(row('TF-ZZZZ-ZZZZ'));
    expect(error?.code).toBe('42501');
  });
  it('accepts issued codes through the real upload path, treats re-uploads as sent, and cannot be read back', async () => {
    const { error: seedErr } = await adminClient().from('pilot_codes').upsert({ code: 'TF-TE5T-2345' });
    expect(seedErr).toBeNull();
    const anon = anonClient();
    const r1 = row('TF-TE5T-2345'), r2 = row('TF-TE5T-2345');
    expect(await uploadBatch(anon, 'events', [r1])).toEqual({ sent: [0], failed: [] });
    // Retry after a lost response: r1 again plus a new row. Both count as sent; r2 is stored once.
    expect(await uploadBatch(anon, 'events', [r1, r2])).toEqual({ sent: [0, 1], failed: [] });
    const { count } = await adminClient().from('events').select('*', { count: 'exact', head: true }).in('id', [r1.id, r2.id]);
    expect(count).toBe(2);
    const { data, error } = await anon.from('events').select('*');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
  it('an unissued code in a batch fails that batch without crashing the queue', async () => {
    expect(await uploadBatch(anonClient(), 'events', [row('TF-N0PE-0000')])).toEqual({ sent: [], failed: [0] });
  });
});
