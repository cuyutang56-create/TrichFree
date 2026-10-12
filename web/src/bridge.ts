// Talks to the TrichFree extension if it is installed in this browser (Chrome/Edge only). The extension accepts
// messages only from the website's own origin and only these requests: PING, SYNC_NOW, OPEN, STOP.
// It never lets a web page start the camera.
import { SITE } from './config';

export interface ExtensionStatus { id: string; version: string; monitoring: boolean; status: string; signedIn: boolean }

type ChromeRuntime = { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: { message?: string } };
const runtime = (): ChromeRuntime | undefined => (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;

// A sleeping extension service worker can take a few seconds to wake up and answer.
function ask(id: string, msg: unknown, timeoutMs = 4000): Promise<unknown> {
  const rt = runtime();
  if (!rt?.sendMessage) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), timeoutMs);
    try {
      rt.sendMessage(id, msg, (r) => { clearTimeout(t); void rt.lastError; resolve(r); });
    } catch {
      clearTimeout(t);
      resolve(undefined);
    }
  });
}

export async function detectExtension(attempts = 2): Promise<ExtensionStatus | null> {
  if (!runtime()?.sendMessage) return null; // not Chrome/Edge, or no TrichFree extension that allows this site
  for (let a = 0; a < attempts; a++) {
    for (const id of SITE.extensionIds) {
      const r = (await ask(id, { type: 'PING' })) as { ok?: boolean; version?: string; monitoring?: boolean; status?: string; signedIn?: boolean } | undefined;
      if (r?.ok) return { id, version: r.version ?? '', monitoring: !!r.monitoring, status: r.status ?? 'off', signedIn: !!r.signedIn };
    }
  }
  return null;
}

export const extensionRequest = (id: string, type: 'SYNC_NOW' | 'OPEN' | 'STOP') => ask(id, { type }, 5000);
