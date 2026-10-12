// Captures the Chrome Web Store screenshots (1280×800) from a built extension into store/screenshots/.
// Real states only: a fresh throwaway profile, no seeded or made-up data. Uses the fake camera, so the camera
// preview shows a test pattern; capture on a real machine (HEADED=1) for a real camera image.
// Usage: npm run build && node scripts/screenshots.mjs [outDir]   (DARK=1 for dark mode, CHROMIUM_PATH to choose a browser)
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(process.env.E2E_DIST ?? 'dist');
const OUT = process.argv[2] ?? 'store/screenshots';
mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tf-shots-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: !process.env.HEADED, viewport: { width: 1280, height: 800 }, colorScheme: process.env.DARK ? 'dark' : 'light',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const page = ctx.pages().find((p) => p.url().includes(id)) ?? (await ctx.waitForEvent('page'));
await page.waitForLoadState();
const url = (h) => `chrome-extension://${id}/src/app/index.html#/${h}`;
const shot = async (name, p = page, fullPage = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage }); console.log('shot', `${OUT}/${name}.png`); };

// Onboarding: step 1 (welcome and privacy), step 2 (choose a reminder, test it).
await shot('01-welcome');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByText('Step 2 of 2').waitFor();
await shot('02-choose-reminder');
await page.getByRole('button', { name: 'Start monitoring' }).click();
await page.waitForURL(/#\/home/);

// Dashboard while watching (models need a moment to load).
await page.getByText(/^Watching/).first().waitFor({ timeout: 60_000 }).catch(() => {});
await shot('03-dashboard');

// Voice page, Settings.
await page.goto(url('voice'));
await shot('04-voice');
await page.goto(url('settings'));
await shot('05-settings');

// Toolbar popup, in a popup-sized tab.
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 380, height: 600 });
await popup.goto(`chrome-extension://${id}/src/popup/index.html`);
await shot('06-popup', popup);

await ctx.close();
