// The manifest's CSP, host permission and website bridge must come from the same environment as the app code
// (import.meta.env). Regression: it used to read process.env only, so a build configured with a .env file enabled
// accounts in the app while the CSP blocked every request to Supabase.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../manifest.config';

type Built = { host_permissions?: string[]; externally_connectable?: { matches: string[] }; content_security_policy: { extension_pages: string }; key?: string };
const build = async (mode: string) => (await (manifest as unknown as (env: { mode: string; command: string }) => Promise<Built> | Built)({ mode, command: 'build' }));
const FILE = '.env.manifesttest';

afterEach(() => rmSync(FILE, { force: true }));

describe('manifest environment', () => {
  it('a .env file configures the CSP, host permission and website bridge', async () => {
    writeFileSync(FILE, 'VITE_SUPABASE_URL=https://abcdefgh.supabase.co/\nVITE_SITE_URL=https://trichfree.example/\n');
    const m = await build('manifesttest');
    expect(m.host_permissions).toEqual(['https://abcdefgh.supabase.co/*']);
    expect(m.externally_connectable?.matches).toEqual(['https://trichfree.example/*']);
    expect(m.content_security_policy.extension_pages).toContain("connect-src 'self' https://abcdefgh.supabase.co;");
    expect(m.key).toBeUndefined();
  });
  // Skipped on a developer machine whose own .env configures a backend (it would apply to every mode).
  it.skipIf(existsSync('.env') || existsSync('.env.local'))('without configuration the build is guest-only: no host permission, no bridge, connect-src self', async () => {
    const m = await build('manifesttest-none');
    expect(m.host_permissions).toBeUndefined();
    expect(m.externally_connectable).toBeUndefined();
    expect(m.content_security_policy.extension_pages).toContain("connect-src 'self';");
  });
});
