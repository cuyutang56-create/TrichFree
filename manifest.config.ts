import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

// Everything network-related is opt-in at build time (see .env.example):
//  · VITE_SUPABASE_URL: accounts, cross-device sync and the optional pilot uploads. Added to host_permissions and
//    the CSP connect-src only when set.
//  · VITE_SITE_URL: the public website. Allowed to message the extension (status / sync nudge / stop only).
//  · VITE_DEV_BRIDGE=true: also allow http://localhost / 127.0.0.1 to message the extension (dev and tests only).
//  · EXTENSION_PUBLIC_KEY: pins the extension ID for unpacked pilot builds. Never set it for Chrome Web Store
//    uploads (the store assigns its own key).
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const siteUrl = process.env.VITE_SITE_URL?.replace(/\/$/, '');
const devBridge = process.env.VITE_DEV_BRIDGE === 'true';
const connectSrc = ["'self'", supabaseUrl].filter(Boolean).join(' ');
const bridgeMatches = [
  ...(siteUrl ? [`${new URL(siteUrl).origin}/*`] : []),
  ...(devBridge ? ['http://localhost/*', 'http://127.0.0.1/*'] : []),
];

export default defineManifest({
  manifest_version: 3,
  name: 'TrichFree',
  description: 'A private, on-device companion that notices possible hand-to-hair movements and gives you a gentle reminder you choose.',
  version: pkg.version,
  minimum_chrome_version: '120',
  ...(process.env.EXTENSION_PUBLIC_KEY ? { key: process.env.EXTENSION_PUBLIC_KEY } : {}),
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  permissions: ['offscreen', 'storage', 'unlimitedStorage', 'notifications', 'alarms', 'idle'],
  ...(supabaseUrl ? { host_permissions: [`${supabaseUrl}/*`] } : {}),
  ...(bridgeMatches.length ? { externally_connectable: { matches: bridgeMatches } } : {}),
  background: { service_worker: 'src/background/sw.ts', type: 'module' },
  action: { default_popup: 'src/popup/index.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
  commands: {
    'not-a-pull': { suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' }, description: 'Not a pull', global: true },
    'i-just-pulled': { suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' }, description: 'I just pulled', global: true },
    'toggle-desk': { suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' }, description: 'Start/stop monitoring' },
  } as any,
  content_security_policy: {
    extension_pages: [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "object-src 'none'",
      `connect-src ${connectSrc}`,
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "worker-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
});
