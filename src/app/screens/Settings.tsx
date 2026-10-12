import { useEffect, useRef, useState } from 'react';
import type { ScreenProps } from '../App';
import { localDate } from '../../core/arms';
import { backupFilename, deleteAllData, exportBackup, importBackup } from '../../shared/backup';
import { ACCOUNTS_CONFIGURED, WEBSITE_URL } from '../../shared/config';
import { COPY } from '../../shared/copy';
import { downloadBlob, pilotCsvs } from '../../shared/csvExport';
import { pickSynced } from '../../shared/db';
import { send, type AccountReply, type AccountState } from '../../shared/messages';
import { PARTICIPANT_CODE_RE, TEAM_EMAIL, normaliseParticipantCode, pilotInfo } from '../../shared/pilot';
import { telemetryConfigured } from '../../shared/uploadQueue';
import { ConfirmDialog, Notice, Switch, Toast } from '../../ui/controls';
import { PreferencesForm } from '../../ui/PreferencesForm';
import { SignInForm } from '../../ui/SignInForm';
import { SupportCard } from '../components/SupportCard';
import { updateSettings, useAccount, useClips, useToast } from '../hooks';
import { testReminder } from '../testReminder';
import type { PrefKey, SyncedPrefs } from '../../sync/prefs';

const privacyHref = WEBSITE_URL ? `${WEBSITE_URL}/privacy/` : undefined;

export function Settings({ settings, go }: ScreenProps) {
  const account = useAccount();
  const clips = useClips() ?? [];
  const [toast, flash] = useToast();
  const [testNote, setTestNote] = useState('');

  useEffect(() => {
    const section = new URLSearchParams(location.hash.split('?')[1] ?? '').get('section');
    if (section) document.getElementById(`section-${section}`)?.scrollIntoView({ block: 'start' });
  }, []);

  const change = async <K extends PrefKey>(key: K, value: SyncedPrefs[K]) => {
    try { await updateSettings({ [key]: value } as Partial<SyncedPrefs>); }
    catch (e) { flash(e instanceof Error ? e.message : 'Could not save that setting.'); }
  };

  return (
    <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
      <h1>Settings</h1>
      {account.signedIn && <p className="small muted">Reminder, detection, companion and accessibility settings sync to your account. Voice recordings, calibration and the research pilot stay on this device.</p>}
      <PreferencesForm prefs={pickSynced(settings)} onChange={(k, v) => void change(k, v)}
        slots={{
          afterVolume: (
            <div className="row">
              <button className="btn" onClick={async () => setTestNote(await testReminder(settings, clips))}>Test reminder</button>
              {testNote && <span className="small" role="status">{testNote}</span>}
            </div>
          ),
          afterIntervention: settings.intervention === 'voice' ? (
            <p className="small">{clips.length ? `${clips.length} voice recording${clips.length > 1 ? 's' : ''} on this device.` : 'No voice recordings on this device yet: the chime plays instead.'} <a href="#/voice">Manage recordings</a></p>
          ) : undefined,
          afterZones: (
            <div className="row">
              <button className="btn" onClick={() => go('tune')}>{settings.activeCalibrationId ? 'Redo the tune-up' : 'Tune up for this camera (2 min)'}</button>
              <button className="btn ghost" onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Keyboard shortcuts</button>
            </div>
          ),
        }} />

      <AccountPanel account={account} flash={flash} />
      <DataPanel signedIn={account.signedIn} flash={flash} />
      <PilotPanel settings={settings} flash={flash} />
      <SupportCard />

      <section className="card" aria-labelledby="adv-h">
        <h2 id="adv-h">Advanced</h2>
        <Switch label="Lighter detection on this computer" hint="Checks the camera about 8 times a second instead of 15. Uses less processor and battery; a reminder may come a moment later."
          checked={settings.lighterDetection} onChange={(v) => void updateSettings({ lighterDetection: v })} />
        <Switch label="Show the debug page" hint="Live landmark overlay and a landmark-only recorder for tuning." checked={settings.debug} onChange={(v) => void updateSettings({ debug: v })} />
      </section>
      <Toast text={toast} />
    </div>
  );
}

function AccountPanel({ account, flash }: { account: AccountState; flash: (m: string) => void }) {
  const [confirm, setConfirm] = useState<'signout' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ACCOUNTS_CONFIGURED) {
    return (
      <section className="card" id="section-account" aria-labelledby="acct-h">
        <h2 id="acct-h">Account</h2>
        <p className="small muted">This build runs in guest mode only: everything is saved on this device. (Accounts need a server configured at build time.)</p>
      </section>
    );
  }
  const lastSync = account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
  const syncText: Record<AccountState['sync'], string> = {
    idle: 'Not synced yet', syncing: 'Syncing…', ok: 'Up to date', offline: 'Offline: changes will sync when you are back online',
    error: 'Sync problem', auth: 'Signed out by the server: please sign in again',
  };
  return (
    <section className="card stack" id="section-account" aria-labelledby="acct-h">
      <h2 id="acct-h">Account &amp; sync</h2>
      {!account.signedIn ? (
        <>
          <p className="small">You are in <strong>guest mode</strong>: settings are saved on this device only. Sign in or create a free account to keep your reminder settings in sync across computers.</p>
          <SignInForm privacyHref={privacyHref}
            sendCode={(email) => send({ target: 'sw', type: 'ACCOUNT_SEND_CODE', email }) as Promise<AccountReply>}
            verify={(email, code) => send({ target: 'sw', type: 'ACCOUNT_VERIFY', email, code }) as Promise<AccountReply>}
            onDone={() => flash('Signed in. Your settings are syncing.')} />
        </>
      ) : (
        <>
          <dl className="kv">
            <dt>Signed in as</dt><dd data-testid="account-email">{account.email}</dd>
            <dt>Sync</dt><dd data-testid="sync-status">{syncText[account.sync]}</dd>
            <dt>Last synced</dt><dd>{lastSync}</dd>
            {account.pending.length > 0 && <><dt>Waiting to sync</dt><dd>{account.pending.length} change{account.pending.length > 1 ? 's' : ''}</dd></>}
          </dl>
          {account.message && account.sync !== 'ok' && <Notice tone="warn">{account.message}</Notice>}
          <div className="row">
            <button className="btn" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = (await send({ target: 'sw', type: 'SYNC_NOW' })) as AccountReply;
              setBusy(false);
              flash(r?.ok ? 'Synced.' : r?.message ?? 'Could not sync.');
            }}>Sync now</button>
            <button className="btn" onClick={async () => {
              const r = (await send({ target: 'sw', type: 'ACCOUNT_EXPORT' })) as AccountReply;
              if (!r?.ok) { flash(r?.message ?? 'Export failed.'); return; }
              downloadBlob(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }), `trichfree-account-${localDate(Date.now())}.json`);
              flash('Account data downloaded.');
            }}>Download my account data</button>
            <button className="btn ghost" onClick={() => setConfirm('signout')}>Sign out</button>
            <button className="btn danger" onClick={() => setConfirm('delete')}>Delete account…</button>
          </div>
        </>
      )}
      {confirm === 'signout' && (
        <ConfirmDialog title="Sign out?" confirmLabel="Sign out" busy={busy} onCancel={() => setConfirm(null)} onConfirm={async () => {
          setBusy(true);
          await send({ target: 'sw', type: 'ACCOUNT_SIGN_OUT' });
          setBusy(false); setConfirm(null); flash('Signed out. This device keeps working in guest mode.');
        }}>
          <p>This device keeps its current settings and works in guest mode.</p>
          {account.pending.length > 0 && <p><strong>{account.pending.length} change{account.pending.length > 1 ? 's have' : ' has'} not synced yet</strong> and will stay on this device only.</p>}
        </ConfirmDialog>
      )}
      {confirm === 'delete' && (
        <ConfirmDialog title="Delete your account?" confirmLabel="Delete account" danger busy={busy} onCancel={() => setConfirm(null)} onConfirm={async () => {
          setBusy(true);
          const r = (await send({ target: 'sw', type: 'ACCOUNT_DELETE' })) as AccountReply;
          setBusy(false); setConfirm(null);
          flash(r?.ok ? 'Your account and its data were deleted.' : r?.message ?? 'Could not delete the account.');
        }}>
          <p>This permanently deletes your account and everything saved in it: synced settings, your profile and any reflections. It cannot be undone.</p>
          <p className="small muted">Data on this computer (voice recordings, history, calibration) is not affected; you can delete it separately below. Copies in the provider’s encrypted backups expire within their retention window (see the privacy policy).</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function DataPanel({ signedIn, flash }: { signedIn: boolean; flash: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card stack" id="section-data" aria-labelledby="data-h">
      <h2 id="data-h">Data on this computer</h2>
      <ul className="small">
        <li><strong>Stays here:</strong> camera analysis (never saved), voice recordings, history of reminders, calibration and the personal model.</li>
        <li><strong>{signedIn ? 'Synced to your account' : 'With an account, synced'}:</strong> reminder, detection, companion and accessibility settings only.</li>
        <li><strong>Shared computer?</strong> Use your own browser profile: anyone using this profile can open TrichFree and see this data.</li>
      </ul>
      <p className="small muted">A backup file contains your voice recordings and history. Keep it somewhere private.</p>
      <div className="row">
        <button className="btn" onClick={async () => { downloadBlob(await exportBackup(), backupFilename()); flash('Backup downloaded.'); }}>Export backup (.zip)</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import backup…</button>
        <input ref={fileRef} type="file" accept=".zip" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            await importBackup(f);
            await send({ target: 'sw', type: 'SETTINGS_CHANGED' });
            flash(signedIn ? 'Backup restored. Your account settings still apply after the next sync.' : 'Backup restored.');
          } catch (err) { flash((err as Error).message); }
        }} />
        <button className="btn danger" onClick={() => setConfirm(true)}>Delete all data on this computer…</button>
      </div>
      {confirm && (
        <ConfirmDialog title="Delete everything on this computer?" confirmLabel="Delete everything" danger onCancel={() => setConfirm(false)} onConfirm={async () => {
          await send({ target: 'sw', type: 'DESK_STOP' });
          if (signedIn) await send({ target: 'sw', type: 'ACCOUNT_SIGN_OUT' });
          await deleteAllData();
          location.hash = '#/welcome';
          location.reload();
        }}>
          <p>This removes your voice recordings, history, calibration and settings from this computer, and signs this device out. It cannot be undone.</p>
          {signedIn && <p className="small">Your account itself is not deleted. Use “Delete account” above for that.</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}

function PilotPanel({ settings, flash }: { settings: ScreenProps['settings']; flash: (m: string) => void }) {
  const [code, setCode] = useState(settings.participantCode ?? '');
  const [agree, setAgree] = useState(false);
  const pilot = pilotInfo(settings);
  const norm = normaliseParticipantCode(code);
  const valid = PARTICIPANT_CODE_RE.test(norm);
  return (
    <section className="card stack" id="section-pilot" aria-labelledby="pilot-h">
      <h2 id="pilot-h">Research pilot</h2>
      {!settings.participantCode ? (
        <>
          <p className="small muted">Only if the TrichFree research team gave you a participant code (it looks like TF-K7QM-3XWD). Most people can skip this.</p>
          <div className="field" style={{ maxWidth: 240 }}>
            <label htmlFor="pilot-code">Participant code</label>
            <input id="pilot-code" type="text" value={code} maxLength={16} placeholder="TF-XXXX-XXXX" autoComplete="off" spellCheck={false}
              aria-invalid={!!norm && !valid} aria-describedby={norm && !valid ? 'pilot-code-err' : undefined} onChange={(e) => setCode(e.target.value)} />
            {norm && !valid && <span className="error" id="pilot-code-err">A code looks like TF-K7QM-3XWD: TF, then two groups of 4 letters or numbers.</span>}
          </div>
          {valid && (
            <>
              <p className="small">{COPY.pilotNotice}</p>
              {!telemetryConfigured && <p className="small muted">This build has no research server, so the pilot log stays on this computer. You can export it below and email it.</p>}
              <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to share this pilot data.</label>
              <button className="btn primary" disabled={!agree} onClick={async () => {
                await updateSettings({ participantCode: norm, pilotConsent: true, pilotSharing: true, enrolledDate: settings.enrolledDate ?? localDate(Date.now()) });
                flash('Joined the pilot. Thank you!');
              }}>Join the pilot</button>
            </>
          )}
        </>
      ) : (
        <>
          <p>Participant code <strong>{settings.participantCode}</strong>{pilot ? ` · ${pilot.banner}` : ''}</p>
          {telemetryConfigured
            ? <label className="check"><input type="checkbox" checked={settings.pilotSharing} disabled={!settings.pilotConsent} onChange={(e) => void updateSettings({ pilotSharing: e.target.checked })} />Send pilot data to the research team (never video, images or voice)</label>
            : <p className="small muted">This build has no research server, so pilot data stays here. Export it and email it to the team.</p>}
          <div className="row">
            <button className="btn" onClick={async () => {
              const files = await pilotCsvs();
              for (const [name, csv] of Object.entries(files)) downloadBlob(new Blob([csv], { type: 'text/csv' }), name);
              flash('Pilot log downloaded.');
            }}>Export pilot log (CSV)</button>
          </div>
          <p className="small muted">To delete pilot data already sent, email {TEAM_EMAIL || 'the research team'} with your code.</p>
        </>
      )}
    </section>
  );
}
