// Release audit: the website ↔ extension bridge under attack.
// Uses the production-like build (dist-e2e-strict: trusts only http://127.0.0.1:5174, no localhost dev bridge) and
// the guest build (dist: no externally_connectable at all). An "attacker" extension and an untrusted origin try to
// command TrichFree; the trusted origin sends unauthorized, malformed and parameter-smuggling messages.
// Needs: `npx supabase start`, `node scripts/build-e2e.mjs strict` and `npm run build`.
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mailIds, readCode, uniqueEmail } from '../test/integration/env';
import { onboard, signInWithCode } from './helpers';

const STRICT = resolve('dist-e2e-strict');
const GUEST = resolve('dist');
const ATTACKER = resolve('e2e/fixtures/attacker-extension');
const TRUSTED = 'http://127.0.0.1:5174';
const UNTRUSTED = 'http://127.0.0.1:5179';
test.skip(!existsSync(`${STRICT}/manifest.json`) || !existsSync(`${GUEST}/manifest.json`), 'needs: node scripts/build-e2e.mjs strict && npm run build');

let servers: Server[] = [];
test.beforeAll(async () => {
  const page = '<!doctype html><title>bridge test</title><p>origin under test</p>';
  servers = await Promise.all([5174, 5179].map((port) => new Promise<Server>((ok) => {
    const s = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); });
    s.listen(port, '127.0.0.1', () => ok(s));
  })));
});
test.afterAll(async () => { await Promise.all(servers.map((s) => new Promise((ok) => { s.closeAllConnections(); s.close(ok); }))); });

async function launchWith(dirs: string[]) {
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tf-bridge-')), {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${dirs.join(',')}`, `--load-extension=${dirs.join(',')}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const workers = new Map<string, Worker>();
  const deadline = Date.now() + 15_000;
  while (workers.size < dirs.length && Date.now() < deadline) {
    for (const w of context.serviceWorkers()) workers.set(new URL(w.url()).host, w);
    if (workers.size < dirs.length) await context.waitForEvent('serviceworker', { timeout: 2000 }).catch(() => {});
  }
  const byFile = (file: string) => [...workers.values()].find((w) => w.url().endsWith(file))!;
  const tf = byFile('service-worker-loader.js');
  return { context, tf, tfId: new URL(tf.url()).host, attacker: dirs.includes(ATTACKER) ? byFile('sw.js') : null };
}

/** The onboarding tab TrichFree opens on install (polled: a waitForEvent('page') can miss a tab that already opened). */
async function appPage(context: BrowserContext, id: string): Promise<Page> {
  let page: Page | undefined;
  await expect.poll(() => (page = context.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/src/app/`))) != null, { timeout: 15_000 }).toBe(true);
  return page!;
}

const desk = (sw: Worker) => sw.evaluate(async () => (await chrome.storage.local.get('deskState')).deskState as { wanted?: boolean } | undefined);
const offscreen = (sw: Worker) => sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] })).length);
const extTabs = (ctx: BrowserContext, id: string) => ctx.pages().filter((p) => p.url().startsWith(`chrome-extension://${id}/`)).map((p) => p.url());

/** Sends from a web page; resolves to the reply, or { err } when Chrome refuses. */
function fromPage(page: Page, id: string, msg: unknown) {
  return page.evaluate(([id, msg]) => new Promise<{ resp: unknown; err: string | null }>((ok) => {
    const rt = (globalThis as unknown as { chrome?: { runtime?: { sendMessage?: (...a: unknown[]) => void; lastError?: { message?: string } } } }).chrome?.runtime;
    if (!rt?.sendMessage) { ok({ resp: null, err: 'chrome.runtime.sendMessage is not available on this origin' }); return; }
    try {
      rt.sendMessage(id, msg, (resp: unknown) => ok({ resp: resp ?? null, err: rt.lastError?.message ?? null }));
      setTimeout(() => ok({ resp: null, err: 'timeout' }), 4000);
    } catch (e) { ok({ resp: null, err: String(e) }); }
  }), [id, msg] as const);
}

test('trusted origin: only PING / SYNC_NOW / OPEN / STOP work; nothing else, malformed or smuggled, has any effect', async () => {
  const { context, tf, tfId } = await test.step('launch', () => launchWith([STRICT]));
  try {
    const app = await test.step('find onboarding page', () => appPage(context, tfId));
    await test.step('onboard', () => onboard(app));
    await app.goto(`chrome-extension://${tfId}/src/app/index.html#/settings?section=account`);
    const email = uniqueEmail('bridge-attack');
    await signInWithCode(app, email, { mailIds, readCode });
    await expect(app.getByTestId('sync-status')).toHaveText('Up to date', { timeout: 15_000 });

    const site = await context.newPage();
    await site.goto(`${TRUSTED}/`);

    // PING tells the site only what it needs: no email, user id or token.
    const ping = await fromPage(site, tfId, { type: 'PING' });
    expect(ping.err).toBeNull();
    expect(Object.keys(ping.resp as object).sort()).toEqual(['monitoring', 'ok', 'signedIn', 'status', 'version']);
    expect(JSON.stringify(ping.resp)).not.toMatch(new RegExp(`${email.split('@')[0]}|eyJ|refresh|access_token|[0-9a-f]{8}-[0-9a-f]{4}-`, 'i'));

    const tabsBefore = extTabs(context, tfId).length;
    const unauthorized = [
      { type: 'START' }, { type: 'DESK_START' }, { target: 'sw', type: 'DESK_START' }, { type: 'TEST_VISUAL' },
      { type: 'ACCOUNT_SIGN_OUT' }, { target: 'sw', type: 'ACCOUNT_SIGN_OUT' }, { type: 'ACCOUNT_DELETE' }, { type: 'ACCOUNT_EXPORT' },
      { type: 'ACCOUNT_SEND_CODE', email: 'attacker@example.test' }, { type: 'SYNC_IF_STALE' }, { type: 'NOTICE_DISMISS' },
      { target: 'offscreen', type: 'OFF_START' }, { type: 'FEEDBACK', kind: 'i_pulled' }, { type: 'DESK_PAUSE', minutes: 1 },
    ];
    for (const m of unauthorized) {
      const r = await fromPage(site, tfId, m);
      expect((r.resp as { ok?: boolean } | null)?.ok, JSON.stringify(m)).not.toBe(true);
    }
    const malformed: unknown[] = [null, 42, 'PING', [], ['PING'], {}, { type: null }, { type: {} }, { type: ['PING'] }, { type: 'PING'.repeat(50_000) },
      { type: '__proto__' }, { type: 'constructor' }, { type: 'toString' }, { type: 'hasOwnProperty' }];
    for (const m of malformed) {
      const r = await fromPage(site, tfId, m);
      expect((r.resp as { ok?: boolean } | null)?.ok, JSON.stringify(m)?.slice(0, 40)).not.toBe(true);
    }
    // Deeply nested messages, built inside the page (Playwright itself cannot pass a 1000-deep argument).
    for (const depth of [200, 1000, 5000]) {
      const r = await site.evaluate(([id, depth]) => new Promise<{ ok?: boolean } | null>((ok) => {
        let m: Record<string, unknown> = { type: 'PING' };
        for (let i = 0; i < depth; i++) m = { inner: m };
        try { chrome.runtime.sendMessage(id, m, (resp) => ok(resp ?? null)); } catch { ok(null); }
        setTimeout(() => ok(null), 4000);
      }), [tfId, depth] as const);
      expect(r?.ok, `nested ${depth}`).not.toBe(true);
    }
    // Parameter smuggling: OPEN always opens the dashboard, whatever else is in the message.
    await fromPage(site, tfId, { type: 'OPEN', hash: '#/settings?section=account', url: 'https://evil.example/' });
    await expect.poll(() => extTabs(context, tfId).length).toBe(tabsBefore + 1);
    expect(extTabs(context, tfId).at(-1)).toMatch(/#\/home$/);

    // Nothing above had any effect: no camera, still signed in, no feedback logged, the worker still answers.
    expect((await desk(tf))?.wanted ?? false).toBe(false);
    expect(await offscreen(tf)).toBe(0);
    expect(await tf.evaluate(async () => !!(await chrome.storage.local.get('tf-auth'))['tf-auth'])).toBe(true);
    expect(await tf.evaluate(async () => ((await chrome.storage.local.get('accountState')).accountState as { signedIn?: boolean }).signedIn)).toBe(true);
    expect((await fromPage(site, tfId, { type: 'PING' })).resp).toMatchObject({ ok: true, signedIn: true });

    // An untrusted origin cannot even reach the extension.
    const evil = await context.newPage();
    await evil.goto(`${UNTRUSTED}/`);
    for (const m of [{ type: 'PING' }, { type: 'STOP' }]) {
      const r = await fromPage(evil, tfId, m);
      expect(r.resp).toBeNull();
      expect(r.err).not.toBeNull();
    }
  } finally {
    await context.close();
  }
});

test('another extension cannot command TrichFree, with or without a website configured', async () => {
  for (const dist of [GUEST, STRICT]) {
    const { context, tf, tfId, attacker } = await launchWith([dist, ATTACKER]);
    try {
      const app = await appPage(context, tfId);
      await onboard(app, 'start');
      await expect.poll(() => offscreen(tf), { timeout: 15_000 }).toBe(1);
      for (const m of [{ type: 'PING' }, { type: 'STOP' }, { type: 'SYNC_NOW' }, { type: 'OPEN' }]) {
        const r = await attacker!.evaluate(([id, msg]) => (self as unknown as { ask: (i: string, m: unknown) => Promise<{ resp: unknown; err: string | null }> }).ask(id, msg), [tfId, m] as const);
        expect((r.resp as { ok?: boolean } | null)?.ok, `${dist} ${m.type}`).not.toBe(true);
      }
      expect((await desk(tf))?.wanted).toBe(true);
      expect(await offscreen(tf)).toBe(1);
    } finally {
      await context.close();
    }
  }
});
