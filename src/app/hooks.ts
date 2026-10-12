// React hooks over the extension's shared state. Settings and clips are Dexie live queries, so a change made in
// another context (the popup, the service worker after a sync, another tab) shows up without a reload.
import { liveQuery } from 'dexie';
import { useCallback, useEffect, useState } from 'react';
import { db, getSettings, setSettings, type AppSettings, type ClipRow } from '../shared/db';
import {
  INITIAL_ACCOUNT, INITIAL_DESK, onAccountChange, onDeskChange, readAccount, readDesk, send,
  type AccountState, type DeskState,
} from '../shared/messages';

function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [v, setV] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setV, error: (e) => console.warn('[liveQuery]', e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

export function useSettings(): AppSettings | undefined {
  return useLive(() => getSettings());
}

export function useClips(): ClipRow[] | undefined {
  return useLive(() => db.clips.orderBy('createdAt').toArray());
}

/** Save settings and tell the service worker (which updates the running detector and schedules a sync). */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  await setSettings(patch);
  await send({ target: 'sw', type: 'SETTINGS_CHANGED' });
}

export function useDesk(): DeskState {
  const [d, setD] = useState<DeskState>(INITIAL_DESK);
  useEffect(() => {
    void readDesk().then(setD);
    return onDeskChange(setD);
  }, []);
  return d;
}

export function useAccount(): AccountState {
  const [a, setA] = useState<AccountState>(INITIAL_ACCOUNT);
  useEffect(() => {
    void readAccount().then(setA);
    return onAccountChange(setA);
  }, []);
  return a;
}

export function useToast(): [string, (m: string) => void] {
  const [t, setT] = useState('');
  const flash = useCallback((m: string) => {
    setT(m);
    window.setTimeout(() => setT((cur) => (cur === m ? '' : cur)), 3500);
  }, []);
  return [t, flash];
}

export type CamPermission = PermissionState | 'unknown';
/** Camera permission for the extension's origin, kept up to date. */
export function useCameraPermission(): CamPermission {
  const [p, setP] = useState<CamPermission>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setP(status.state);
    navigator.permissions?.query({ name: 'camera' as PermissionName }).then((s) => { status = s; update(); s.addEventListener('change', update); }).catch(() => setP('unknown'));
    return () => status?.removeEventListener('change', update);
  }, []);
  return p;
}

/**
 * Ask for the camera from this visible page. The hidden offscreen document cannot show a permission prompt,
 * so monitoring needs the extension to hold a persistent grant first.
 */
export async function requestCamera(): Promise<{ ok: true } | { ok: false; reason: 'denied' | 'missing' | 'busy' }> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    const name = (e as DOMException).name;
    return { ok: false, reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'busy' };
  }
}

/** Starts monitoring, asking for the camera on this page first if needed. */
export async function startMonitoring(): Promise<{ ok: true } | { ok: false; message: string }> {
  const cam = await requestCamera();
  if (!cam.ok) {
    return {
      ok: false,
      message: cam.reason === 'denied' ? 'The camera is blocked for TrichFree. Allow it in the browser’s site settings, then try again.'
        : cam.reason === 'missing' ? 'No camera was found. Connect a camera and try again.'
        : 'The camera is in use by another app. Close it and try again.',
    };
  }
  await send({ target: 'sw', type: 'DESK_START' });
  return { ok: true };
}
