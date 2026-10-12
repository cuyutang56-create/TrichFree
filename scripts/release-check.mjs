// Checks a built extension manifest before it is zipped for release. A build made with local test settings
// (the E2E env, or VITE_DEV_BRIDGE=true left in a .env) would otherwise ship pointing at localhost, or let any
// local web page command the extension. Pure, so it is unit-tested (test/release-check.test.ts).
const LOCAL = /(^|[/.:])(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([:/]|$)/i;

/** @param {Record<string, any>} manifest @param {{ testKeyId?: string }} [opts] @returns {{ problems: string[], notes: string[] }} */
export function releaseProblems(manifest, opts = {}) {
  const problems = [];
  const notes = [];
  for (const m of manifest.externally_connectable?.matches ?? []) {
    if (LOCAL.test(m)) problems.push(`externally_connectable trusts a local origin (${m}): VITE_DEV_BRIDGE or a local VITE_SITE_URL is set`);
    else if (!m.startsWith('https://')) problems.push(`externally_connectable trusts a non-https origin (${m})`);
  }
  for (const h of manifest.host_permissions ?? []) {
    if (LOCAL.test(h)) problems.push(`host_permissions points at a local backend (${h}): VITE_SUPABASE_URL is a local test stack`);
    else if (!h.startsWith('https://')) problems.push(`host_permissions uses plain http (${h})`);
  }
  const csp = manifest.content_security_policy?.extension_pages ?? '';
  const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src')) ?? '';
  if (LOCAL.test(connect) || / http:/.test(connect)) problems.push(`CSP connect-src allows a local or plain-http origin (${connect})`);
  if (manifest.key) {
    if (opts.testKeyId && manifest.key === opts.testKeyId) problems.push('the manifest uses the automated-test key from e2e/fixtures: never release with it');
    else notes.push('pinned-ID build (manifest "key" set): for Load-unpacked pilot installs only; do not upload it to the Chrome Web Store');
  }
  return { problems, notes };
}
