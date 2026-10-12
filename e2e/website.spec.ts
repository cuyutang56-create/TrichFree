// The public website, served from the accounts-enabled test build (dist-web-e2e) on 127.0.0.1:5174.
// Needs: `npx supabase start` and `node scripts/build-e2e.mjs`.
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adminClient, mailIds, readCode, uniqueEmail } from '../test/integration/env';
const mail = { mailIds, readCode };
import { firstPage, launch, onboard, signInWithCode } from './helpers';

const BASE = 'http://127.0.0.1:5174';
const WEB = resolve('dist-web-e2e');
const DIST_E2E = resolve('dist-e2e');
const ready = existsSync(`${WEB}/index.html`) && existsSync(`${DIST_E2E}/manifest.json`);
test.skip(!ready, 'needs: npx supabase start && node scripts/build-e2e.mjs');

let server: ChildProcess | null = null;
let browser: Browser;

// `vite preview` serves the same security headers a host applies from _headers (vite.web.config.ts), so any page
// that the strict Content-Security-Policy would break fails here, not in production.
const cspViolations: string[] = [];
function watchCsp(page: Page) {
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect|create|frame)/i.test(m.text())) cspViolations.push(`${page.url()}: ${m.text()}`);
  });
}
test.afterEach(() => {
  expect(cspViolations.splice(0), 'Content-Security-Policy violations').toEqual([]);
});

test.beforeAll(async () => {
  server = spawn('npx', ['vite', 'preview', '-c', 'vite.web.config.ts'], { env: { ...process.env, WEB_OUT_DIR: 'dist-web-e2e', VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (o) => { const p = await newPage(o); watchCsp(p); return p; };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (o) => { const c = await newContext(o); c.on('page', watchCsp); return c; };
});
test.afterAll(async () => {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid); } catch { /* already gone */ } }
});

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test('security headers: the real policy is served, and every page loads under it', async () => {
  const res = await fetch(`${BASE}/`);
  const csp = res.headers.get('content-security-policy') ?? '';
  for (const d of ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "object-src 'none'", "frame-ancestors 'none'"]) expect(csp).toContain(d);
  expect(csp).not.toContain('unsafe-inline');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('x-frame-options')).toBe('DENY');
  expect(res.headers.get('permissions-policy')).toContain('camera=(self)');
  for (const path of ['/', '/privacy/', '/try/', '/app/', '/404.html']) {
    const page = await browser.newPage();
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
    await page.close();
  }
});

test('landing page: every internal link and anchor leads somewhere real', async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A little reminder, right when you need it.');
  const hrefs = await page.$$eval('a[href]', (as) => as.filter((a) => !(a as HTMLElement).closest('[hidden]')).map((a) => a.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(15);
  for (const href of new Set(hrefs)) {
    if (href.startsWith('#')) {
      expect(await page.locator(href).count(), `anchor ${href}`).toBe(1);
    } else if (href.startsWith('/')) {
      const [path, hash] = href.split('#');
      const res = await page.request.get(`${BASE}${path}`);
      expect(res.status(), href).toBe(200);
      if (hash) {
        const p = await browser.newPage();
        await p.goto(`${BASE}${path}`);
        expect(await p.locator(`#${hash}`).count(), href).toBe(1);
        await p.close();
      }
    } else if (href.startsWith('tel:') || href.startsWith('mailto:')) {
      expect(href.length).toBeGreaterThan(6);
    } else {
      expect(href, 'external links use https').toMatch(/^https:\/\//);
    }
  }
  // Primary CTAs are real.
  await page.getByRole('link', { name: 'Try TrichFree' }).first().click();
  await expect(page).toHaveURL(`${BASE}/try/`);
  await page.close();
});

test('landing page on a phone: no sideways scrolling, and the menu works by keyboard and touch', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true });
  await page.goto(`${BASE}/`);
  expect(await noHorizontalScroll(page)).toBe(true);
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  for (const path of ['/privacy/', '/try/', '/app/']) {
    await page.goto(`${BASE}${path}`);
    expect(await noHorizontalScroll(page), path).toBe(true);
  }
  await page.close();
});

test('accessibility basics: no serious axe violations, one h1, skip link, labelled controls', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of ['/', '/privacy/', '/try/', '/app/']) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), path).toEqual([]);
    expect(await page.locator('h1').count(), path).toBe(1);
    expect(await page.getAttribute('html', 'lang')).toBe('en');
    // First Tab lands on the skip link, which moves focus to the main content.
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus'), path).toHaveText('Skip to content');
  }
  await context.close();
});

test('pilot interest form: validation, submission stored in the database, resubmission is silent', async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/#pilot`);
  const form = page.locator('#pilot-form');
  await form.getByLabel('Email', { exact: true }).fill('not-an-email');
  await form.getByRole('button', { name: 'Register interest' }).click();
  await expect(page.locator('#pilot-error')).toHaveText('Please enter a valid email address.');
  const email = uniqueEmail('pilot-web');
  await form.getByLabel('Email', { exact: true }).fill(email);
  await form.getByLabel('Someone with trichotillomania', { exact: true }).check();
  await form.getByLabel(/I am 18 or older/).check();
  await form.getByLabel(/TrichFree may email me/).check();
  await form.getByLabel(/Anything you would like us to know/).fill('Testing the pilot form.');
  await form.getByRole('button', { name: 'Register interest' }).click();
  await expect(page.locator('#pilot-done')).toBeVisible();
  const { data } = await adminClient().from('pilot_interest').select('role, note, age_confirmed, contact_consent').eq('email', email).single();
  expect(data).toEqual({ role: 'self', note: 'Testing the pilot form.', age_confirmed: true, contact_consent: true });
  // The same email again: the visitor sees the same thank-you (no way to learn who is on the list).
  await page.reload();
  await form.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
  await form.getByLabel('A parent or guardian', { exact: true }).check();
  await form.getByLabel(/I am 18 or older/).check();
  await form.getByLabel(/TrichFree may email me/).check();
  await form.getByRole('button', { name: 'Register interest' }).click();
  await expect(page.locator('#pilot-done')).toBeVisible();
  await page.close();
});

test('try page: the camera and the on-device detector start in the browser, nothing uploaded', async () => {
  const page = await browser.newPage();
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto(`${BASE}/try/`);
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
  await expect(page.getByText(/Running on this device/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/frames per second/)).toBeVisible({ timeout: 60_000 });
  expect(external, 'the demo makes no requests to other servers').toEqual([]);
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByRole('button', { name: 'Turn on camera' })).toBeVisible();
  await page.close();
});

test('web account: sign in with a code, change settings, reflections, export, delete', async () => {
  const email = uniqueEmail('web');
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(`${BASE}/app/`);
  await signInWithCode(page, email, mail);
  await expect(page.getByTestId('web-email')).toHaveText(email);
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved');

  // Settings are stored in the database (first change creates the row).
  await page.getByRole('radio', { name: 'Sensitive' }).check();
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved', { timeout: 15_000 });
  const uid = (await adminClient().auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email)!.id;
  await expect.poll(async () => (await adminClient().from('user_preferences').select('sensitivity, updated_by').eq('user_id', uid).maybeSingle()).data).toMatchObject({ sensitivity: 'sensitive', updated_by: expect.stringMatching(/^web:/) });

  // Reflections.
  await page.getByLabel('Today’s reflection').fill('The visual reminder felt kinder than the chime.');
  await page.getByRole('radio', { name: '4' }).check();
  await page.getByRole('button', { name: 'Save reflection' }).click();
  await expect(page.getByText('The visual reminder felt kinder than the chime.')).toBeVisible();

  // Export.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data (JSON)' }).click()]);
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported).toMatchObject({ format: 'trichfree-account-export', account: { email }, preferences: { sensitivity: 'sensitive' } });
  expect(exported.reflections).toHaveLength(1);

  // Delete the reflection, then the account.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No reflections yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible({ timeout: 15_000 });
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  expect(data.users.some((u) => u.email === email)).toBe(false);
  await page.close();
});

test('website and extension in one browser: detection, and a web change reaches the extension at once', async () => {
  const email = uniqueEmail('bridge');
  const ext = await launch({ dist: DIST_E2E });
  ext.context.on('page', watchCsp);
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.goto(ext.url('#/settings?section=account'));
    await signInWithCode(page, email, mail);
    await expect(page.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });

    const web = await ext.context.newPage();
    await web.goto(`${BASE}/app/`);
    await signInWithCode(web, email, mail);
    await expect(web.getByTestId('ext-status')).toContainText('Installed in this browser');
    await expect(web.getByTestId('ext-status')).toContainText('It is signed in');
    await expect(web.getByTestId('save-state')).toHaveText('All changes saved');

    // Change the reminder on the website: the website saves it, then nudges the extension to sync right away.
    await web.getByRole('radio', { name: /^Off/ }).check();
    await expect(web.getByTestId('save-state')).toHaveText('All changes saved', { timeout: 15_000 });
    await page.goto(ext.url('#/home'));
    await expect(page.getByRole('radio', { name: 'Off' })).toBeChecked({ timeout: 15_000 });

    // The website can stop monitoring but never start it.
    await expect(web.getByRole('button', { name: 'Open the extension' })).toBeVisible();
    const started = await web.evaluate(async (id) => new Promise((res) => (globalThis as unknown as { chrome: { runtime: { sendMessage: (i: string, m: unknown, cb: (r: unknown) => void) => void } } }).chrome.runtime.sendMessage(id, { type: 'DESK_START' }, res)), readFileSync('e2e/fixtures/extension-id.txt', 'utf8').trim());
    expect(started).toMatchObject({ ok: false });
  } finally {
    await ext.context.close();
  }
});
