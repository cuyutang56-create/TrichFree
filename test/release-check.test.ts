// Release audit: a build made with local or test settings must not be packaged for release.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../manifest.config';
// @ts-expect-error plain .mjs helper without type declarations
import { releaseProblems } from '../scripts/release-check.mjs';

const testKey = readFileSync('e2e/fixtures/extension-key.pub.b64', 'utf8').trim();
const csp = (connect: string) => ({ extension_pages: `default-src 'self'; ${connect}; object-src 'none'` });
const FILE = '.env.releasechecktest';
afterEach(() => rmSync(FILE, { force: true }));
const prod = {
  host_permissions: ['https://abcd.supabase.co/*'],
  externally_connectable: { matches: ['https://trichfree.example/*'] },
  content_security_policy: csp("connect-src 'self' https://abcd.supabase.co"),
};

describe('release check', () => {
  it('accepts a production build and a guest build', () => {
    expect(releaseProblems(prod).problems).toEqual([]);
    expect(releaseProblems({ content_security_policy: csp("connect-src 'self'") }).problems).toEqual([]);
  });
  it('rejects the dev bridge (any localhost page could command the extension)', () => {
    const m = { ...prod, externally_connectable: { matches: ['https://trichfree.example/*', 'http://localhost/*', 'http://127.0.0.1/*'] } };
    expect(releaseProblems(m).problems.join(' ')).toMatch(/local origin/);
  });
  it('rejects a local or plain-http backend', () => {
    const m = { ...prod, host_permissions: ['http://127.0.0.1:54321/*'], content_security_policy: csp("connect-src 'self' http://127.0.0.1:54321") };
    const p = releaseProblems(m).problems.join(' ');
    expect(p).toMatch(/local backend/);
    expect(p).toMatch(/connect-src/);
  });
  it('rejects the automated-test key, and flags any other pinned key as pilot-only', () => {
    expect(releaseProblems({ ...prod, key: testKey }, { testKeyId: testKey }).problems.join(' ')).toMatch(/automated-test key/);
    const other = releaseProblems({ ...prod, key: 'MIIBIjAN-some-other-key' }, { testKeyId: testKey });
    expect(other.problems).toEqual([]);
    expect(other.notes.join(' ')).toMatch(/pilot installs only/);
  });
  it('the end-to-end build settings (local stack, dev bridge, test key) would be refused', async () => {
    // The manifest generated from the values scripts/build-e2e.mjs builds with (no build output needed).
    writeFileSync(FILE, `VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SITE_URL=http://127.0.0.1:5174\nVITE_DEV_BRIDGE=true\nEXTENSION_PUBLIC_KEY=${testKey}\n`);
    const e2e = await (manifest as unknown as (env: { mode: string; command: string }) => Promise<object> | object)({ mode: 'releasechecktest', command: 'build' });
    const problems = releaseProblems(e2e, { testKeyId: testKey }).problems.join(' | ');
    expect(problems).toMatch(/local origin/);
    expect(problems).toMatch(/local backend/);
    expect(problems).toMatch(/automated-test key/);
  });
});
