// Loads the built extension (dist/) in Chromium with a fake camera, completes onboarding with stub clips,
// starts desk mode via a service-worker message, and checks the offscreen document, fps and badge.
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
let context: BrowserContext;
let sw: Worker;
let extId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tf-e2e-')), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    headless: !process.env.HEADED,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extId = new URL(sw.url()).host;
});

test.afterAll(async () => { await context?.close(); });

test('install opens onboarding, desk mode runs in the offscreen document', async () => {
  // onInstalled opens the app page on the welcome route.
  const page = context.pages().find((p) => p.url().includes(extId)) ?? (await context.waitForEvent('page'));
  await page.waitForURL(/src\/app\/index\.html/);
  await expect(page.getByRole('button', { name: 'Let’s start' })).toBeVisible();

  // Welcome → consent → safety via the UI.
  await page.getByRole('button', { name: 'Let’s start' }).click();
  await page.getByLabel("I'm 18 or older.").check();
  await page.getByLabel('I understand this is a self-help tool, not treatment.').check();
  await page.getByLabel('I understand video never leaves my device.').check();
  await page.getByRole('button', { name: 'I agree, continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your voice library' })).toBeVisible();

  // Stub clips (a 0.5 s tone as WAV) + finish onboarding, written straight into IndexedDB.
  await page.evaluate(async () => {
    const sr = 22050, n = sr / 2;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 20000), true);
    const blob = new Blob([buf], { type: 'audio/wav' });
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('trichfree'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction(['clips', 'settings'], 'readwrite');
    for (const category of ['notice', 'instead', 'reason']) {
      tx.objectStore('clips').put({ id: `stub-${category}`, category, blob, mimeType: 'audio/wav', durationMs: 500, createdAt: Date.now(), playCount: 0 });
    }
    tx.objectStore('settings').put({ key: 'onboarded', value: true });
    tx.objectStore('settings').put({ key: 'onboardingStep', value: 'done' });
    await new Promise((res) => (tx.oncomplete = res));
    // Grant the camera to the extension origin from this visible page, as onboarding does.
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
  });

  // Start desk mode through a service-worker message.
  await page.evaluate(() => chrome.runtime.sendMessage({ target: 'sw', type: 'DESK_START' }));

  await expect.poll(async () => sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] })).length), { timeout: 15_000 }).toBe(1);

  // STATUS messages report ≥ 5 fps (models load first, so allow time).
  await expect.poll(async () => page.evaluate(async () => ((await chrome.storage.local.get('deskState')).deskState as { fps: number }).fps), { timeout: 120_000, intervals: [2000] }).toBeGreaterThanOrEqual(5);

  const desk = await page.evaluate(async () => (await chrome.storage.local.get('deskState')).deskState as { status: string; delegate?: string; fps: number });
  console.log('desk state:', JSON.stringify(desk));
  expect(['watching', 'slow']).toContain(desk.status);
  expect(await sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('•');

  // Stopping closes the offscreen document and clears the badge.
  await page.evaluate(() => chrome.runtime.sendMessage({ target: 'sw', type: 'DESK_STOP' }));
  await expect.poll(async () => sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] })).length), { timeout: 10_000 }).toBe(0);
  expect(await sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');

  // A session record was written.
  const sessions = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('trichfree'); r.onsuccess = () => res(r.result); });
    return new Promise<number>((res) => { const r = db.transaction('sessions').objectStore('sessions').count(); r.onsuccess = () => res(r.result); });
  });
  expect(sessions).toBeGreaterThanOrEqual(1);
});
