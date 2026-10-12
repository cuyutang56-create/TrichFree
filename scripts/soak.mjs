// Background soak (M1 spike, automated part): desk mode on, app tab closed, another page in front.
// Usage: node scripts/soak.mjs [minutes=10] [--video=file.mjpeg] [--headed]
import { chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const minutes = Number(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 10);
const video = process.argv.find((a) => a.startsWith('--video='))?.slice(8);
const DIST = resolve('dist');
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tf-soak-')), {
  channel: 'chromium', headless: !process.argv.includes('--headed'),
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    ...(video ? [`--use-file-for-fake-video-capture=${resolve(video)}`] : [])],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const app = ctx.pages().find((p) => p.url().includes('chrome-extension')) ?? (await ctx.waitForEvent('page'));
await app.waitForLoadState();
await app.evaluate(async () => { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); });
await app.evaluate(() => chrome.runtime.sendMessage({ target: 'sw', type: 'DESK_START' }));
// Put something else in front and close the app tab.
const other = await ctx.newPage();
await other.goto('about:blank');
await other.bringToFront();
await app.close();

const read = async () => {
  try { return (await sw.evaluate(() => chrome.storage.local.get('deskState'))).deskState; }
  catch { const w = ctx.serviceWorkers()[0]; return w ? (await w.evaluate(() => chrome.storage.local.get('deskState'))).deskState : null; }
};
const samples = [];
const end = Date.now() + minutes * 60_000;
while (Date.now() < end) {
  await new Promise((r) => setTimeout(r, 10_000));
  const d = await read();
  if (d) samples.push(d.fps);
  console.log(new Date().toISOString().slice(11, 19), d?.status, `${d?.fps?.toFixed(1)} fps`, d?.delegate, `hb ${d?.lastHeartbeat ? Math.round((Date.now() - d.lastHeartbeat) / 1000) : '?'}s ago`);
}
const min = Math.min(...samples), avg = samples.reduce((a, b) => a + b, 0) / samples.length;
console.log(`\nSOAK ${minutes} min: min ${min.toFixed(1)} fps, avg ${avg.toFixed(1)} fps → ${min >= 12 ? 'PASS' : 'FAIL'} (need ≥ 12)`);
await ctx.close();
