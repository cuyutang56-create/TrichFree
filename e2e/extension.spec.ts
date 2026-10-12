// The extension in a real Chromium with a fake camera: onboarding, monitoring controls, reminders, recovery,
// voice recordings, data export/deletion, browser restart and extension reload.
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { badge, deskState, firstPage, launch, offscreenCount, onboard } from './helpers';

// Frame rate depends on the machine (a CPU-only CI runner manages about 3 fps). Functional checks only need
// frames to flow; set E2E_MIN_FPS to also assert performance on real hardware.
const MIN_FPS = Number(process.env.E2E_MIN_FPS ?? 0.5);

test('first run: two-step onboarding, test reminder, then start / pause / resume / stop', async () => {
  const ext = await launch();
  try {
    const page = await firstPage(ext);
    // Step 1 of 2
    await expect(page.getByText('Step 1 of 2')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A little reminder, right when you need it.');
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 2 of 2: the default reminder is the chime; test it with one click.
    await expect(page.getByText('Step 2 of 2')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Gentle chime/ })).toBeChecked();
    await page.getByRole('button', { name: 'Test reminder' }).click();
    await expect(page.getByText('Played the chime.')).toBeVisible();
    await page.getByRole('button', { name: 'Start monitoring' }).click();
    // Two clicks from install to a running monitor.
    await page.waitForURL(/#\/home/);
    const status = page.getByTestId('desk-status');
    await expect(status).toHaveText(/Starting|Watching/);
    await expect.poll(() => offscreenCount(ext), { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await deskState(ext)).fps, { timeout: 120_000, intervals: [2000] }).toBeGreaterThanOrEqual(MIN_FPS);
    await expect(status).toHaveText(/Watching/, { timeout: 30_000 }); // "Watching" or "Watching (slowly)", never a false "problem"
    const desk = await deskState(ext);
    console.log('desk state:', JSON.stringify(desk));
    expect(['watching', 'slow']).toContain(desk.status);
    await expect(page.getByTestId('camera-status')).toHaveText('In use by TrichFree');
    expect(await badge(ext)).toBe('•');

    // Pause: camera off, badge shows pause.
    await page.getByRole('button', { name: 'Pause 15 min' }).click();
    await expect(status).toHaveText(/Paused until/);
    await expect.poll(() => offscreenCount(ext), { timeout: 10_000 }).toBe(0);
    expect(await badge(ext)).toBe('II');

    // Resume.
    await page.getByRole('button', { name: 'Resume now' }).click();
    await expect(status).toHaveText(/Starting|Watching/);
    await expect.poll(() => offscreenCount(ext), { timeout: 15_000 }).toBe(1);

    // Stop.
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(status).toHaveText('Monitoring is off');
    await expect.poll(() => offscreenCount(ext), { timeout: 10_000 }).toBe(0);
    expect(await badge(ext)).toBe('');

    // Sessions are logged locally.
    const sessions = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('trichfree'); r.onsuccess = () => res(r.result); });
      return new Promise<number>((res) => { const r = db.transaction('sessions').objectStore('sessions').count(); r.onsuccess = () => res(r.result); });
    });
    expect(sessions).toBeGreaterThanOrEqual(2);
  } finally {
    await ext.context.close();
  }
});

test('visual reminders: the test shows a quiet notification', async () => {
  const ext = await launch();
  try {
    const page = await firstPage(ext);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /Visual only/ }).check();
    await page.getByRole('button', { name: 'Test reminder' }).click();
    await expect(page.getByText(/A notification should appear/)).toBeVisible();
    await expect.poll(() => ext.sw.evaluate(async () => Object.keys(await chrome.notifications.getAll()).filter((k) => k.startsWith('test:')).length)).toBe(1);
  } finally {
    await ext.context.close();
  }
});

test('camera permission denied: a clear message, and the app stays usable', async () => {
  const ext = await launch({ camera: 'denied' });
  try {
    const page = await firstPage(ext);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start monitoring' }).click();
    await expect(page.getByRole('alert')).toContainText('camera is blocked');
    await page.getByRole('button', { name: 'Finish without starting' }).click();
    await page.waitForURL(/#\/home/);
    await expect(page.getByTestId('desk-status')).toHaveText('Monitoring is off');
    expect(await offscreenCount(ext)).toBe(0);
  } finally {
    await ext.context.close();
  }
});

test('no camera connected: says so instead of failing silently', async () => {
  const ext = await launch({ camera: 'none' });
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.getByRole('button', { name: 'Start monitoring' }).click();
    await expect(page.getByRole('status').filter({ hasText: /No camera was found|camera is in use/ })).toBeVisible();
    expect((await deskState(ext)).wanted).toBe(false);
  } finally {
    await ext.context.close();
  }
});

test('voice: record, preview, save, then delete (stays on this device)', async () => {
  const ext = await launch();
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.goto(ext.url('#/voice'));
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Notice' }) });
    await card.getByRole('button', { name: 'Record: Notice' }).click();
    await expect(card.getByText(/Recording…/)).toBeVisible();
    await page.waitForTimeout(2500); // the fake microphone plays a beep every second
    await card.getByRole('button', { name: 'Stop recording' }).click();
    await expect(card.getByText('Listen back. Keep it if it sounds right.')).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText('Saved', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Play: Notice' })).toBeVisible();
    // Used as the reminder.
    await page.goto(ext.url('#/home'));
    await page.getByRole('radio', { name: 'Your voice' }).check();
    await page.getByRole('button', { name: 'Test reminder' }).click();
    await expect(page.getByText('Played the chime and your voice.')).toBeVisible();
    // Delete.
    await page.goto(ext.url('#/voice'));
    await card.getByRole('button', { name: 'Delete: Notice' }).click();
    await expect(card.getByRole('button', { name: 'Record: Notice' })).toBeVisible();
    await page.goto(ext.url('#/home'));
    await expect(page.getByText(/no voice recording on this device yet/)).toBeVisible();
  } finally {
    await ext.context.close();
  }
});

test('data: export a backup, then delete everything on this computer', async () => {
  const ext = await launch();
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.goto(ext.url('#/settings'));
    await page.getByRole('radio', { name: /Visual only/ }).check();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup (.zip)' }).click()]);
    const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
    const data = JSON.parse(await zip.file('data.json')!.async('string'));
    expect(data.format).toBe('trichfree-backup');
    expect(data.data.settings.find((r: { key: string }) => r.key === 'intervention').value).toBe('visual');
    await page.getByRole('button', { name: /Delete all data on this computer/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('Step 1 of 2')).toBeVisible({ timeout: 10_000 });
  } finally {
    await ext.context.close();
  }
});

test('browser restart: monitoring never restarts the camera silently', async () => {
  const ext = await launch();
  const page = await firstPage(ext);
  await onboard(page, 'start');
  await expect.poll(() => offscreenCount(ext), { timeout: 15_000 }).toBe(1);
  await ext.context.close();
  const again = await launch({ userDataDir: ext.userDataDir });
  try {
    await expect.poll(async () => (await deskState(again)).stopReason, { timeout: 15_000 }).toBe('restart');
    expect((await deskState(again)).wanted).toBe(false);
    expect(await offscreenCount(again)).toBe(0);
    const p = await again.context.newPage();
    await p.goto(again.url('#/home'));
    await expect(p.getByText(/TrichFree restarted .* so monitoring stopped/)).toBeVisible();
  } finally {
    await again.context.close();
  }
});

// MV3 service workers are stopped by Chrome whenever they are idle. All state lives in storage, so monitoring
// must carry on and the controls must keep working when a brand-new worker instance handles the next message.
// (A literal chrome.runtime.reload() cannot be exercised here: under Playwright it unloads a --load-extension
// extension for good. The reload/update path shares recoverAfterRestart() with the browser-restart test.)
test('service worker restart mid-session: monitoring continues and controls still work', async () => {
  const ext = await launch();
  try {
    const page = await firstPage(ext);
    await onboard(page, 'start');
    await expect.poll(() => offscreenCount(ext), { timeout: 15_000 }).toBe(1);
    await ext.sw.evaluate(() => { (globalThis as unknown as { __marker?: number }).__marker = 1; });
    const before = (await deskState(ext)).lastHeartbeat ?? 0;
    const cdp = await ext.context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    // A fresh worker (no marker) picks up the offscreen document's next heartbeat.
    await expect.poll(async () => (await page.evaluate(async () => ((await chrome.storage.local.get('deskState')).deskState as { lastHeartbeat: number }).lastHeartbeat)) > before + 1500, { timeout: 15_000 }).toBe(true);
    const fresh = ext.context.serviceWorkers().find((w) => w.url().includes(ext.extId))!;
    expect(await fresh.evaluate(() => (globalThis as unknown as { __marker?: number }).__marker ?? null)).toBeNull();
    expect(await offscreenCount(ext)).toBe(1);
    await expect(page.getByTestId('desk-status')).toHaveText(/Starting|Watching/);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByTestId('desk-status')).toHaveText('Monitoring is off');
    await expect.poll(() => offscreenCount(ext), { timeout: 10_000 }).toBe(0);
  } finally {
    await ext.context.close();
  }
});
