// Release audit: session lifecycle and the API surface, against the real local stack.
// These check behaviour the apps rely on but never exercised directly: that signing out revokes the refresh
// token on the server, that a deleted account's leftover tokens are useless, and that nothing beyond the
// documented endpoints is reachable.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { anonClient, localEnv, signIn, uniqueEmail } from './env';

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const fresh = () => createClient(localEnv().url, localEnv().anonKey, opts);
const asToken = (t: string) => createClient(localEnv().url, localEnv().anonKey, { ...opts, global: { headers: { Authorization: `Bearer ${t}` } } });

describe('session lifecycle', () => {
  it('signing out (as the apps do, scope "local") revokes the refresh token on the server', async () => {
    const { client } = await signIn(uniqueEmail('signout'));
    const s = (await client.auth.getSession()).data.session!;
    expect((await client.auth.signOut({ scope: 'local' })).error).toBeNull();
    const again = await fresh().auth.refreshSession({ refresh_token: s.refresh_token });
    expect(again.error).not.toBeNull();
    expect(again.data.session).toBeNull();
  });

  it('a refresh token can be used once: replaying a rotated one does not mint a new session', async () => {
    const { client } = await signIn(uniqueEmail('rotate'));
    const first = (await client.auth.getSession()).data.session!;
    const r1 = await fresh().auth.refreshSession({ refresh_token: first.refresh_token });
    expect(r1.error).toBeNull();
    // Replays within the reuse interval (10 s) return the same, current session rather than a new chain.
    const replay = await fresh().auth.refreshSession({ refresh_token: first.refresh_token });
    if (!replay.error) expect(replay.data.session?.refresh_token).toBe(r1.data.session?.refresh_token);
  });

  it('after account deletion, the leftover refresh token is dead and the access token cannot write anything', async () => {
    const { client, userId } = await signIn(uniqueEmail('gone'));
    const s = (await client.auth.getSession()).data.session!;
    expect((await client.rpc('delete_my_account')).error).toBeNull();
    expect((await fresh().auth.refreshSession({ refresh_token: s.refresh_token })).error).not.toBeNull();
    const ghost = asToken(s.access_token);
    expect((await ghost.from('user_preferences').insert({ user_id: userId, updated_by: 'web:ghost1' })).error).not.toBeNull();
    expect((await ghost.from('reflections').insert({ user_id: userId, body: 'still here?' })).error).not.toBeNull();
    expect((await ghost.from('user_preferences').select('user_id')).data ?? []).toHaveLength(0);
  });
});

describe('API surface', () => {
  it('the anonymous key sees only the pilot insert tables and the pilot form function', async () => {
    const res = await fetch(`${localEnv().url}/rest/v1/`, { headers: { apikey: localEnv().anonKey, Authorization: `Bearer ${localEnv().anonKey}` } });
    const paths = Object.keys(((await res.json()) as { paths: Record<string, unknown> }).paths).sort();
    expect(paths).toEqual(['/', '/calibrations', '/episodes', '/events', '/rpc/submit_pilot_interest', '/sessions']);
  });

  it('helpers in the private schema are not callable through the API', async () => {
    const r = await anonClient().rpc('is_issued_pilot_code', { c: 'TF-AAAA-AAAA' });
    expect(r.error).not.toBeNull();
  });

  it('the pilot form function rejects malformed input server-side', async () => {
    const a = anonClient();
    const base = { p_email: 'ok@example.test', p_role: 'self', p_age_confirmed: true, p_contact_consent: true };
    for (const bad of [
      { ...base, p_email: `${'x'.repeat(250)}@e.test` },
      { ...base, p_email: 'not-an-email' },
      { ...base, p_role: 'admin' },
      { ...base, p_age_confirmed: false },
      { ...base, p_contact_consent: false },
      { ...base, p_note: 'y'.repeat(501) },
    ]) expect((await a.rpc('submit_pilot_interest', bad)).error, JSON.stringify(bad).slice(0, 60)).not.toBeNull();
  });
});
