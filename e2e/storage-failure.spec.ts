// Release audit: when the browser refuses to store something (disk full, storage quota), the user is told and
// nothing already saved is lost. The failure is injected inside the page by making IndexedDB writes throw
// QuotaExceededError, as a full disk does.
import { expect, test } from '@playwright/test';
import { firstPage, launch, onboard } from './helpers';

test('voice: a recording that cannot be stored says so, and the previous recording is kept', async () => {
  const ext = await launch();
  try {
    const page = await firstPage(ext);
    await onboard(page);
    await page.goto(ext.url('#/voice'));
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Notice' }) });
    const record = async (name: string) => {
      await card.getByRole('button', { name }).click();
      await expect(card.getByText(/Recording…/)).toBeVisible();
      await page.waitForTimeout(2500); // the fake microphone beeps every second
      await card.getByRole('button', { name: 'Stop recording' }).click();
      await expect(card.getByText('Listen back. Keep it if it sounds right.')).toBeVisible({ timeout: 15_000 });
    };
    await record('Record: Notice');
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText('Saved', { exact: true })).toBeVisible();

    // Re-record, then the disk is full when saving.
    await record('Re-record: Notice');
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      (window as unknown as { __restorePut: () => void }).__restorePut = () => { IDBObjectStore.prototype.put = put; };
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'clips') throw new DOMException('The disk is full', 'QuotaExceededError');
        return put.apply(this, a);
      };
    });
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText(/could not be saved/i)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Save' })).toBeVisible(); // can try again
    expect(await page.evaluate(async () => {
      const req = indexedDB.open('trichfree');
      const dbh = await new Promise<IDBDatabase>((ok) => { req.onsuccess = () => ok(req.result); });
      const n = await new Promise<number>((ok) => { const r = dbh.transaction('clips').objectStore('clips').count(); r.onsuccess = () => ok(r.result); });
      dbh.close();
      return n;
    })).toBe(1); // the earlier recording survived the failed save

    // Space again: saving now works.
    await page.evaluate(() => (window as unknown as { __restorePut: () => void }).__restorePut());
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText('Saved', { exact: true })).toBeVisible();
  } finally {
    await ext.context.close();
  }
});
