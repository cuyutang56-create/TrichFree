// The website's Supabase client. Public URL + publishable key only; row-level security protects the data.
// Sessions live in this site's localStorage; the strict Content-Security-Policy (no third-party or inline
// scripts) is the main defence against token theft.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

export const accountsAvailable = !!(url && key);
export const supabase: SupabaseClient | null = accountsAvailable
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'trichfree-web-auth' } })
  : null;

/** Random id for this browser, shown to the extension as "changed on the web". */
export function webDeviceTag(): string {
  try {
    let id = localStorage.getItem('trichfree-device');
    if (!id) { id = crypto.randomUUID().replace(/-/g, '').slice(0, 12); localStorage.setItem('trichfree-device', id); }
    return `web:${id}`;
  } catch {
    return 'web:unknown';
  }
}
