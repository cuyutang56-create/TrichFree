// Account + preference sync, owned by the service worker. It is the only context that holds the Supabase
// session (refresh tokens live in chrome.storage.local, which web pages cannot read), so two contexts can never
// race to refresh the same token. Pages talk to it with ACCOUNT_* / SYNC_NOW messages and read the public,
// token-free status from `accountState`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS_CONFIGURED, SUPABASE_KEY, SUPABASE_URL } from '../shared/config';
import { clearSyncLink, deviceId, getSyncMeta } from '../shared/db';
import { INITIAL_ACCOUNT, readAccount, type AccountReply, type AccountState } from '../shared/messages';
import { dexieStore } from '../shared/syncStore';
import { syncPreferences, type SyncOutcome } from '../sync/engine';
import { deleteAccount, exportAccountData, sendSignInCode, supabaseRemote, verifySignInCode } from '../sync/remote';

const AUTH_STORAGE_KEY = 'tf-auth';
export const SYNC_ALARM = 'sync';
export const SYNC_EVERY_MIN = 15;

const storage = {
  getItem: async (k: string) => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: async (k: string, v: string) => { await chrome.storage.local.set({ [k]: v }); },
  removeItem: async (k: string) => { await chrome.storage.local.remove(k); },
};

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (!ACCOUNTS_CONFIGURED) return null;
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    // Service workers sleep, so no background refresh timer: getSession() refreshes on demand before each call.
    auth: { storage, storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

// One account operation at a time (sign-in, sync, sign-out, delete).
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

let patchChain: Promise<unknown> = Promise.resolve();
function patchAccount(p: Partial<AccountState>): Promise<AccountState> {
  const run = patchChain.then(async () => {
    const next = { ...(await readAccount()), ...p, configured: ACCOUNTS_CONFIGURED };
    await chrome.storage.local.set({ accountState: next });
    return next;
  });
  patchChain = run.catch(() => {});
  return run;
}

async function pendingKeys(): Promise<string[]> {
  return Object.keys((await getSyncMeta()).dirty);
}

/** Called on every service-worker start: make the status reflect the stored session (no network needed). */
export async function initAccount(): Promise<void> {
  const c = sb();
  if (!c) { await patchAccount({ ...INITIAL_ACCOUNT, pending: await pendingKeys() }); return; }
  const raw = await storage.getItem(AUTH_STORAGE_KEY);
  if (!raw) { await patchAccount({ signedIn: false, email: undefined, userId: undefined, pending: await pendingKeys() }); return; }
  try {
    const user = (JSON.parse(raw) as { user?: { id: string; email?: string } }).user;
    await patchAccount({ signedIn: !!user, email: user?.email, userId: user?.id, pending: await pendingKeys() });
  } catch {
    await patchAccount({ signedIn: false });
  }
}

export function sendCode(email: string): Promise<AccountReply> {
  const c = sb();
  if (!c) return Promise.resolve({ ok: false, message: 'Accounts are not available in this build.' });
  return serial(async () => {
    const r = await sendSignInCode(c, email);
    return r.ok ? { ok: true } : r;
  });
}

export function verifyCode(email: string, code: string, onPrefsChanged: () => Promise<void>): Promise<AccountReply> {
  const c = sb();
  if (!c) return Promise.resolve({ ok: false, message: 'Accounts are not available in this build.' });
  return serial(async () => {
    const r = await verifySignInCode(c, email, code);
    if (!r.ok) return r;
    await patchAccount({ signedIn: true, email: r.email, userId: r.userId, sync: 'syncing', message: undefined, notice: undefined });
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_EVERY_MIN });
    await runSync(c, onPrefsChanged);
    return { ok: true };
  });
}

export function syncNow(onPrefsChanged: () => Promise<void>): Promise<AccountReply> {
  const c = sb();
  if (!c) return Promise.resolve({ ok: false, message: 'Accounts are not available in this build.' });
  return serial(async () => {
    const out = await runSync(c, onPrefsChanged);
    return out?.kind === 'ok' || out == null ? { ok: true } : { ok: false, message: out.message };
  });
}

/** Opening a TrichFree page shows current settings without waiting for the 15-minute sync. */
export const STALE_AFTER_MS = 15_000;
let lastNudgeAt = 0; // focus and visibility events often arrive together: one sync is enough
export async function syncIfStale(onPrefsChanged: () => Promise<void>, now = Date.now()): Promise<AccountReply> {
  const a = await readAccount();
  if (!a.signedIn || now - Math.max(lastNudgeAt, a.lastSyncAt ?? 0) < STALE_AFTER_MS) return { ok: true };
  lastNudgeAt = now;
  return syncNow(onPrefsChanged);
}

export function signOut(): Promise<AccountReply> {
  const c = sb();
  if (!c) return Promise.resolve({ ok: true });
  return serial(async () => {
    await c.auth.signOut({ scope: 'local' }).catch(() => {});
    await storage.removeItem(AUTH_STORAGE_KEY); // gone locally even if the server could not be reached
    await clearSyncLink();
    await chrome.alarms.clear(SYNC_ALARM);
    await patchAccount({ signedIn: false, email: undefined, userId: undefined, sync: 'idle', lastSyncAt: undefined, message: undefined, notice: undefined, pending: await pendingKeys() });
    return { ok: true };
  });
}

export function deleteMyAccount(): Promise<AccountReply> {
  const c = sb();
  if (!c) return Promise.resolve({ ok: false, message: 'Accounts are not available in this build.' });
  return serial(async () => {
    const { data } = await c.auth.getSession();
    if (!data.session) return { ok: false, message: 'Please sign in again to delete your account.' };
    try {
      await deleteAccount(c);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    await storage.removeItem(AUTH_STORAGE_KEY);
    await clearSyncLink();
    await chrome.alarms.clear(SYNC_ALARM);
    await patchAccount({ signedIn: false, email: undefined, userId: undefined, sync: 'idle', lastSyncAt: undefined, message: undefined, notice: undefined, pending: await pendingKeys() });
    return { ok: true };
  });
}

export function exportMine(): Promise<AccountReply> {
  const c = sb();
  if (!c) return Promise.resolve({ ok: false, message: 'Accounts are not available in this build.' });
  return serial(async () => {
    try {
      const { data } = await c.auth.getSession();
      if (!data.session) return { ok: false, message: 'Please sign in again.' };
      return { ok: true, data: await exportAccountData(c) };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function dismissNotice() {
  await patchAccount({ notice: undefined });
}

/** True when there is a session worth syncing (cheap: storage only). */
export async function hasSession(): Promise<boolean> {
  return !!sb() && !!(await storage.getItem(AUTH_STORAGE_KEY));
}

async function runSync(c: SupabaseClient, onPrefsChanged: () => Promise<void>): Promise<SyncOutcome | null> {
  const { data, error } = await c.auth.getSession(); // refreshes an expired access token
  if (!data.session) {
    const offline = !!error && /fetch|network|retry/i.test(`${error.name} ${error.message}`);
    await patchAccount(offline
      ? { sync: 'offline', message: 'You appear to be offline. Changes are saved on this device and will sync later.', pending: await pendingKeys() }
      : { signedIn: false, sync: 'auth', message: 'Your session ended. Please sign in again to keep syncing.', pending: await pendingKeys() });
    return null;
  }
  await patchAccount({ sync: 'syncing' });
  const out = await syncPreferences(dexieStore(), supabaseRemote(c), data.session.user.id, `extension:${await deviceId()}`);
  if (out.kind === 'ok') {
    const notice = out.conflicts.length ? { kind: 'conflict' as const, keys: out.conflicts, at: Date.now() }
      : out.adoptedAccount && out.fromRemote.length ? { kind: 'adopted' as const, keys: out.fromRemote, at: Date.now() }
      : out.fromRemote.length ? { kind: 'remote' as const, keys: out.fromRemote, at: Date.now() }
      : undefined;
    await patchAccount({ sync: 'ok', lastSyncAt: Date.now(), message: undefined, pending: await pendingKeys(), ...(notice ? { notice } : {}) });
    if (out.fromRemote.length || out.conflicts.length || out.adoptedAccount) await onPrefsChanged();
  } else if (out.kind === 'auth') {
    await patchAccount({ sync: 'auth', message: out.message, pending: await pendingKeys() });
  } else {
    await patchAccount({ sync: out.kind === 'offline' ? 'offline' : 'error', message: out.message, pending: await pendingKeys() });
  }
  return out;
}
