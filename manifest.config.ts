import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

// Supabase is optional: only whitelisted in host_permissions / CSP when configured at build time.
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const connectSrc = ["'self'", supabaseUrl].filter(Boolean).join(' ');

export default defineManifest({
  manifest_version: 3,
  name: 'TrichFree Desk',
  description: 'Hears you before you pull: on-device hand-to-hair awareness with your own voice.',
  version: pkg.version,
  minimum_chrome_version: '120',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  permissions: ['offscreen', 'storage', 'unlimitedStorage', 'notifications', 'alarms', 'idle'],
  ...(supabaseUrl ? { host_permissions: [`${supabaseUrl}/*`] } : {}),
  background: { service_worker: 'src/background/sw.ts', type: 'module' },
  action: { default_popup: 'src/popup/index.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
  commands: {
    'not-a-pull': { suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' }, description: 'Not a pull', global: true },
    'i-just-pulled': { suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' }, description: 'I just pulled', global: true },
    'toggle-desk': { suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' }, description: 'Start/stop desk mode' },
  } as any,
  content_security_policy: {
    extension_pages: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src ${connectSrc}`,
  },
});
