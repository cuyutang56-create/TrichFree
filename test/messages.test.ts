import { describe, expect, it, vi } from 'vitest';

// Minimal chrome.runtime / chrome.storage stubs to exercise the typed message helpers.
type Listener = (msg: unknown, sender: unknown, reply: (r?: unknown) => void) => boolean | void;
const listeners: Listener[] = [];
const storage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  runtime: {
    onMessage: { addListener: (l: Listener) => listeners.push(l), removeListener: (l: Listener) => listeners.splice(listeners.indexOf(l), 1) },
    sendMessage: (msg: unknown) => new Promise((resolve, reject) => {
      let handled = false;
      for (const l of [...listeners]) { const keep = l(msg, {}, (r) => { handled = true; resolve(r); }); if (keep === true) handled = true; }
      if (!handled) reject(new Error('Could not establish connection. Receiving end does not exist.'));
    }),
  },
  storage: { local: { get: async (k: string) => ({ [k]: storage[k] }) }, onChanged: { addListener: () => {}, removeListener: () => {} } },
});

const { isMsg, on, readDesk, send, INITIAL_DESK } = await import('../src/shared/messages');

describe('messages', () => {
  it('routes by target and replies asynchronously', async () => {
    const sw = vi.fn(async () => ({ ok: true }));
    const off = on('sw', sw);
    const offscreen = vi.fn();
    const off2 = on('offscreen', offscreen);
    await expect(send({ target: 'sw', type: 'DESK_START' })).resolves.toEqual({ ok: true });
    expect(sw).toHaveBeenCalledWith({ target: 'sw', type: 'DESK_START' });
    expect(offscreen).not.toHaveBeenCalled();
    off(); off2();
  });
  it('send never throws when nobody listens', async () => {
    await expect(send({ target: 'offscreen', type: 'OFF_STOP' })).resolves.toBeUndefined();
  });
  it('ignores foreign messages', () => {
    expect(isMsg({ type: 'X' })).toBe(false);
    expect(isMsg({ target: 'page', type: 'X' })).toBe(false);
    expect(isMsg({ target: 'ui', type: 'OVERLAY' })).toBe(true);
  });
  it('readDesk merges defaults', async () => {
    storage.deskState = { wanted: true, fps: 12 };
    expect(await readDesk()).toEqual({ ...INITIAL_DESK, wanted: true, fps: 12 });
  });
});
