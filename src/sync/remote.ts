// Supabase implementation of the sync RemoteStore plus the account operations both apps use.
// Row-level security on every table means each call can only ever touch the signed-in user's own rows.
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { RowExistsError, SyncError, type RemoteStore } from './engine';
import { fromRow, PREFS_SCHEMA_VERSION, toRow, type SyncedPrefs } from './prefs';

const NETWORK = /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed? ?out|ECONN|ENOTFOUND/i;

/** Maps Supabase/PostgREST errors onto offline / auth / server. */
export function toSyncError(e: PostgrestError | { message?: string; code?: string; status?: number } | Error | null): SyncError {
  const msg = (e && 'message' in e && e.message) || 'Unknown error';
  const code = (e && 'code' in e && (e as { code?: string }).code) || '';
  const status = (e && 'status' in e && (e as { status?: number }).status) || 0;
  if (NETWORK.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return new SyncError('You appear to be offline.', 'offline');
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /jwt|not signed in|refresh token/i.test(msg)) return new SyncError('Your session ended. Please sign in again.', 'auth');
  return new SyncError(msg, 'server');
}

export function supabaseRemote(client: SupabaseClient): RemoteStore {
  return {
    async get(userId) {
      const { data, error } = await client.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw toSyncError(error);
      return data ? fromRow(data) : null;
    },
    async create(userId, prefs, deviceTag) {
      const { data, error } = await client
        .from('user_preferences')
        .insert({ user_id: userId, schema_version: PREFS_SCHEMA_VERSION, updated_by: deviceTag, ...toRow(prefs) })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') throw new RowExistsError();
        throw toSyncError(error);
      }
      return fromRow(data);
    },
    async update(userId, patch: Partial<SyncedPrefs>, baseVersion, deviceTag) {
      const { data, error } = await client
        .from('user_preferences')
        .update({ ...toRow(patch), updated_by: deviceTag })
        .eq('user_id', userId)
        .eq('version', baseVersion)
        .select('*')
        .maybeSingle();
      if (error) throw toSyncError(error);
      return data ? fromRow(data) : null;
    },
  };
}

// ---------- account ----------

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const CODE_RE = /^\d{6}$/;
/** Version of PRIVACY.md / the website privacy page the user accepts when creating an account. */
export const PRIVACY_POLICY_VERSION = '2026-10-12';

export async function sendSignInCode(client: SupabaseClient, email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) return { ok: false, message: 'Please enter a valid email address.' };
  const { error } = await client.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
  if (error) return { ok: false, message: friendlyAuthError(error.message, error.status) };
  return { ok: true };
}

export async function verifySignInCode(client: SupabaseClient, email: string, code: string): Promise<{ ok: true; userId: string; email: string } | { ok: false; message: string }> {
  const e = email.trim().toLowerCase();
  const c = code.replace(/\s+/g, '');
  if (!CODE_RE.test(c)) return { ok: false, message: 'The code has 6 digits.' };
  const { data, error } = await client.auth.verifyOtp({ email: e, token: c, type: 'email' });
  if (error || !data.user) return { ok: false, message: friendlyAuthError(error?.message ?? 'Could not sign in.', error?.status) };
  // Record which privacy policy version the user accepted (server sets the timestamp).
  await client.from('profiles').update({ privacy_policy_version: PRIVACY_POLICY_VERSION }).eq('id', data.user.id).is('privacy_policy_version', null);
  return { ok: true, userId: data.user.id, email: data.user.email ?? e };
}

export function friendlyAuthError(message: string, status?: number): string {
  if (status === 429 || /rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/expired|invalid|otp/i.test(message)) return 'That code is not valid or has expired. Request a new one.';
  if (NETWORK.test(message)) return 'You appear to be offline. Check your connection and try again.';
  if (/signups? not allowed/i.test(message)) return 'New accounts are not open right now.';
  return 'Something went wrong signing in. Please try again.';
}

export async function exportAccountData(client: SupabaseClient): Promise<unknown> {
  const { data, error } = await client.rpc('export_my_data');
  if (error) throw toSyncError(error);
  return data;
}

/** Permanently deletes the account and every row it owns. Signs out locally afterwards. */
export async function deleteAccount(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('delete_my_account');
  if (error) throw toSyncError(error);
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
}

// ---------- reflections ----------

export interface Reflection { id: string; body: string; usefulness: number | null; created_at: string; updated_at: string }
export const REFLECTION_MAX = 2000;

export async function listReflections(client: SupabaseClient, limit = 50): Promise<Reflection[]> {
  const { data, error } = await client.from('reflections').select('id, body, usefulness, created_at, updated_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw toSyncError(error);
  return data as Reflection[];
}

export async function addReflection(client: SupabaseClient, body: string, usefulness: number | null): Promise<Reflection> {
  const text = body.trim();
  if (!text || [...text].length > REFLECTION_MAX) throw new SyncError(`A reflection needs 1 to ${REFLECTION_MAX} characters.`, 'server');
  if (usefulness != null && !(Number.isInteger(usefulness) && usefulness >= 1 && usefulness <= 5)) throw new SyncError('Rating must be 1 to 5.', 'server');
  const { data, error } = await client.from('reflections').insert({ body: text, usefulness }).select('id, body, usefulness, created_at, updated_at').single();
  if (error) throw toSyncError(error);
  return data as Reflection;
}

export async function deleteReflection(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('reflections').delete().eq('id', id);
  if (error) throw toSyncError(error);
}

// ---------- pilot interest (public, no account needed) ----------

export type PilotRole = 'self' | 'parent' | 'clinician' | 'researcher' | 'other';
export async function submitPilotInterest(client: SupabaseClient, f: { email: string; role: PilotRole; ageConfirmed: boolean; contactConsent: boolean; note?: string }): Promise<void> {
  const { error } = await client.rpc('submit_pilot_interest', {
    p_email: f.email, p_role: f.role, p_age_confirmed: f.ageConfirmed, p_contact_consent: f.contactConsent, p_note: f.note ?? null,
  });
  if (error) throw toSyncError(error);
}
