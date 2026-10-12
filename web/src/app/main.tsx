import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import '../site.css';
import './account.css';
import { accountsAvailable, supabase } from './supabase';
import {
  addReflection, deleteAccount, deleteReflection, exportAccountData, friendlyAuthError, listReflections,
  sendSignInCode, verifySignInCode, REFLECTION_MAX, type Reflection,
} from '../../../src/sync/remote';
import { PREF_LABELS } from '../../../src/sync/prefs';
import { ConfirmDialog, Notice, Seg, Toast } from '../../../src/ui/controls';
import { PreferencesForm } from '../../../src/ui/PreferencesForm';
import { SignInForm } from '../../../src/ui/SignInForm';
import { SiteHeader } from '../SiteHeader';
import { detectExtension, extensionRequest, type ExtensionStatus } from '../bridge';
import { usePrefs, type SaveState } from './usePrefs';

function useToast(): [string, (m: string) => void] {
  const [t, setT] = useState('');
  return [t, useCallback((m: string) => { setT(m); window.setTimeout(() => setT((c) => (c === m ? '' : c)), 4000); }, [])];
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { document.title = session ? 'Your account · TrichFree' : 'Sign in · TrichFree'; }, [session]);

  if (!accountsAvailable) {
    return (
      <main id="main" className="wrap narrow doc">
        <h1>Accounts</h1>
        <Notice tone="info">Accounts are not available on this copy of the website. TrichFree works fully without an account: everything stays on your computer.</Notice>
      </main>
    );
  }
  if (session === undefined) return <main id="main" className="wrap narrow doc"><p role="status">Loading…</p></main>;
  if (!session) return <SignIn />;
  return <Account session={session} />;
}

function SignIn() {
  return (
    <main id="main" tabIndex={-1} className="wrap narrow doc">
      <h1>Sign in or create an account</h1>
      <p>An account keeps your reminder settings in sync between computers and lets you save reflections. Your camera video and voice recordings never leave your device either way.</p>
      <div className="card">
        <SignInForm privacyHref="/privacy/"
          sendCode={(email) => sendSignInCode(supabase!, email)}
          verify={async (email, code) => { const r = await verifySignInCode(supabase!, email, code); return r.ok ? { ok: true } : r; }} />
      </div>
      <p className="small muted">New here? The same form creates your account. You can delete it, and everything in it, at any time.</p>
    </main>
  );
}

function Account({ session }: { session: Session }) {
  const client = supabase!;
  const [toast, flash] = useToast();
  const [ext, setExt] = useState<ExtensionStatus | null | undefined>(undefined);
  const nudgeExtension = useCallback(() => { if (ext) void extensionRequest(ext.id, 'SYNC_NOW'); }, [ext]);
  const p = usePrefs(client, session.user.id, nudgeExtension);

  useEffect(() => { void detectExtension().then(setExt); }, []);

  return (
    <main id="main" tabIndex={-1} className="wrap account">
      <div className="row account-head">
        <div>
          <h1>Your account</h1>
          <p className="muted" style={{ margin: 0 }}>Signed in as <strong data-testid="web-email">{session.user.email}</strong></p>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={async () => { await client.auth.signOut(); flash('Signed out.'); }}>Sign out</button>
      </div>

      <ExtensionCard ext={ext} onRefresh={() => void detectExtension().then(setExt)} flash={flash} />

      <section aria-labelledby="prefs-h" className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
        <div className="row">
          <h2 id="prefs-h">Your settings</h2>
          <span className="spacer" />
          <SaveBadge state={p.state} />
        </div>
        <p className="small muted">These follow you to every computer where you sign in to the TrichFree extension. Voice recordings and camera calibration stay on each computer.</p>
        {p.message && p.state !== 'saved' && <Notice tone="warn" action={<button className="btn" onClick={() => void p.retry()}>Try again</button>}>{p.message}</Notice>}
        {p.notice && (
          <Notice tone={p.notice.kind === 'conflict' ? 'warn' : 'info'} title={p.notice.kind === 'conflict' ? 'Changed on two devices at once' : 'Updated from your other device'}
            action={<button className="btn ghost" onClick={p.dismissNotice}>Dismiss</button>}>
            {p.notice.kind === 'conflict' ? 'We kept the other device’s choice for: ' : ''}{p.notice.keys.map((k) => PREF_LABELS[k]).join(', ')}
          </Notice>
        )}
        {p.prefs ? <PreferencesForm prefs={p.prefs} onChange={p.change} /> : <p role="status">Loading your settings…</p>}
      </section>

      <Reflections flash={flash} />
      <DataCard flash={flash} />
      <Toast text={toast} />
    </main>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const map: Record<SaveState, [string, string]> = {
    loading: ['', 'Loading…'], saved: ['ok', 'All changes saved'], saving: ['accent', 'Saving…'], offline: ['warn', 'Offline: not saved yet'], error: ['danger', 'Not saved'],
  };
  const [tone, text] = map[state];
  return <span className={`pill ${tone}`} role="status" data-testid="save-state"><span className="dot" aria-hidden="true" />{text}</span>;
}

function ExtensionCard({ ext, onRefresh, flash }: { ext: ExtensionStatus | null | undefined; onRefresh: () => void; flash: (m: string) => void }) {
  return (
    <section className="card" aria-labelledby="ext-h">
      <h2 id="ext-h">TrichFree extension</h2>
      {ext === undefined ? <p role="status">Checking this browser…</p> : ext ? (
        <>
          <p data-testid="ext-status">Installed in this browser (version {ext.version}). Monitoring is <strong>{ext.monitoring ? 'on' : 'off'}</strong>. {ext.signedIn ? 'It is signed in, so your settings sync.' : 'Sign in inside the extension to sync your settings.'}</p>
          <div className="row">
            <button className="btn" onClick={async () => { await extensionRequest(ext.id, 'OPEN'); }}>Open the extension</button>
            {ext.monitoring && <button className="btn" onClick={async () => { await extensionRequest(ext.id, 'STOP'); flash('Monitoring stopped.'); onRefresh(); }}>Stop monitoring</button>}
          </div>
        </>
      ) : (
        <>
          <p>The extension is not installed in this browser (or this browser does not support it). The everyday version of TrichFree runs as an extension in Chrome or Edge.</p>
          <div className="row"><a className="btn" href="/#extension">How to get it</a><a className="btn ghost" href="/try/">Try the in-browser demo</a></div>
        </>
      )}
    </section>
  );
}

function Reflections({ flash }: { flash: (m: string) => void }) {
  const client = supabase!;
  const [items, setItems] = useState<Reflection[] | null>(null);
  const [body, setBody] = useState('');
  const [rating, setRating] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setItems(await listReflections(client)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setItems([]); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const left = REFLECTION_MAX - [...body].length;
  return (
    <section className="card stack" aria-labelledby="refl-h">
      <h2 id="refl-h">Reflections <span className="muted small">(optional)</span></h2>
      <p className="small muted">A private place to note what helped or what was hard. Saved to your account only when you choose to save one, and you can delete them any time.</p>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
          const r = await addReflection(client, body, rating ? Number(rating) : null);
          setItems((cur) => [r, ...(cur ?? [])]);
          setBody(''); setRating('');
          flash('Reflection saved.');
        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        setBusy(false);
      }}>
        <div className="field">
          <label htmlFor="refl-body">Today’s reflection</label>
          <textarea id="refl-body" value={body} onChange={(e) => setBody(e.target.value)} aria-describedby="refl-help" />
          <span id="refl-help" className={left < 0 ? 'error' : 'help'}>{left >= 0 ? `${left} characters left` : `Please shorten this by ${-left} characters.`}</span>
        </div>
        <div className="field">
          <span className="label">How useful were the reminders today? <span className="muted">(optional)</span></span>
          <Seg<string> label="Usefulness of reminders" value={rating} onChange={setRating} options={[['1', '1 Not at all'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 Very']]} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || !body.trim() || left < 0}>Save reflection</button>
        </div>
      </form>
      {items === null ? <p role="status">Loading…</p> : items.length === 0 ? <p className="muted small">No reflections yet.</p> : (
        <ul className="reflections">
          {items.map((r) => (
            <li key={r.id} className="card soft">
              <p className="small muted" style={{ margin: 0 }}>{new Date(r.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{r.usefulness ? ` · reminders rated ${r.usefulness}/5` : ''}</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
              <button className="btn ghost" onClick={() => setConfirm(r.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      {confirm && (
        <ConfirmDialog title="Delete this reflection?" confirmLabel="Delete" danger onCancel={() => setConfirm(null)} onConfirm={async () => {
          const id = confirm;
          setConfirm(null);
          try { await deleteReflection(client, id); setItems((cur) => (cur ?? []).filter((x) => x.id !== id)); flash('Reflection deleted.'); }
          catch (e) { flash(e instanceof Error ? e.message : String(e)); }
        }}>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function DataCard({ flash }: { flash: (m: string) => void }) {
  const client = supabase!;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card stack" aria-labelledby="data-h">
      <h2 id="data-h">Your data</h2>
      <p className="small">Your account stores your email address, your settings and any reflections you saved. Camera video, voice recordings and your reminder history are never stored here.</p>
      <div className="row">
        <button className="btn" onClick={async () => {
          try {
            const data = await exportAccountData(client);
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `trichfree-account-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 5000);
            flash('Your data was downloaded.');
          } catch (e) { flash(e instanceof Error ? e.message : String(e)); }
        }}>Download my data (JSON)</button>
        <button className="btn danger" onClick={() => setConfirm(true)}>Delete my account…</button>
      </div>
      {confirm && (
        <ConfirmDialog title="Delete your account?" confirmLabel="Delete account" danger busy={busy} onCancel={() => setConfirm(false)} onConfirm={async () => {
          setBusy(true);
          try { await deleteAccount(client); }
          catch (e) { setBusy(false); setConfirm(false); flash(friendlyAuthError(e instanceof Error ? e.message : String(e))); return; }
          setBusy(false);
          setConfirm(false);
          flash('Your account and its data were deleted.');
        }}>
          <p>This permanently deletes your account, settings and reflections. It cannot be undone.</p>
          <p className="small muted">Data on your computers (voice recordings, history, calibration) is not affected; delete it from the extension’s Settings. Copies in our provider’s encrypted backups expire within their retention window.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<><SiteHeader right={<li><a className="btn" href="/try/">Try TrichFree</a></li>} /><App /></>);
