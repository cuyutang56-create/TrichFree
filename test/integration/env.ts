// Connection details and helpers for the local Supabase stack (`npx supabase start`).
// Values come from `supabase status -o env` (the CLI's fixed local demo keys) unless set in the environment.
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function fromCli(): Record<string, string> {
  try {
    const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return Object.fromEntries(out.split('\n').filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }));
  } catch {
    return {};
  }
}

let cached: { url: string; anonKey: string; serviceKey: string; mailpit: string } | null = null;
export function localEnv() {
  if (cached) return cached;
  const cli = process.env.SUPABASE_URL ? {} : fromCli();
  const url = process.env.SUPABASE_URL ?? cli.API_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? cli.ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? cli.SERVICE_ROLE_KEY;
  const mailpit = process.env.MAILPIT_URL ?? cli.MAILPIT_URL ?? cli.INBUCKET_URL;
  if (!url || !anonKey || !serviceKey || !mailpit) {
    throw new Error('Local Supabase is not running. Start it with `npx supabase start` (needs Docker), then re-run.');
  }
  cached = { url, anonKey, serviceKey, mailpit };
  return cached;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export const anonClient = (): SupabaseClient => createClient(localEnv().url, localEnv().anonKey, opts);
export const adminClient = (): SupabaseClient => createClient(localEnv().url, localEnv().serviceKey, opts);

export const uniqueEmail = (tag: string) => `${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.test`;

/** Waits for the newest email to `email` sent after `since` and returns the 6-digit code in it. */
export async function readCode(email: string, since: number, timeoutMs = 10_000): Promise<string> {
  const { mailpit } = localEnv();
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string; Created: string; Snippet: string }[] };
    const msg = (body.messages ?? []).find((m) => Date.parse(m.Created) >= since - 1000);
    const code = msg?.Snippet.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

/** Signs a fresh client in with a real one-time code, exactly as the apps do. */
export async function signIn(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = anonClient();
  const since = Date.now();
  const sent = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (sent.error) throw sent.error;
  const token = await readCode(email, since);
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, userId: data.user.id };
}
