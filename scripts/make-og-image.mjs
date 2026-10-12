// Renders the social preview image (1200×630) for the website: web/static/og-image.png, copied to the site root
// at build time and referenced by og:image / twitter:image when VITE_SITE_URL is set.
// Usage: node scripts/make-og-image.mjs   (uses Playwright's Chromium; CHROMIUM_PATH to use another build)
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const font = readFileSync(resolve('public/fonts/fredoka-latin.woff2')).toString('base64');
const mochi = readFileSync(resolve('web/src/assets/mochi.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Fredoka; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 300 700; }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { background: #fbf8f4; font-family: Fredoka, system-ui, sans-serif; color: #2a2640; display: flex; align-items: center;
         gap: 64px; padding: 0 88px; box-sizing: border-box; position: relative; overflow: hidden; }
  .glow { position: absolute; right: -120px; top: -140px; width: 640px; height: 640px; border-radius: 50%; background: #ece7f8; }
  .text { position: relative; flex: 1; }
  .brand { font-size: 34px; font-weight: 600; color: #56478f; margin-bottom: 28px; letter-spacing: 0.3px; }
  h1 { font-size: 64px; line-height: 1.08; margin: 0 0 28px; font-weight: 600; text-wrap: balance; }
  p { font-size: 28px; line-height: 1.35; margin: 0; color: #5f5a75; max-width: 640px; text-wrap: pretty; }
  .mochi { position: relative; width: 330px; height: 330px; flex: none; }
  .mochi svg { width: 100%; height: 100%; }
</style></head><body>
  <div class="glow"></div>
  <div class="text">
    <div class="brand">TrichFree</div>
    <h1>A little reminder, right when you need it.</h1>
    <p>Notices possible hand-to-hair movements on your own device and offers the gentle reminder you choose.</p>
  </div>
  <div class="mochi">${mochi}</div>
</body></html>`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
mkdirSync('web/static', { recursive: true });
await page.screenshot({ path: 'web/static/og-image.png', type: 'png' });
await browser.close();
console.log('[make-og-image] wrote web/static/og-image.png');
