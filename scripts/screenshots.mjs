// Captures UI screenshots of the built extension into store/screenshots/ (a throwaway profile with demo data).
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
const OUT = process.argv[2] ?? 'store/screenshots';
mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tf-shots-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, colorScheme: process.env.DARK ? 'dark' : 'light',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const page = ctx.pages().find((p) => p.url().includes(id)) ?? (await ctx.waitForEvent('page'));
await page.waitForLoadState();
const url = (h) => `chrome-extension://${id}/src/app/index.html#/${h}`;
const shot = async (name, p = page) => { await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log('shot', name); };

await shot('01-welcome');
await page.getByRole('button', { name: 'Let’s start' }).click();
await page.getByLabel("I'm 18 or older.").check();
await page.getByLabel('Participant code').fill('TF-AB12');
await shot('02-consent');
await page.getByLabel("I'm 18 or older.").check();
await page.getByLabel('I understand this is a self-help tool, not treatment.').check();
await page.getByLabel('I understand video never leaves my device.').check();
await page.getByLabel('I agree to share this pilot data.').check();
await shot('02b-consent-ticked');
await page.getByRole('button', { name: 'I agree, continue' }).click();
await shot('03-safety');
await page.getByRole('button', { name: 'Continue' }).click();
await shot('04-record');

// Seed demo data (clips, a week of sessions/episodes) and mark onboarding done.
await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('trichfree'); r.onsuccess = () => res(r.result); });
  const tx = db.transaction(['clips', 'settings', 'sessions', 'episodes', 'events'], 'readwrite');
  const wav = new Blob([new Uint8Array(44)], { type: 'audio/wav' });
  for (const c of ['notice', 'need', 'instead', 'reason', 'compassion']) tx.objectStore('clips').put({ id: `c-${c}`, category: c, blob: wav, mimeType: 'audio/wav', durationMs: 2400, createdAt: Date.now(), playCount: 0 });
  const sq = {}; for (let d = 0; d < 7; d++) { const t = new Date(Date.now() - d * 86400000); sq[`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`] = d === 0 ? 18 : 35; }
  for (const [k, v] of Object.entries({ onboarded: true, onboardingStep: 'done', zones: ['crown', 'hairline', 'strands'], debug: true, squeezes: sq, lastLevelSeen: 9, personalModel: { w: [], b: 0, mean: [], std: [], nPos: 27, nNeg: 40, accuracy: 0.7, active: false, trainedAt: Date.now(), ms: 40 } })) tx.objectStore('settings').put({ key: k, value: v });
  const day = 86400000;
  let n = 0;
  for (let d = 6; d >= 0; d--) {
    const t = Date.now() - d * day - 3 * 3600000;
    tx.objectStore('sessions').put({ id: `s${d}`, startedAt: t, endedAt: t + 7200000, deskMinutes: 60 + ((d * 37) % 90), fpsAvg: 14, outputMode: 'speakers' });
    for (let k = 0; k < 2 + ((d * 5) % 4); k++) {
      const s = t + k * 900000;
      tx.objectStore('episodes').put({ id: `e${n++}`, sessionId: `s${d}`, startedAt: s, alertAt: s + 1500, endedAt: s + 5000, zone: 'crown', arm: 'VOICE', clipIds: ['c-notice'], outcome: k % 3 ? 'interrupted' : 'not_interrupted', secondsToHandDown: 2 + k, pinchFraction: 0.4, rMedian: 0.6, pSmoothMax: 0.9 });
    }
  }
  tx.objectStore('events').put({ id: 'ev1', type: 'manual_pull', t: Date.now() - 3600000 });
  await new Promise((r) => (tx.oncomplete = r));
});
await page.goto(url('calibrate')); await page.reload();
await page.waitForTimeout(6000);
await shot('05-calibrate-camera');
await page.goto(url('home')); await page.reload();
await page.evaluate(() => chrome.runtime.sendMessage({ target: 'sw', type: 'DESK_START' }));
await page.waitForTimeout(6000);
await shot('06-recap');
await page.getByRole('button', { name: 'Mood 4 of 5' }).click().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/06-focus-room.png` }); console.log('shot 06-focus-room');
await page.getByRole('button', { name: 'Dashboard' }).click().catch(() => {});
await page.waitForTimeout(400);
await shot('06-home');
// Animations: 10 squeezes → "Yeahh!" jump with stars.
const mochi = page.getByRole('img', { name: /Press to squeeze/ }).first();
for (let i = 0; i < 10; i++) { await mochi.click(); await page.waitForTimeout(40); }
await page.waitForTimeout(330);
await page.screenshot({ path: `${OUT}/11-anim-cheer.png` }); console.log('shot 11-anim-cheer');
// End and restart a session → focus room + Line Rider scooter ride.
await page.getByRole('button', { name: 'End session' }).first().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Start a desk session' }).click();
await page.waitForTimeout(1300);
await page.screenshot({ path: `${OUT}/12-anim-ride.png` }); console.log('shot 12-anim-ride');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/13-anim-ride2.png` }); console.log('shot 13-anim-ride2');
await page.getByRole('button', { name: 'Dashboard' }).click().catch(() => {});
await page.goto(url('progress')); await page.reload();
await shot('07-progress');
await page.goto(url('settings')); await page.reload();
await shot('08-settings');
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 320, height: 460 });
await popup.goto(`chrome-extension://${id}/src/popup/index.html`);
await shot('09-popup', popup);
await page.goto(url('record')); await page.reload();
await shot('10-record-done');
await ctx.close();
