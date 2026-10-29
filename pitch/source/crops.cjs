const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const DIST = '/tmp/claude-0/ra/repo/dist', OUT = process.argv[2];
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-')), {
    headless: true, executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = ctx.pages().find((p) => p.url().includes(id)) ?? (await ctx.waitForEvent('page'));
  await page.waitForLoadState();
  const url = (h) => `chrome-extension://${id}/src/app/index.html#/${h}`;
  const card = async (name, text) => {
    await page.waitForTimeout(800);
    const el = page.locator('section, .card, form, fieldset, div').filter({ has: page.getByRole('heading', { name: text, exact: true }) }).last();
    await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: `${OUT}/${name}.png` }); console.log('ok', name);
  };
  await page.screenshot({ path: `${OUT}/welcome.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Step 2 of 2').waitFor();
  await page.screenshot({ path: `${OUT}/choose.png` });
  await page.getByRole('button', { name: 'Start monitoring' }).click();
  await page.waitForURL(/#\/home/);
  await page.getByText(/^Watching/).first().waitFor({ timeout: 60000 }).catch(() => {});
  await card('monitoring', 'Monitoring');
  await page.goto(url('settings')); await card('detection', 'Detection'); await card('reminder', 'Reminder');
  await page.goto(url('voice')); await page.waitForTimeout(800);
  const grid = page.getByText('Notice', { exact: true }).first().locator('xpath=ancestor::*[contains(@class,"grid") or self::ul][1]');
  if (await grid.count()) { await grid.screenshot({ path: `${OUT}/voicecards.png` }); console.log('ok voicecards'); }
  await page.goto(url('insights')); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/insights.png`, fullPage: true });
  await ctx.close();
})();
