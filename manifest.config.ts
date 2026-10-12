import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import pkg from './package.json';

// Everything network-related is opt-in at build time (see .env.example):
//  · VITE_SUPABASE_URL: accounts, cross-device sync and the optional pilot uploads. Added to host_permissions and
//    the CSP connect-src only when set.
//  · VITE_SITE_URL: the public website. Allowed to message the extension (status / sync nudge / stop only).
//  · VITE_DEV_BRIDGE=true: also allow http://localhost / 127.0.0.1 to message the extension (dev and tests only).
//  · EXTENSION_PUBLIC_KEY: pins the extension ID for unpacked pilot builds. Never set it for Chrome Web Store
//    uploads (the store assigns its own key).
// The values come from the same sources as the app's import.meta.env (.env, .env.[mode], .env.local, …, with the
// real environment taking priority), so the manifest's CSP and permissions always match the code making requests.
// (Reading process.env alone missed .env files: the app then called Supabase while the CSP blocked it.)
export default defineManifest(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'EXTENSION_']);
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const siteUrl = env.VITE_SITE_URL?.replace(/\/$/, '');
  const devBridge = env.VITE_DEV_BRIDGE === 'true';
  const connectSrc = ["'self'", supabaseUrl].filter(Boolean).join(' ');
  const bridgeMatches = [
    ...(siteUrl ? [`${new URL(siteUrl).origin}/*`] : []),
    ...(devBridge ? ['http://localhost/*', 'http://127.0.0.1/*'] : []),
  ];
  return {
    manifest_version: 3,
    name: 'TrichFree',
    description: 'A private, on-device companion that notices possible hand-to-hair movements and gives you a gentle reminder you choose.',
    version: pkg.version,
    minimum_chrome_version: '120',
    ...(env.EXTENSION_PUBLIC_KEY ? { key: env.EXTENSION_PUBLIC_KEY } : {}),
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    permissions: ['offscreen', 'storage', 'unlimitedStorage', 'notifications', 'alarms', 'idle'],
    ...(supabaseUrl ? { host_permissions: [`${supabaseUrl}/*`] } : {}),
    ...(bridgeMatches.length ? { externally_connectable: { matches: bridgeMatches } } : {}),
    background: { service_worker: 'src/background/sw.ts', type: 'module' },
    action: { default_popup: 'src/popup/index.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
    // Chrome only accepts Ctrl+Shift+0-9 as suggested keys for *global* commands and silently assigns nothing
    // otherwise, so these are Chrome-wide suggestions; users can make them global in chrome://extensions/shortcuts.
    commands: {
      'not-a-pull': { suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' }, description: 'Not a pull' },
      'i-just-pulled': { suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' }, description: 'I just pulled' },
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
  };
});
