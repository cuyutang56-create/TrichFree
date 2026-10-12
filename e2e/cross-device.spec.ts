// Cross-device synchronisation with two independent Chromium profiles ("Laptop A" and "Laptop B"), each with
// its own extension install, IndexedDB and session, against the real local Supabase stack. Nothing is shared
// between the two browsers except the account and the database.
// Needs: `npx supabase start`, then `node scripts/build-e2e.mjs extension` (builds dist-e2e/).
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adminClient, mailIds, readCode, uniqueEmail } from '../test/integration/env';
const mail = { mailIds, readCode };
import { firstPage, launch, onboard, signInWithCode, type Ext } from './helpers';

const DIST_E2E = resolve('dist-e2e');
const ready = existsSync(`${DIST_E2E}/manifest.json`) && JSON.stringify(JSON.parse(readFileSync(`${DIST_E2E}/manifest.json`, 'utf8')).host_permissions ?? []).includes('127.0.0.1:54321');
test.skip(!ready, 'needs the accounts build: npx supabase start && node scripts/build-e2e.mjs extension');

async function prefsInDb(email: string) {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === email);
  if (!user) return null;
  return (await admin.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle()).data as Record<string, unknown> | null;
}

test('Laptop A saves → database → Laptop B retrieves and changes → Laptop A updates', async () => {
  const email = uniqueEmail('xdevice');
  let A: Ext | null = null, B: Ext | null = null;
  try {
    // 1. Laptop A: set up as a guest, then sign in.
    A = await launch({ dist: DIST_E2E });
    const pa = await firstPage(A);
    await onboard(pa);
    await expect(pa.getByTestId('account-chip')).toContainText('Guest');
    await pa.goto(A.url('#/settings?section=account'));
    await signInWithCode(pa, email, mail);
    await expect(pa.getByTestId('account-email')).toHaveText(email);
    await expect(pa.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });

    // 2–3. A changes a preference; it is persisted in the database.
    await pa.getByRole('radio', { name: /Visual only/ }).check();
    await expect.poll(async () => (await prefsInDb(email))?.intervention, { timeout: 15_000 }).toBe('visual');
    const afterA = await prefsInDb(email);
    expect(afterA?.updated_by).toMatch(/^extension:/);

    // 4–5. Laptop B (a separate profile) signs in during onboarding and gets A's settings.
    B = await launch({ dist: DIST_E2E });
    const pb = await firstPage(B);
    await pb.getByRole('button', { name: 'Sign in to bring your settings' }).click();
    await signInWithCode(pb, email, mail);
    await expect(pb.getByText(`Signed in as ${email}`)).toBeVisible({ timeout: 15_000 });
    await pb.getByRole('button', { name: 'Continue' }).click();
    await expect(pb.getByRole('radio', { name: /Visual only/ })).toBeChecked({ timeout: 15_000 });
    await pb.getByRole('button', { name: 'Finish without starting' }).click();
    await pb.waitForURL(/#\/home/);
    await expect(pb.getByText('Loaded your saved settings')).toBeVisible();

    // 6. B changes something else.
    await pb.goto(B.url('#/settings'));
    await pb.getByRole('radio', { name: 'Sensitive' }).check();
    await expect.poll(async () => (await prefsInDb(email))?.sensitivity, { timeout: 15_000 }).toBe('sensitive');

    // 7. Later, the user opens TrichFree on A: it picks up B's change by itself (opening or refocusing a TrichFree
    //    page syncs when the last sync is over 15 seconds old; it also syncs every 15 minutes and on browser start)
    //    and keeps its own value for the field B did not touch.
    await A.sw.evaluate(async () => {
      const { accountState } = await chrome.storage.local.get('accountState');
      await chrome.storage.local.set({ accountState: { ...(accountState as object), lastSyncAt: Date.now() - 120_000 } }); // "a while later"
    });
    await pa.goto(A.url('#/settings'));
    await pa.reload();
    await expect(pa.getByRole('radio', { name: 'Sensitive' })).toBeChecked({ timeout: 15_000 });
    await expect(pa.getByRole('radio', { name: /Visual only/ })).toBeChecked();
    await pa.goto(A.url('#/home'));
    await expect(pa.getByText('Updated from your other device')).toBeVisible();
    // "Sync now" works too.
    await pa.goto(A.url('#/settings?section=account'));
    await pa.getByRole('button', { name: 'Sync now' }).click();
    await expect(pa.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });

    // Same field changed on both before syncing: the change that reached the server first is kept, and the
    // other laptop is told (never a silent overwrite).
    await pa.goto(A.url('#/settings'));
    await pb.goto(B.url('#/settings'));
    await A.sw.evaluate(() => chrome.alarms.clearAll()); // keep A from syncing on its own during this step
    await pb.getByLabel('Quiet time between reminders').selectOption('300');
    await expect.poll(async () => (await prefsInDb(email))?.cooldown_seconds, { timeout: 15_000 }).toBe(300);
    await pa.getByLabel('Quiet time between reminders').selectOption('5');
    await expect.poll(async () => (await prefsInDb(email))?.cooldown_seconds, { timeout: 15_000 }).toBe(300);
    await expect(pa.getByLabel('Quiet time between reminders')).toHaveValue('300', { timeout: 15_000 });
    await pa.goto(A.url('#/home'));
    await expect(pa.getByText('Changed on two devices at once')).toBeVisible();
  } finally {
    await A?.context.close();
    await B?.context.close();
  }
});

test('session restored after a browser restart; sign out returns to guest mode and keeps this computer\'s settings', async () => {
  const email = uniqueEmail('returner');
  const ext = await launch({ dist: DIST_E2E });
  let again: Ext | null = null;
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.goto(ext.url('#/settings?section=account'));
    await signInWithCode(page, email, mail);
    await expect(page.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });
    await page.getByRole('radio', { name: /Visual only/ }).check();
    await expect.poll(async () => (await prefsInDb(email))?.intervention, { timeout: 15_000 }).toBe('visual');
    await ext.context.close();

    // Same profile, new browser process: signed in from extension storage, no new code needed, and it syncs.
    again = await launch({ dist: DIST_E2E, userDataDir: ext.userDataDir });
    const p = await again.context.newPage();
    await p.goto(again.url('#/settings?section=account'));
    await expect(p.getByTestId('account-email')).toHaveText(email, { timeout: 15_000 });
    await p.getByRole('button', { name: 'Sync now' }).click();
    await expect(p.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });

    // Sign out: guest mode again, the session is gone from storage, and this computer keeps its settings.
    await p.getByRole('button', { name: 'Sign out' }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
    await expect(p.getByTestId('account-chip')).toContainText('Guest', { timeout: 15_000 });
    expect(await again.sw.evaluate(async () => Object.keys(await chrome.storage.local.get('tf-auth')).length)).toBe(0);
    await expect(p.getByRole('radio', { name: /Visual only/ })).toBeChecked();
  } finally {
    await again?.context.close();
    await ext.context.close().catch(() => {});
  }
});

test('account export and deletion from the extension', async () => {
  const email = uniqueEmail('leaver');
  const ext = await launch({ dist: DIST_E2E });
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.goto(ext.url('#/settings?section=account'));
    await signInWithCode(page, email, mail);
    await expect(page.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my account data' }).click()]);
    const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(exported.format).toBe('trichfree-account-export');
    expect(exported.account.email).toBe(email);
    expect(exported.preferences.intervention).toBeDefined();
    expect(JSON.stringify(exported)).not.toMatch(/landmark|episode|clip|frame/i);

    await page.getByRole('button', { name: 'Delete account…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByText('Your account and its data were deleted.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('account-chip')).toContainText('Guest');
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((u) => u.email === email)).toBe(false);
  } finally {
    await ext.context.close();
  }
});
