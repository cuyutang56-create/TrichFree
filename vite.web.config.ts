// The public website: landing page, privacy policy, account web app (/app/) and the in-browser demo (/try/).
// Static output (dist-web/) for any static host with HTTPS. See DEPLOYMENT.md.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const root = resolve(__dirname, 'web');

/** Build-time extras: SEO tags from env, security headers, robots/sitemap, and only the MediaPipe files /try needs. */
function siteExtras(env: Record<string, string>): Plugin {
  const site = env.VITE_SITE_URL?.replace(/\/$/, '');
  const supabase = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  let outDir = '';
  return {
    name: 'trichfree-site-extras',
    configResolved(c) { outDir = c.build.outDir; },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Canonical + absolute social URLs only when the public URL is known (never a broken placeholder).
        const path = ctx.path.replace(/index\.html$/, '');
        const tags = site ? [
          `<link rel="canonical" href="${site}${path}">`,
          `<meta property="og:url" content="${site}${path}">`,
          `<meta property="og:image" content="${site}/og-image.png">`,
          `<meta name="twitter:image" content="${site}/og-image.png">`,
        ].join('\n    ') : '';
        return html.replace('<!--seo-->', tags);
      },
    },
    closeBundle() {
      if (!outDir || !existsSync(outDir)) return;
      // MediaPipe: /try uses only the ES-module WASM build (as the extension does). Drop the other variants.
      const wasm = resolve(outDir, 'mediapipe/wasm');
      if (existsSync(wasm)) for (const f of readdirSync(wasm)) if (!/^vision_wasm_module_internal\.(js|wasm)$/.test(f)) rmSync(resolve(wasm, f));
      // Security headers, in the _headers format that Netlify and Cloudflare Pages apply (see DEPLOYMENT.md).
      // `vite preview` serves the same headers, so the browser tests run under the real policy.
      const connect = ["'self'", supabase].filter(Boolean).join(' ');
      const csp = [
        "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", `connect-src ${connect}`, "img-src 'self' data: blob:",
        "media-src 'self' blob:", "worker-src 'self' blob:", "style-src 'self'", "font-src 'self'", "object-src 'none'",
        "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", 'upgrade-insecure-requests',
      ].join('; ');
      writeFileSync(resolve(outDir, '_headers'), [
        '/*',
        `  Content-Security-Policy: ${csp}`,
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()',
        '  Cross-Origin-Opener-Policy: same-origin',
        '  X-Frame-Options: DENY',
        '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '/mediapipe/*',
        '  Cache-Control: public, max-age=604800',
        '',
      ].join('\n'));
      writeFileSync(resolve(outDir, 'csp.txt'), `${csp}\n`); // for reviewers and hosts configured by hand
      writeFileSync(resolve(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /app/\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ''}`);
      if (site) {
        const urls = ['/', '/try/', '/privacy/'].map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n');
        writeFileSync(resolve(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      }
      // Website-only static files.
      const extra = resolve(root, 'static');
      if (existsSync(extra)) { mkdirSync(outDir, { recursive: true }); cpSync(extra, outDir, { recursive: true }); }
    },
  };
}

/**
 * The site-wide (/*) headers from a built _headers file, for `vite preview`. Plain-HTTP preview drops the two
 * HTTPS-only parts (HSTS is ignored over HTTP; upgrade-insecure-requests would break http://127.0.0.1).
 */
function previewHeaders(outDir: string): Record<string, string> {
  const file = resolve(outDir, '_headers');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  let section = '';
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith(' ')) { section = line.trim(); continue; }
    const i = line.indexOf(':');
    if (section === '/*' && i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  delete out['Strict-Transport-Security'];
  if (out['Content-Security-Policy']) out['Content-Security-Policy'] = out['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
  return out;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  const outDir = resolve(__dirname, process.env.WEB_OUT_DIR ?? 'dist-web');
  return {
    root,
    envDir: __dirname,
    // Fonts, icons and the bundled MediaPipe assets are shared with the extension.
    publicDir: resolve(__dirname, 'public'),
    plugins: [react(), siteExtras(env)],
    build: {
      // WEB_OUT_DIR=dist-web-e2e serves/builds the accounts test bundle (see scripts/build-e2e.mjs).
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: {
        input: {
          home: resolve(root, 'index.html'),
          privacy: resolve(root, 'privacy/index.html'),
          app: resolve(root, 'app/index.html'),
          try: resolve(root, 'try/index.html'),
          notFound: resolve(root, '404.html'),
        },
      },
    },
    worker: { format: 'es' },
    server: { port: 5174, strictPort: true, host: '127.0.0.1' },
    preview: { port: 5174, strictPort: true, host: '127.0.0.1', headers: previewHeaders(outDir) },
  };
});
