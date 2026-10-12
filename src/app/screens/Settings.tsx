import { useRef, useState } from 'react';
import type { ScreenProps } from '../App';
import type { OutputMode, Sensitivity } from '../../core/types';
import { backupFilename, deleteAllData, exportBackup, importBackup } from '../../shared/backup';
import { downloadBlob, pilotCsvs } from '../../shared/csvExport';
import { send } from '../../shared/messages';
import { pilotInfo, TEAM_EMAIL } from '../../shared/pilot';
import { telemetryConfigured } from '../../shared/uploadQueue';
import { SupportCard } from '../components/SupportCard';
import { ZonePicker } from '../components/ZonePicker';
import { Mochi } from '../components/Mochi';
import { mochiSays } from '../../shared/mochi';

export function Settings({ settings, update, go }: ScreenProps) {
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pilot = pilotInfo(settings);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const seg = <T extends string>(value: T, opts: [T, string][], set: (v: T) => void) => (
    <div className="seg" role="radiogroup">
      {opts.map(([id, label]) => <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => set(id)}>{label}</button>)}
    </div>
  );

  return (
    <div>
      <div className="card stack">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Mochi size={72} float={false} mood={settings.mochiTone === 'sassy' ? 'proud' : 'happy'} />
          <div><h2 style={{ margin: 0 }}>Mochi</h2><p className="small muted" style={{ margin: 0 }}>“{mochiSays('reminder', settings.mochiTone, { streak: 7 }, 1)}”</p></div>
        </div>
        <div className="row"><span>Personality</span><span className="spacer" />
          {seg<'sassy' | 'gentle'>(settings.mochiTone, [['sassy', 'Sassy'], ['gentle', 'Gentle']], (t) => update({ mochiTone: t }))}
        </div>
        <p className="small muted">Sassy Mochi teases you about showing up, never about pulling. About pulling, Mochi is always kind.</p>
        <div className="row"><span>Daily goal</span><span className="spacer" />
          {seg<string>(String(settings.dailyGoalMinutes), [['15', '15 min'], ['30', '30 min'], ['50', '50 min'], ['90', '90 min']], (g) => update({ dailyGoalMinutes: Number(g) }))}
        </div>
        <div className="row"><span>Daily reminder</span><span className="spacer" />
          <label className="check" style={{ padding: 0 }}><input type="checkbox" checked={!!settings.reminderTime} onChange={(e) => update({ reminderTime: e.target.checked ? '19:00' : null })} />On</label>
          {settings.reminderTime && <input type="time" aria-label="Reminder time" value={settings.reminderTime} onChange={(e) => e.target.value && update({ reminderTime: e.target.value })} />}
        </div>
        <p className="small muted">Mochi only nudges you if you haven’t sat down yet that day.</p>
      </div>

      <div className="card stack">
        <h2>Alerts</h2>
        <div className="row"><span>Sound</span><span className="spacer" />
          {seg<OutputMode>(settings.outputMode, [['speakers', 'Speakers'], ['earbuds', 'Earbuds'], ['chime_only', 'Chime only'], ['silent_log', 'Silent (log only)']],
            async (m) => { await update({ outputMode: m }); await send({ target: 'sw', type: 'SET_OUTPUT_MODE', mode: m }); })}
        </div>
        <div className="row"><span>Sensitivity</span><span className="spacer" />
          {seg<Sensitivity>(settings.sensitivity, [['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['sensitive', 'Sensitive']], (s) => update({ sensitivity: s }))}
        </div>
        <p className="small muted">Relaxed waits 2.5 s before speaking, Balanced 1.5 s, Sensitive 1 s.</p>
        <label className="check"><input type="checkbox" checked={settings.notifications} onChange={(e) => update({ notifications: e.target.checked })} />Show a quiet "Hands down?" notification with feedback buttons</label>
        <div className="row">
          <button onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Change keyboard shortcuts</button>
        </div>
      </div>

      <div className="card stack">
        <h2>Zones</h2>
        <ZonePicker value={settings.zones} onChange={(zones) => zones.length && update({ zones })} />
        <p className="small muted">If you add a new zone, re-calibrate so TrichFree learns how you reach there.</p>
        <div className="row">
          <button className="primary" onClick={() => go('calibrate')}>Re-calibrate</button>
          <button onClick={() => go('record')}>Re-record voice clips</button>
        </div>
      </div>

      <div className="card stack">
        <h2>Your data</h2>
        <p className="small muted">Everything is stored on this computer. A backup includes your voice clips and history.</p>
        <div className="row">
          <button onClick={async () => { downloadBlob(await exportBackup(), backupFilename()); flash('Backup downloaded.'); }}>Export backup (.zip)</button>
          <button onClick={() => fileRef.current?.click()}>Import backup…</button>
          <input ref={fileRef} type="file" accept=".zip" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { await importBackup(f); await send({ target: 'sw', type: 'SETTINGS_CHANGED' }); flash('Backup restored.'); setTimeout(() => location.reload(), 800); }
            catch (err) { flash((err as Error).message); }
          }} />
        </div>
        {!confirmDelete ? (
          <button className="danger" onClick={() => setConfirmDelete(true)}>Delete all my data…</button>
        ) : (
          <div className="card warn">
            <p>This removes your clips, calibration and history from this computer. It can't be undone.</p>
            {settings.participantCode && <p className="small">Pilot rows already sent can be deleted by the research team. Email {TEAM_EMAIL || 'the team'} with your code {settings.participantCode}.</p>}
            <div className="row">
              <button className="danger" onClick={async () => { await send({ target: 'sw', type: 'DESK_STOP' }); await deleteAllData(); location.hash = '#/welcome'; location.reload(); }}>Yes, delete everything</button>
              <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {settings.participantCode && (
        <div className="card stack">
          <h2>Pilot</h2>
          <p>Participant code <b>{settings.participantCode}</b>{pilot ? ` · ${pilot.banner}` : ''}</p>
          {telemetryConfigured ? (
            <label className="check"><input type="checkbox" checked={settings.pilotSharing} disabled={!settings.pilotConsent} onChange={(e) => update({ pilotSharing: e.target.checked })} />Send pilot data to the research team (never video, images or voice)</label>
          ) : <p className="small muted">This build has no research server, so pilot data stays here. Export it and email it to the team.</p>}
          <div className="row">
            <button onClick={async () => {
              const files = await pilotCsvs();
              for (const [name, csv] of Object.entries(files)) downloadBlob(new Blob([csv], { type: 'text/csv' }), name);
              flash('Pilot log downloaded.');
            }}>Export pilot log (CSV)</button>
          </div>
        </div>
      )}

      <div className="card stack">
        <h2>Advanced</h2>
        <label className="check"><input type="checkbox" checked={settings.debug} onChange={(e) => update({ debug: e.target.checked })} />Show the debug page (live overlay, landmark recorder)</label>
      </div>

      <SupportCard />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
