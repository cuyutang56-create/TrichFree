// Release audit: a build made with local or test settings must not be packaged for release.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs helper without type declarations
import { releaseProblems } from '../scripts/release-check.mjs';

const testKey = readFileSync('e2e/fixtures/extension-key.pub.b64', 'utf8').trim();
const csp = (connect: string) => ({ extension_pages: `default-src 'self'; ${connect}; object-src 'none'` });
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
  it('the E2E build (local stack, dev bridge, test key) would be refused', () => {
    const e2e = JSON.parse(readFileSync('dist-e2e/manifest.json', 'utf8'));
    expect(releaseProblems(e2e, { testKeyId: testKey }).problems.length).toBeGreaterThanOrEqual(3);
  });
});
