// Shared helpers for the browser tests. Each launch is an independent Chromium profile (its own user-data-dir),
// so two launches behave like two different computers: separate IndexedDB, extension storage and sessions.
import { chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const DIST = resolve(process.env.E2E_DIST ?? 'dist');

export interface Ext { context: BrowserContext; sw: Worker; extId: string; userDataDir: string; url: (hash?: string) => string }

/** Launch Chromium with the built extension. `camera`: fake device + auto-accept (default), denied, or no device. */
export async function launch(opts: { userDataDir?: string; camera?: 'fake' | 'denied' | 'none' } = {}): Promise<Ext> {
  const userDataDir = opts.userDataDir ?? mkdtempSync(join(tmpdir(), 'tf-e2e-'));
  const camera = opts.camera ?? 'fake';
  const args = [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--autoplay-policy=no-user-gesture-required',
    ...(camera === 'fake' ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []),
    ...(camera === 'denied' ? ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] : []),
    ...(camera === 'none' ? ['--use-fake-ui-for-media-stream'] : []),
  ];
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    headless: !process.env.HEADED,
    args,
    viewport: { width: 1200, height: 900 },
    acceptDownloads: true,
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;
  return { context, sw, extId, userDataDir, url: (hash = '') => `chrome-extension://${extId}/src/app/index.html${hash}` };
}

/** The page the extension opens on install (onboarding). */
export async function firstPage(ext: Ext): Promise<Page> {
  const page = ext.context.pages().find((p) => p.url().includes(ext.extId)) ?? (await ext.context.waitForEvent('page'));
  await page.waitForURL(/src\/app\/index\.html/);
  return page;
}

/** Steps 1 and 2 of onboarding, finishing without starting monitoring. */
export async function onboard(page: Page, finish: 'start' | 'finish' = 'finish') {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: finish === 'start' ? 'Start monitoring' : 'Finish without starting' }).click();
  await page.waitForURL(/#\/home/);
}

export const offscreenCount = (ext: Ext) =>
  ext.sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] })).length);

export const deskState = (ext: Ext) =>
  ext.sw.evaluate(async () => (await chrome.storage.local.get('deskState')).deskState as { wanted: boolean; status: string; fps: number; delegate?: string; stopReason?: string; interrupted?: boolean });

export const badge = (ext: Ext) => ext.sw.evaluate(() => chrome.action.getBadgeText({}));
