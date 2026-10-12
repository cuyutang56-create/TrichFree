// Build-time configuration. Only public values belong here: the Supabase URL and its publishable (anon) key
// are designed to be shipped to browsers; access control is enforced by row-level security on the server.
// Server-only secrets (service-role key, SMTP password) must never be given a VITE_ prefix.
import { version } from '../../package.json';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const trimSlash = (s?: string) => (s ? s.replace(/\/+$/, '') : undefined);

export const SUPABASE_URL = trimSlash(env.VITE_SUPABASE_URL) || undefined;
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || undefined;
/** True when this build can create accounts and sync. Without it the app runs in guest (this-device-only) mode. */
export const ACCOUNTS_CONFIGURED = !!(SUPABASE_URL && SUPABASE_KEY);

/** Public website, used for links from the extension (privacy policy, account page). */
export const WEBSITE_URL = trimSlash(env.VITE_SITE_URL) || undefined;

export const APP_VERSION: string = version;
