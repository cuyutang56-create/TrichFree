// Builds the extension (dist-e2e/) and the website (dist-web-e2e/) against the LOCAL Supabase stack, for the
// account and cross-device browser tests. Needs `npx supabase start`. Never use this output for real users.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let status;
try {
  status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  console.error('[build-e2e] Local Supabase is not running. Start it with `npx supabase start` (needs Docker).');
  process.exit(1);
}
const env = Object.fromEntries(status.split('\n').filter((l) => l.includes('=')).map((l) => {
  const i = l.indexOf('=');
  return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
}));
const shared = {
  ...process.env,
  VITE_SUPABASE_URL: env.API_URL,
  VITE_SUPABASE_ANON_KEY: env.ANON_KEY,
  VITE_SITE_URL: 'http://127.0.0.1:5174',
  VITE_DEV_BRIDGE: 'true',
  // Pins the test extension's ID (public key only; e2e/fixtures) so the website build can talk to it.
  EXTENSION_PUBLIC_KEY: readFileSync('e2e/fixtures/extension-key.pub.b64', 'utf8').trim(),
  VITE_EXTENSION_IDS: readFileSync('e2e/fixtures/extension-id.txt', 'utf8').trim(),
  VITE_CONTACT_EMAIL: 'team@example.test',
  VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
};
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['extension', 'web'];
for (const t of targets) {
  const args = t === 'web'
    ? ['vite', 'build', '-c', 'vite.web.config.ts', '--outDir', resolve('dist-web-e2e'), '--emptyOutDir']
    : ['vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'];
  console.log(`[build-e2e] ${t}: ${args.join(' ')}`);
  const r = spawnSync('npx', args, { stdio: 'inherit', env: shared });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
