// Release audit: the camera and microphone must be off whenever the user leaves the feature that turned them on,
// including when they leave while the device is still starting (a permission prompt or a slow USB webcam).
// Each page's getUserMedia and track clones are recorded in the page; a configurable delay simulates a slow start.
// Monitoring itself runs in the offscreen document and is covered by extension.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { deskState, firstPage, launch, offscreenCount, onboard, setCameraPermission, type Ext } from './helpers';

/** Records every camera/mic track the page creates (including clones); optional extra delay before getUserMedia resolves. */
async function instrument(page: Page, delayMs = 0) {
  await page.evaluate((delay) => {
    const w = window as unknown as { __tracks?: MediaStreamTrack[]; __gumDelay: number };
    w.__gumDelay = delay;
    if (w.__tracks) return;
    w.__tracks = [];
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c?: MediaStreamConstraints) => {
      const s = await orig(c);
      w.__tracks!.push(...s.getTracks());
      if (w.__gumDelay) await new Promise((r) => setTimeout(r, w.__gumDelay));
      return s;
    };
    const clone = MediaStreamTrack.prototype.clone;
    MediaStreamTrack.prototype.clone = function (this: MediaStreamTrack) { const t = clone.call(this); w.__tracks!.push(t); return t; };
  }, delayMs);
}
const tracks = (page: Page) => page.evaluate(() => ((window as unknown as { __tracks?: MediaStreamTrack[] }).__tracks ?? []).map((t) => `${t.kind}:${t.readyState}`));
const live = async (page: Page) => (await tracks(page)).filter((t) => t.endsWith(':live'));
const go = (page: Page, hash: string) => page.evaluate((h) => { location.hash = h; }, hash);

let ext: Ext;
let page: Page;
test.beforeEach(async () => {
  ext = await launch();
  page = await firstPage(ext);
});
test.afterEach(async () => { await ext.context.close(); });

test('microphone: leaving the Voice page while the microphone is still starting leaves it off', async () => {
  await onboard(page);
  await go(page, '#/voice');
  await instrument(page, 1200);
  await page.getByRole('button', { name: /^Record:/ }).first().click();
  await page.waitForTimeout(150);
  await go(page, '#/home');
  await page.waitForTimeout(2500);
  expect(await tracks(page)).not.toHaveLength(0); // the microphone was opened…
  expect(await live(page)).toEqual([]); // …and is off again
});

test('microphone: leaving mid-recording turns it off', async () => {
  await onboard(page);
  await go(page, '#/voice');
  await instrument(page);
  await page.getByRole('button', { name: /^Record:/ }).first().click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await go(page, '#/insights');
  await expect.poll(() => live(page)).toEqual([]);
});

/** Onboard and start monitoring with the page already instrumented, so every camera stream it opens is seen. */
async function startMonitoringInstrumented(delayMs = 0) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await instrument(page, delayMs);
  await page.getByRole('button', { name: 'Start monitoring' }).click();
  await page.waitForURL(/#\/home/);
}

test('dashboard: no camera stream in the page while "Show what TrichFree sees" is closed', async () => {
  await startMonitoringInstrumented();
  await expect(page.getByTestId('desk-status')).toBeVisible();
  await page.waitForTimeout(2500);
  // (monitoring's own camera is in the offscreen document, not this page)
  expect(await live(page)).toEqual([]);
});

test('dashboard preview: closing it while the camera is still starting leaves the camera off', async () => {
  await startMonitoringInstrumented(1200);
  const summary = page.getByText('Show what TrichFree sees');
  await summary.click();
  await page.waitForTimeout(150);
  await summary.click();
  await page.waitForTimeout(2500);
  expect(await tracks(page)).not.toHaveLength(0);
  expect(await live(page)).toEqual([]);
});

test('dashboard preview: open, then close', async () => {
  await startMonitoringInstrumented();
  const summary = page.getByText('Show what TrichFree sees');
  await summary.click();
  await expect.poll(async () => (await live(page)).length).toBeGreaterThan(0);
  await summary.click();
  await expect.poll(() => live(page)).toEqual([]);
});

test('onboarding camera try: "Turn camera off" releases the camera, including the detector\'s copy', async () => {
  await page.getByRole('button', { name: 'Continue' }).click();
  await instrument(page);
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await expect.poll(async () => (await live(page)).length).toBeGreaterThan(1); // the preview track and the detector's clone
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect.poll(() => live(page), { timeout: 5000 }).toEqual([]);
});

test('tune-up: leaving the page releases the camera, including the detector\'s copy', async () => {
  await onboard(page);
  await instrument(page);
  await go(page, '#/tune');
  await expect.poll(async () => (await live(page)).length).toBeGreaterThan(1);
  await go(page, '#/home');
  await expect.poll(() => live(page), { timeout: 5000 }).toEqual([]);
});

test('camera permission revoked mid-session: says so at once (not "waiting for the camera" for minutes)', async () => {
  await ext.context.close();
  ext = await launch({ camera: 'real-permissions' });
  page = await firstPage(ext);
  await setCameraPermission(ext, page, 'granted');
  await onboard(page, 'start');
  await expect.poll(async () => (await deskState(ext)).status, { timeout: 20_000 }).toMatch(/watching|slow/);
  await setCameraPermission(ext, page, 'denied'); // the user removes TrichFree's camera access in the browser settings
  await expect.poll(async () => (await deskState(ext)).status, { timeout: 8000 }).toBe('error');
  await expect(page.getByTestId('desk-status')).not.toHaveText(/Waiting for the camera/);
  await expect(page.getByText(/needs permission to use the camera/).first()).toBeVisible();
  expect(await offscreenCount(ext)).toBeLessThanOrEqual(1); // the document may stay, but the camera is gone (permission denied)
});
