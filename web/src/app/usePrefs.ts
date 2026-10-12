// Preferences on the website, saved through the same sync engine as the extension (three-way merge +
// optimistic concurrency), so a stale browser tab can never overwrite newer settings from another device.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryStore, syncPreferences } from '../../../src/sync/engine';
import { DEFAULT_PREFS, type PrefKey, type SyncedPrefs } from '../../../src/sync/prefs';
import { supabaseRemote } from '../../../src/sync/remote';
import { webDeviceTag } from './supabase';

export type SaveState = 'loading' | 'saved' | 'saving' | 'offline' | 'error';
export interface PrefsNotice { kind: 'conflict' | 'remote'; keys: PrefKey[] }

export function usePrefs(client: SupabaseClient, userId: string, onSaved?: () => void) {
  const store = useRef(new MemoryStore({ prefs: { ...DEFAULT_PREFS }, base: null, dirty: {}, linkedUserId: null }));
  const [prefs, setPrefs] = useState<SyncedPrefs | null>(null);
  const [state, setState] = useState<SaveState>('loading');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<PrefsNotice | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const timer = useRef<number>();

  const run = useCallback(async (): Promise<void> => {
    if (running.current) { again.current = true; return running.current; }
    const job = (async () => {
      const hadChanges = Object.keys(store.current.snap.dirty).length > 0;
      if (hadChanges) setState('saving');
      const out = await syncPreferences(store.current, supabaseRemote(client), userId, webDeviceTag());
      setPrefs({ ...store.current.snap.prefs });
      if (out.kind === 'ok') {
        setState(Object.keys(store.current.snap.dirty).length ? 'saving' : 'saved');
        setMessage('');
        if (out.conflicts.length) setNotice({ kind: 'conflict', keys: out.conflicts });
        else if (out.fromRemote.length && !out.adoptedAccount) setNotice({ kind: 'remote', keys: out.fromRemote });
        if (out.pushed.length) onSaved?.();
      } else {
        setState(out.kind === 'offline' ? 'offline' : 'error');
        setMessage(out.message);
      }
    })();
    running.current = job;
    try { await job; } finally {
      running.current = null;
      if (again.current) { again.current = false; void run(); }
    }
  }, [client, userId, onSaved]);

  // Load, and pick up changes from other devices whenever the tab regains focus.
  useEffect(() => {
    void (async () => {
      try {
        const row = await supabaseRemote(client).get(userId);
        if (row) store.current.snap = { prefs: row.prefs, base: { version: row.version, prefs: row.prefs }, dirty: {}, linkedUserId: userId };
        setPrefs({ ...store.current.snap.prefs });
        setState('saved');
      } catch (e) {
        setPrefs({ ...store.current.snap.prefs });
        setState('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
    const onFocus = () => { if (store.current.snap.linkedUserId) void run(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [client, userId, run]);

  const change = useCallback(<K extends PrefKey>(key: K, value: SyncedPrefs[K]) => {
    store.current.set(key, value);
    setPrefs({ ...store.current.snap.prefs });
    setState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), 600);
  }, [run]);

  return { prefs, state, message, notice, dismissNotice: () => setNotice(null), change, retry: run };
}
