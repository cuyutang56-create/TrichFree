// Which web origins may talk to the extension (chrome.runtime.onMessageExternal). Pure, so it is unit-tested.
import { WEBSITE_URL } from './config';

/** Exact origin match with the configured website; local http origins only in dev/test builds. */
export function bridgeAllowed(
  origin: string | undefined,
  site = WEBSITE_URL,
  devBridge = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEV_BRIDGE === 'true',
): boolean {
  if (!origin) return false;
  try {
    if (site && origin === new URL(site).origin) return true;
    const u = new URL(origin);
    return devBridge && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}
